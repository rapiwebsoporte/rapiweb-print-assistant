/**
 * Cliente HTTP minimalista hacia la API de RapiWeb para consumir
 * y aknowledgear print jobs. Usa fetch nativo de Node 18+.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

async function request(url, init = {}) {
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), init.timeout || DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RapiWebPrintAssistant/2.0',
        ...(init.headers || {}),
      },
    });
    let data = null;
    const text = await res.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchJob({ apiBase, jobId, token }) {
  const url = `${apiBase.replace(/\/+$/, '')}/print-jobs/${encodeURIComponent(jobId)}?t=${encodeURIComponent(token)}`;
  return request(url, { method: 'GET' });
}

export async function ackJob({ apiBase, jobId, token, ok, error }) {
  const url = `${apiBase.replace(/\/+$/, '')}/print-jobs/${encodeURIComponent(jobId)}/ack`;
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ok: !!ok, error: error || null }),
  });
}
