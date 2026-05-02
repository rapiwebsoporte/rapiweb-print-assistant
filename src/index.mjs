/**
 * RapiWeb Print Assistant v2 - entry point.
 *
 * Modos de ejecución:
 *
 *   1) Llamado por Windows con una URL del protocolo personalizado:
 *        RapiWebPrintAssistant.exe "rapiweb-print://print?job=...&t=...&api=..."
 *      -> Consume el job, imprime, ack, exit 0/1. Sin servidor HTTP.
 *
 *   2) Doble click sin argumentos:
 *      -> Muestra estado y un mini menu interactivo para configurar impresora.
 *
 *   3) Flag --config:
 *      -> Abre directamente el menu de configuracion.
 *
 * El binario reemplaza al print-bridge legacy (HTTP en localhost:9100), evitando
 * los bloqueos de Chrome Private Network Access y permisos de firewall.
 */

import readline from 'node:readline';
import { parseDeeplink } from './protocol.mjs';
import { fetchJob, ackJob } from './api-client.mjs';
import { listPrinters, printText, dispatchPrint, generateReceiptContent } from './printer.mjs';
import { loadConfig, saveConfig, getConfigPath, getAppRoot } from './config.mjs';

const APP_VERSION = '2.1.1';
const HOLD_OPEN_MS = 4000; // tiempo que la ventana queda visible al terminar

// ============================================
// Logging
// ============================================
function log(...args) {
  console.log(...args);
}
function logError(...args) {
  console.error(...args);
}

// ============================================
// Modo protocolo: invocado por Windows con URL
// ============================================
async function handleDeeplink(rawUrl) {
  log(`\n[print-assistant] recibido: ${rawUrl}`);

  const parsed = parseDeeplink(rawUrl);
  if (!parsed.ok) {
    logError('[print-assistant] URL invalida:', parsed.error);
    await holdOpen();
    process.exit(2);
  }

  if (parsed.action === 'config') {
    return runConfigMenu();
  }

  // action === 'print'
  const { jobId, token, api } = parsed;
  const config = loadConfig();

  if (!config.printerName) {
    logError('[print-assistant] No hay impresora configurada en config.json.');
    logError('  Abri "RapiWeb Print Assistant" desde el menu inicio para elegirla.');
    // Intentamos avisar al backend para que el frontend muestre el aviso.
    try {
      await ackJob({ apiBase: api, jobId, token, ok: false, error: 'Sin impresora configurada en la PC' });
    } catch { /* noop */ }
    await holdOpen();
    process.exit(3);
  }

  let job;
  try {
    log('[print-assistant] consultando job en backend...');
    job = await fetchJob({ apiBase: api, jobId, token });
  } catch (err) {
    logError('[print-assistant] no se pudo obtener el job:', err.message);
    await holdOpen();
    process.exit(4);
  }

  log(`[print-assistant] job recibido (tipo: ${job.ticket_type})`);

  try {
    await dispatchPrint({
      ticketType: job.ticket_type,
      payload: job.payload || {},
      config,
    });
    log('[print-assistant] impresion enviada a:', config.printerName);

    try {
      await ackJob({ apiBase: api, jobId, token, ok: true });
    } catch (err) {
      logError('[print-assistant] no se pudo enviar ack:', err.message);
    }

    log('[print-assistant] listo. Cerrando.');
    await holdOpen(1500);
    process.exit(0);
  } catch (err) {
    logError('[print-assistant] error imprimiendo:', err.message);
    try {
      await ackJob({ apiBase: api, jobId, token, ok: false, error: err.message });
    } catch { /* noop */ }
    await holdOpen();
    process.exit(5);
  }
}

// ============================================
// Modo interactivo: configuración de impresora
// ============================================
async function runIdleMenu() {
  const config = loadConfig();
  printBanner(config);

  if (!config.printerName) {
    log('Aun no configuraste una impresora.');
  }

  log('\nOpciones:');
  log('  [1] Configurar impresora');
  log('  [2] Probar impresion');
  log('  [3] Ver ubicacion del config.json');
  log('  [Q] Salir');
  log('');

  const choice = await prompt('Elegi una opcion: ');
  if (/^q$/i.test(choice)) return;
  if (choice === '1') return runConfigMenu();
  if (choice === '2') return runPrintTest();
  if (choice === '3') {
    log('\nconfig.json:', getConfigPath());
    log('Carpeta de la app:', getAppRoot());
    await holdOpen();
    return;
  }
  log('Opcion no reconocida.');
  await holdOpen();
}

