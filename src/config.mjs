/**
 * Config persistente del Print Assistant.
 *
 * Se guarda junto al .exe (cuando esta empaquetado con pkg) o en el cwd cuando
 * corre como script Node. Esto evita problemas de permisos en Program Files.
 *
 * Estructura del config.json:
 *   {
 *     "printerName": "POS-58",
 *     "paperWidth": 58,           // 58 | 80
 *     "logsEnabled": true
 *   }
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CONFIG = {
  printerName: '',
  paperWidth: 58,
  logsEnabled: true,
};

export function getAppRoot() {
  if (typeof process.pkg !== 'undefined') {
    return path.dirname(process.execPath);
  }
  const entry = process.argv[1];
  if (entry) return path.dirname(path.resolve(entry));
  return process.cwd();
}

export function getConfigPath() {
  return path.join(getAppRoot(), 'config.json');
}

export function loadConfig() {
  const file = getConfigPath();
  if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG };
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    console.warn('[config] no se pudo leer config.json:', err.message);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(partial) {
  const current = loadConfig();
  const next = { ...current, ...partial };
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(next, null, 2), 'utf8');
    return next;
  } catch (err) {
    console.error('[config] no se pudo escribir config.json:', err.message);
    return current;
  }
}

export { DEFAULT_CONFIG };
