/**
 * Builder de comandos ESC/POS estandar para impresoras termicas.
 *
 * Implementa el subset necesario para imprimir tickets fiscales de RapiWeb:
 *   - Init / reset
 *   - Alineacion (left/center/right)
 *   - Negrita
 *   - Tamano de caracter (alto x ancho)
 *   - Linea / feed
 *   - QR Code nativo (GS k 49) - lo dibuja la impresora
 *   - Corte de papel
 *
 * Funciona en la mayoria de impresoras compatibles ESC/POS:
 * Epson TM, Xprinter, POS-58, POS-80, 3nStar, Star, Citizen, Bematech.
 *
 * Si una impresora no soporta ESC/POS, los bytes se imprimen como caracteres
 * raros y el operador notara el problema; el frontend captura el ack=error
 * y cae al fallback del navegador.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export class EscPosBuilder {
  constructor() {
    this.chunks = [];
  }

  // ============================================
  // Setup
  // ============================================
  init() {
    this.chunks.push(Buffer.from([ESC, 0x40])); // ESC @
    return this;
  }

  /** Selecciona codepage (PC850 multilingue por defecto). */
  codepage(n = 2) {
    this.chunks.push(Buffer.from([ESC, 0x74, n & 0xff]));
    return this;
  }

  // ============================================
  // Formato
  // ============================================
  align(mode) {
    const map = { left: 0, center: 1, right: 2 };
    const n = typeof mode === 'number' ? mode : (map[mode] ?? 0);
    this.chunks.push(Buffer.from([ESC, 0x61, n]));
    return this;
  }
  left() { return this.align('left'); }
  center() { return this.align('center'); }
  right() { return this.align('right'); }

  bold(on = true) {
    this.chunks.push(Buffer.from([ESC, 0x45, on ? 1 : 0]));
    return this;
  }

  /**
   * Tamano de caracter. width/height en multiplos (1=normal, 2=doble, etc).
   * Soportado hasta 8 en la mayoria de las termicas.
   */
  size(width = 1, height = 1) {
    const w = Math.max(1, Math.min(8, width)) - 1;
    const h = Math.max(1, Math.min(8, height)) - 1;
    const n = (w << 4) | h;
    this.chunks.push(Buffer.from([GS, 0x21, n]));
    return this;
  }
  normal() { return this.size(1, 1); }
  large() { return this.size(2, 2); }

  underline(level = 1) {
    // 0=off, 1=1dot, 2=2dot
    this.chunks.push(Buffer.from([ESC, 0x2d, level & 0xff]));
    return this;
  }

  // ============================================
  // Contenido
  // ============================================
  text(str) {
    if (str == null) return this;
    this.chunks.push(Buffer.from(String(str), 'latin1'));
    return this;
  }
  line(str = '') {
    return this.text(str + '\n');
  }
  feed(n = 1) {
    this.chunks.push(Buffer.from([ESC, 0x64, n & 0xff]));
    return this;
  }
  divider(width, char = '-') {
    return this.line(char.repeat(width));
  }

  // ============================================
  // QR nativo (GS k 49) - lo dibuja la impresora
  // ============================================
  /**
   * Imprime un QR usando comandos nativos ESC/POS.
   * @param {string} data Texto/URL del QR.
   * @param {object} [opts]
   * @param {number} [opts.size=6]   modulo (1-16, recomendado 5-8)
   * @param {string} [opts.ec='M']   correccion de errores: L, M, Q, H
   */
  qr(data, opts = {}) {
    const size = Math.max(1, Math.min(16, opts.size || 6));
    const ecMap = { L: 48, M: 49, Q: 50, H: 51 };
    const ec = ecMap[opts.ec] || 49;

    // 1. Modelo QR (Model 2)
    this.chunks.push(Buffer.from([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));
    // 2. Tamano del modulo
    this.chunks.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size]));
    // 3. Nivel de correccion de errores
    this.chunks.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ec]));
    // 4. Datos
    const dataBuf = Buffer.from(String(data), 'latin1');
    const total = dataBuf.length + 3;
    const pL = total & 0xff;
    const pH = (total >> 8) & 0xff;
    this.chunks.push(Buffer.from([GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]));
    this.chunks.push(dataBuf);
    // 5. Imprimir
    this.chunks.push(Buffer.from([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]));

    return this;
  }

  // ============================================
  // Corte
  // ============================================
  /** Corta el papel (parcial por defecto). m=66 hace feed previo. */
  cut(partial = true, feed = 3) {
    this.feed(feed);
    this.chunks.push(Buffer.from([GS, 0x56, partial ? 0x42 : 0x41, 0x00]));
    return this;
  }

  // ============================================
  // Output
  // ============================================
  toBuffer() {
    return Buffer.concat(this.chunks);
  }
  toBase64() {
    return this.toBuffer().toString('base64');
  }
}