async function runConfigMenu() {
  log('\n[print-assistant] Listando impresoras de Windows...');
  let printers = [];
  try {
    printers = await listPrinters();
  } catch (err) {
    logError('No se pudieron leer las impresoras:', err.message);
    await holdOpen();
    return;
  }

  if (!printers.length) {
    log('No se detectaron impresoras instaladas en Windows.');
    await holdOpen();
    return;
  }

  log('\nImpresoras detectadas:');
  printers.forEach((p, i) => log(`  [${i + 1}] ${p}`));

  const choice = await prompt('\nNumero de impresora a usar: ');
  const idx = parseInt(choice, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= printers.length) {
    log('Seleccion invalida.');
    await holdOpen();
    return;
  }
  const printerName = printers[idx];

  const widthChoice = await prompt('Ancho de papel (58 / 80) [58]: ');
  const paperWidth = widthChoice.trim() === '80' ? 80 : 58;

  const next = saveConfig({ printerName, paperWidth });
  log('\nConfig guardada:');
  log('  Impresora:', next.printerName);
  log('  Ancho:    ', next.paperWidth, 'mm');
  log('  Archivo:  ', getConfigPath());
  await holdOpen();
}

async function runPrintTest() {
  const config = loadConfig();
  if (!config.printerName) {
    log('Primero configura una impresora (opcion 1).');
    await holdOpen();
    return;
  }
  const sample = {
    businessName: 'RapiWeb - Prueba',
    address: 'Print Assistant v' + APP_VERSION,
    orderNumber: 'TEST-' + Date.now().toString().slice(-6),
    date: new Date().toLocaleString('es-AR'),
    items: [
      { name: 'Item de prueba', quantity: 1, price: 100 },
      { name: 'Otro item', quantity: 2, price: 250.5 },
    ],
    subtotal: 601,
    total: 601,
    paymentMethod: 'Test',
  };
  try {
    const content = generateReceiptContent(sample, config.paperWidth || 58);
    await printText({ printerName: config.printerName, content });
    log('Trabajo enviado a:', config.printerName);
  } catch (err) {
    logError('Error en la prueba:', err.message);
  }
  await holdOpen();
}

// ============================================
// Helpers
// ============================================
function printBanner(config) {
  log('==================================================');
  log(`  RapiWeb Print Assistant v${APP_VERSION}`);
  log('==================================================');
  log('  Impresora:  ' + (config.printerName || '(no configurada)'));
  log('  Ancho:      ' + (config.paperWidth || 58) + 'mm');
  log('  Modo:       protocolo rapiweb-print://');
  log('==================================================');
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function holdOpen(ms = HOLD_OPEN_MS) {
  // Solo en modo TTY (consola visible). Si lo lanza el panel sin consola visible,
  // process.stdout.isTTY puede ser false y no necesitamos esperar.
  if (!process.stdout.isTTY) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Bootstrap
// ============================================
async function main() {
  // En builds con `pkg`, algunas versiones exponen el entrypoint interno
  // (`C:\snapshot\dist\print-assistant.cjs`) dentro de process.argv. Ese valor
  // no es un argumento real del usuario y debe ignorarse, o el doble-click /
  // el instalador muestran "Argumento no reconocido".
  const args = process.argv
    .slice(2)
    .filter((arg) => !/^([a-z]:)?[\\/]+snapshot[\\/]/i.test(arg));

  if (args.length === 0) {
    return runIdleMenu();
  }

  const first = args[0];
  if (first === '--config' || first === '-c') {
    return runConfigMenu();
  }
  if (first === '--test' || first === '-t') {
    return runPrintTest();
  }
  if (/^rapiweb-print:\/\//i.test(first)) {
    return handleDeeplink(first);
  }

  // Si Windows/pkg nos pasa algun argumento no esperado, abrimos el menu en vez
  // de fallar. Es mejor para clientes: siempre ven una pantalla accionable.
  logError('Argumento no reconocido, abriendo menu:', first);
  return runIdleMenu();
}

main().catch(async (err) => {
  logError('Error fatal:', err.stack || err.message);
  await holdOpen();
  process.exit(1);
});
