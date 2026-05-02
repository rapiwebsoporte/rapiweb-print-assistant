/**
 * Lógica de impresión Windows.
 *
 * Para texto plano: genera un .txt en %TEMP% y ejecuta `print /D:"Impresora"`.
 * Para ESC/POS RAW: escribe los comandos crudos y los manda con `copy /b`.
 *
 * Soporta los dos modos porque algunos tickets (factura) traen HTML que requiere
 * ser renderizado distinto, mientras que la mayoría son texto plano formateado.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execAsync = promisify(exec);

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

/**
 * Imprime el ticket usando el comando `print` de Windows.
 * Devuelve cuando Windows acepta el trabajo (no cuando termina de imprimir).
 */
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
 */
export async function printRaw({ printerName, base64 }) {
  if (!printerName) throw new Error('No hay impresora configurada');
  if (!base64) throw new Error('Comandos RAW vacios');

  const buf = Buffer.from(base64, 'base64');
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
// Generador de contenido textual del ticket
// ============================================

export function generateTicketContent(ticket, paperWidth = 58) {
  const width = paperWidth === 58 ? 32 : 48;
  const divider = '='.repeat(width);
  const out = [];

  if (ticket.businessName) {
    out.push(centerText(ticket.businessName.toUpperCase(), width));
  }
  if (ticket.address) {
    out.push(centerText(ticket.address, width));
  }
  out.push(divider);

  if (ticket.orderNumber) out.push(`Pedido #${ticket.orderNumber}`);
  if (ticket.tableNumber) out.push(`Mesa: ${ticket.tableNumber}`);
  if (ticket.customerName) out.push(`Cliente: ${ticket.customerName}`);
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

  if (ticket.subtotal != null) {
    out.push(rightAlign(`Subtotal: $${formatPrice(ticket.subtotal)}`, width));
  }
  if (ticket.discount) {
    out.push(rightAlign(`Descuento: -$${formatPrice(ticket.discount)}`, width));
  }
  if (ticket.total != null) {
    out.push(rightAlign(`TOTAL: $${formatPrice(ticket.total)}`, width));
  }

  out.push(divider);

  if (ticket.paymentMethod) {
    out.push(centerText(`Pago: ${ticket.paymentMethod}`, width));
  }
  out.push(centerText('Gracias por su compra!', width));
  out.push('', '', '');

  return out.join('\n');
}

function centerText(text, width) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function rightAlign(text, width) {
  const pad = Math.max(0, width - text.length);
  return ' '.repeat(pad) + text;
}

function formatPrice(num) {
  const n = Number(num) || 0;
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
