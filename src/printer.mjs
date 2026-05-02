/**
 * Logica de impresion Windows + dispatcher por tipo de ticket.
 *
 * Tipos soportados (ticket_type):
 *   - 'receipt'      Ticket de venta (texto plano via comando print).
 *   - 'pre-account'  Pre-cuenta (mismo formato que receipt).
 *   - 'kitchen'      Comanda de cocina (texto plano grande, sin precios).
 *   - 'factura'      Factura fiscal AFIP (ESC/POS RAW con QR fiscal nativo).
 *   - 'raw'          Bytes ESC/POS arbitrarios (escape hatch).
 *
 * Operaciones Windows:
 *   - Texto plano: archivo .txt + `print /D:"Impresora"`.
 *   - ESC/POS:     archivo .bin + `copy /b "archivo" "Impresora"`.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EscPosBuilder } from './escpos.mjs';

const execAsync = promisify(exec);

// ============================================
// Operaciones Windows
// ============================================
export async function listPrinters() {
  try {
    const { stdout } = await execAsync('wmic printer get name', { timeout: 10_000 });
    return stdout
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch (err) {
    throw new Error('No se pudieron listar las impresoras de Windows: ' + err.message);
  }
}

export async function printText({ printerName, content }) {
  if (!printerName) throw new Error('No hay impresora configurada');
  if (!content) throw new Error('Contenido vacio');

  const tempFile = path.join(os.tmpdir(), `rapiweb_ticket_${Date.now()}.txt`);
  fs.writeFileSync(tempFile, content, 'utf8');

  try {
    await execAsync(`print /D:"${printerName}" "${tempFile}"`, { timeout: 30_000 });
  } catch (err) {
    throw new Error('Error de Windows al imprimir: ' + (err.stderr || err.message));
  } finally {
    setTimeout(() => {
      try { fs.unlinkSync(tempFile); } catch { /* noop */ }
    }, 5000);
  }
}

/**
 * Imprime bytes RAW (ESC/POS) con `copy /b` directo a la cola de impresion.
 * @param {object} arg
 * @param {string} arg.printerName Nombre de la impresora en Windows.
 * @param {string|Buffer} arg.data Bytes en base64 (string) o Buffer.
 */
export async function printRaw({ printerName, data, base64 }) {
  if (!printerName) throw new Error('No hay impresora configurada');
  const payload = data ?? base64;
  if (!payload) throw new Error('Datos RAW vacios');

  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'base64');
  const tempFile = path.join(os.tmpdir(), `rapiweb_raw_${Date.now()}.bin`);
  fs.writeFileSync(tempFile, buf);

  try {
    await execAsync(`copy /b "${tempFile}" "${printerName}"`, { timeout: 30_000 });
  } catch (err) {
    throw new Error('Error de Windows al imprimir RAW: ' + (err.stderr || err.message));
  } finally {
    setTimeout(() => {
      try { fs.unlinkSync(tempFile); } catch { /* noop */ }
    }, 5000);
  }
}

// ============================================
// Dispatcher por tipo
// ============================================
/**
 * Decide como imprimir segun el ticket_type y delega a la operacion Windows
 * adecuada (`printText` o `printRaw`).
 *
 * @param {object} arg
 * @param {string} arg.ticketType 'receipt' | 'kitchen' | 'pre-account' | 'factura' | 'raw'
 * @param {object} arg.payload    Datos del ticket (ver contrato en README).
 * @param {object} arg.config     Config del Print Assistant (printerName, paperWidth).
 */
export async function dispatchPrint({ ticketType, payload, config }) {
  const type = (ticketType || payload?.type || 'receipt').toLowerCase();
  const paperWidth = payload?.paperWidth || config.paperWidth || 58;

  if (type === 'raw') {
    const base64 = typeof payload?.raw === 'string' ? payload.raw : payload?.raw?.base64;
    if (!base64) throw new Error('payload.raw vacio');
    return printRaw({ printerName: config.printerName, base64 });
  }

  if (type === 'factura') {
    const buf = generateFacturaEscpos(payload, paperWidth);
    return printRaw({ printerName: config.printerName, data: buf });
  }

  if (type === 'kitchen') {
    const content = generateKitchenContent(payload, paperWidth);
    return printText({ printerName: config.printerName, content });
  }

  // receipt | pre-account | default
  const content = generateReceiptContent(payload, paperWidth);
  return printText({ printerName: config.printerName, content });
}

