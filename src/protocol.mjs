/**
 * Parser del protocolo personalizado:
 *   rapiweb-print://print?job=<uuid>&t=<token>&api=<base-url>
 *
 * Windows pasa la URL completa como argv[1] cuando el usuario hace clic en un
 * enlace `rapiweb-print://...`. La parseamos y validamos antes de tocar la red.
 */

const VALID_HOSTS = ['print', 'config'];

export function parseDeeplink(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { ok: false, error: 'URL vacia' };
  }

  // Algunos terminales pasan la URL con comillas simples o con barra final extra
  const url = rawUrl.trim().replace(/^["']|["']$/g, '');

  if (!url.toLowerCase().startsWith('rapiweb-print://')) {
    return { ok: false, error: 'protocolo no reconocido' };
  }

  let parsed;
  try {
    // URL estandar parsea bien custom schemes si seguimos el formato scheme://host?query
    parsed = new URL(url);
  } catch (err) {
    return { ok: false, error: 'URL malformada: ' + err.message };
  }

  const action = (parsed.hostname || parsed.pathname.replace(/^\/+/, '')).toLowerCase();
  if (!VALID_HOSTS.includes(action)) {
    return { ok: false, error: 'accion desconocida: ' + action };
  }

  const params = Object.fromEntries(parsed.searchParams.entries());

  if (action === 'print') {
    const jobId = params.job || params.id || '';
    const token = params.t || params.token || '';
    const api = params.api || '';
    if (!jobId) return { ok: false, error: 'falta parametro job' };
    if (!token) return { ok: false, error: 'falta parametro token' };
    if (!api) return { ok: false, error: 'falta parametro api' };
    if (!/^https?:\/\//i.test(api)) return { ok: false, error: 'api invalida' };

    return { ok: true, action, jobId, token, api };
  }

  if (action === 'config') {
    return { ok: true, action, params };
  }

  return { ok: false, error: 'accion no implementada' };
}