// ============================================
// Helpers de formato (texto plano)
// ============================================
function centerText(text, width) {
  const t = String(text || '');
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return ' '.repeat(pad) + t;
}

function rightAlign(text, width) {
  const t = String(text || '');
  const pad = Math.max(0, width - t.length);
  return ' '.repeat(pad) + t;
}

function formatPrice(num) {
  const n = Number(num) || 0;
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function widthForPaper(paperWidth) {
  return paperWidth === 58 ? 32 : 48;
}

// ============================================
// Generador: TICKET DE VENTA / PRE-CUENTA
// ============================================
export function generateReceiptContent(ticket, paperWidth = 58) {
  const width = widthForPaper(paperWidth);
  const divider = '='.repeat(width);
  const out = [];

  if (ticket.businessName) {
    out.push(centerText(ticket.businessName.toUpperCase(), width));
  }
  if (ticket.address) out.push(centerText(ticket.address, width));
  if (ticket.cuit) out.push(centerText('CUIT: ' + ticket.cuit, width));
  if (ticket.phone) out.push(centerText('Tel: ' + ticket.phone, width));
  out.push(divider);

  const recibo = ticket.isProvisional
    ? 'PROVISORIO'
    : String(ticket.receiptNumber || ticket.orderNumber || '').padStart(6, '0');
  out.push(`${ticket.isProvisional ? 'TICKET' : 'RECIBO'}: ${recibo}`);

  if (ticket.tableNumber != null) out.push(`Mesa: ${ticket.tableNumber}`);
  if (ticket.waiterName) out.push(`Mozo: ${ticket.waiterName}`);
  if (ticket.customerName) out.push(`Cliente: ${ticket.customerName}`);
  if (ticket.deliveryAddress) out.push(`Dir: ${ticket.deliveryAddress}`);
  if (ticket.serviceType) out.push(`Tipo: ${ticket.serviceType.toUpperCase()}`);
  if (ticket.date) out.push(`Fecha: ${ticket.date}`);
  out.push(divider);

  if (Array.isArray(ticket.items)) {
    for (const item of ticket.items) {
      const qty = (item.quantity ?? 1).toString().padEnd(3);
      const price = formatPrice((item.price ?? 0) * (item.quantity ?? 1));
      const name = (item.name || '').substring(0, width - 12);
      out.push(`${qty} ${name}`);
      out.push(`$${price}`.padStart(width));
      if (item.notes) out.push(`   > ${item.notes}`);
    }
  }

  out.push(divider);

  if (ticket.subtotal != null && ticket.discount) {
    out.push(rightAlign(`Subtotal: $${formatPrice(ticket.subtotal)}`, width));
  }
  if (ticket.discount) {
    out.push(rightAlign(`Descuento: -$${formatPrice(ticket.discount)}`, width));
  }
  if (ticket.total != null) {
    out.push(rightAlign(`TOTAL: $${formatPrice(ticket.total)}`, width));
  }

  if (Array.isArray(ticket.payments) && ticket.payments.length) {
    out.push(divider);
    out.push('DETALLE DE PAGOS');
    let abonado = 0;
    for (const p of ticket.payments) {
      const consumo = Number(p.amount) || 0;
      const interes = Number(p.surcharge) || 0;
      abonado += consumo + interes;
      out.push(`${p.date || ''} ${p.method || ''}${p.installments && p.installments > 1 ? ' x' + p.installments : ''}`);
      out.push(`  Consumo: $${formatPrice(consumo)}`);
      if (interes > 0) out.push(`  Interes: $${formatPrice(interes)}`);
    }
    out.push(rightAlign(`TOTAL ABONADO: $${formatPrice(abonado)}`, width));
  }

  out.push(divider);
  if (ticket.paymentMethod) out.push(centerText(`Pago: ${ticket.paymentMethod}`, width));
  out.push(centerText('* TICKET NO FISCAL *', width));
  out.push(centerText('Gracias por su visita!', width));
  out.push('', '', '');

  return out.join('\n');
}

// ============================================
// Generador: COMANDA DE COCINA
// ============================================
export function generateKitchenContent(ticket, paperWidth = 58) {
  const width = widthForPaper(paperWidth);
  const divider = '='.repeat(width);
  const dotted = '-'.repeat(width);
  const out = [];

  out.push(centerText('*** COMANDA ***', width));
  out.push(divider);

  const destino = ticket.tableNumber
    ? `MESA ${ticket.tableNumber}`
    : (ticket.customerName ? ticket.customerName.toUpperCase() : 'PARA LLEVAR');
  out.push(centerText(destino, width));
  out.push(divider);

  if (ticket.orderNumber) out.push(`Pedido #${ticket.orderNumber}`);
  if (ticket.waiterName) out.push(`Mozo: ${ticket.waiterName}`);
  if (ticket.date) out.push(`Hora:  ${ticket.date}`);
  out.push(dotted);

  let totalItems = 0;
  if (Array.isArray(ticket.items)) {
    for (const item of ticket.items) {
      const qty = Math.floor(Number(item.quantity) || 1);
      totalItems += qty;
      const name = (item.name || '').toUpperCase();
      out.push(`${qty}x  ${name}`);
      if (item.notes) {
        out.push(`     >> ${item.notes.toUpperCase()}`);
      }
      out.push('');
    }
  }

  out.push(divider);
  out.push(rightAlign(`TOTAL ITEMS: ${totalItems}`, width));
  out.push('', '', '');

  return out.join('\n');
}

// ============================================
// Generador: FACTURA AFIP (ESC/POS RAW)
// ============================================
const CBTE_NOMBRES = {
  1: 'FACTURA A', 2: 'NOTA DE DEBITO A', 3: 'NOTA DE CREDITO A',
  6: 'FACTURA B', 7: 'NOTA DE DEBITO B', 8: 'NOTA DE CREDITO B',
  11: 'FACTURA C', 12: 'NOTA DE DEBITO C', 13: 'NOTA DE CREDITO C',
};
const DOC_LABELS = { 80: 'CUIT', 96: 'DNI', 99: 'C.F.' };
const COND_IVA_LABELS = {
  responsable_inscripto: 'IVA Resp. Inscripto',
  monotributista: 'Monotributista',
  consumidor_final: 'Consumidor Final',
  exento: 'IVA Exento',
};

/**
 * Construye el QR fiscal AFIP segun RG 4291.
 * URL: https://www.afip.gob.ar/fe/qr/?p=<base64>
 */
function buildAfipQrUrl(factura, cuit) {
  const cuitNum = parseInt(String(cuit || '').replace(/-/g, ''), 10);
  const data = {
    ver: 1,
    fecha: factura.fecha_cbte,
    cuit: cuitNum,
    ptoVta: Number(factura.punto_venta),
    tipoCmp: Number(factura.tipo_cbte),
    nroCmp: Number(factura.numero_cbte),
    importe: Number(parseFloat(factura.importe_total).toFixed(2)),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: Number(factura.cliente_tipo_doc) || 99,
    nroDocRec: parseInt(String(factura.cliente_nro_doc || '0').replace(/-/g, ''), 10) || 0,
    tipoCodAut: 'E',
    codAut: parseInt(factura.cae, 10) || 0,
  };
  const b64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}

/**
 * Genera los bytes ESC/POS de una factura fiscal AFIP.
 *
 * payload = {
 *   businessName, razonSocial, address, cuit, phone, condicionIva,
 *   factura: { tipo_cbte, punto_venta, numero_cbte, fecha_cbte, cae, cae_vencimiento,
 *              cliente_tipo_doc, cliente_nro_doc, cliente_nombre, cliente_domicilio,
 *              cliente_condicion_iva, items: [...], importe_neto, importe_iva, importe_total }
 * }
 */
export function generateFacturaEscpos(payload, paperWidth = 80) {
  const width = widthForPaper(paperWidth);
  const f = payload?.factura || {};
  const tipoNombre = CBTE_NOMBRES[Number(f.tipo_cbte)] || 'COMPROBANTE';
  const letra = tipoNombre.split(' ').pop() || '';
  const nro = `${String(f.punto_venta || 0).padStart(4, '0')}-${String(f.numero_cbte || 0).padStart(8, '0')}`;
  const items = typeof f.items === 'string' ? JSON.parse(f.items) : (f.items || []);
  const esFacturaA = [1, 3].includes(Number(f.tipo_cbte));

  const fechaCbte = f.fecha_cbte
    ? new Date(f.fecha_cbte).toLocaleDateString('es-AR')
    : new Date().toLocaleDateString('es-AR');
  const caeVto = f.cae_vencimiento
    ? new Date(f.cae_vencimiento).toLocaleDateString('es-AR')
    : '';

  const qrUrl = buildAfipQrUrl(f, payload.cuit);

  const b = new EscPosBuilder();
  b.init().codepage(2);

  // ----- Header del comercio -----
  b.center();
  if (payload.businessName) {
    b.bold(true).size(1, 2).line(payload.businessName.toUpperCase()).size(1, 1).bold(false);
  }
  if (payload.razonSocial) b.line((payload.businessName ? 'de ' : '') + payload.razonSocial);
  if (payload.address) b.line(payload.address);
  if (payload.cuit) b.line('CUIT: ' + payload.cuit);
  if (payload.phone) b.line('Tel: ' + payload.phone);
  if (payload.condicionIva) {
    b.line(COND_IVA_LABELS[payload.condicionIva] || payload.condicionIva);
  }

  b.feed(1).divider(width, '=');

  // ----- Caja con la letra (A/B/C) y tipo de comprobante -----
  b.center().size(2, 3).bold(true).line(`[ ${letra} ]`).size(1, 1).bold(false);
  b.bold(true).line(tipoNombre).bold(false);
  b.line(`N: ${nro}`);
  b.line(`Fecha: ${fechaCbte}`);
  b.divider(width, '-');

  // ----- Cliente -----
  b.left();
  const docLabel = DOC_LABELS[Number(f.cliente_tipo_doc)] || 'Doc';
  const docVal = f.cliente_nro_doc === '0' || !f.cliente_nro_doc ? 'Consumidor Final' : f.cliente_nro_doc;
  b.line(`${docLabel}: ${docVal}`);
  b.line(`Cliente: ${f.cliente_nombre || 'Consumidor Final'}`);
  if (f.cliente_domicilio) b.line(`Dom: ${f.cliente_domicilio}`);
  if (f.cliente_condicion_iva) {
    b.line(`IVA: ${COND_IVA_LABELS[f.cliente_condicion_iva] || f.cliente_condicion_iva}`);
  }

  b.divider(width, '-');

  // ----- Items -----
  b.bold(true).line('DETALLE'.padEnd(width - 8) + 'IMPORTE').bold(false);
  b.divider(width, '-');
  for (const item of items) {
    const cant = Number(item.cantidad) || 1;
    const precio = Number(item.precio_unitario) || 0;
    const subtotal = Number(item.subtotal) || cant * precio;
    const desc = String(item.descripcion || item.nombre_snapshot || '').substring(0, width - 12);
    b.line(`${cant}x ${desc}`);
    b.line(rightAlign(`$${formatPrice(subtotal)}`, width));
  }

  b.divider(width, '-');

  // ----- Totales -----
  b.right();
  if (esFacturaA) {
    b.line(`Subtotal Neto: $${formatPrice(Number(f.importe_neto))}`);
    b.line(`IVA 21%: $${formatPrice(Number(f.importe_iva))}`);
  }
  b.bold(true).size(1, 2).line(`TOTAL: $${formatPrice(Number(f.importe_total))}`).size(1, 1).bold(false);
  b.left();

  b.divider(width, '=');

  // ----- CAE + QR fiscal -----
  b.center().bold(true).line(`CAE: ${f.cae || ''}`).bold(false);
  if (caeVto) b.line(`Vto. CAE: ${caeVto}`);
  b.feed(1);
  b.qr(qrUrl, { size: paperWidth === 58 ? 5 : 6, ec: 'M' });
  b.feed(1);
  b.line('Comprobante electronico - AFIP');
  b.feed(2);

  // ----- Corte -----
  b.cut(true, 3);

  return b.toBuffer();
}
