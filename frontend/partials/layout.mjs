export const dashboardCss = `:root{font-family:system-ui,sans-serif;color:#172033;background:#f4f7fb}body{margin:0}main{max-width:1100px;margin:auto;padding:24px}header{display:flex;gap:18px;align-items:center;margin-bottom:32px}header a,.link{color:#0753a6;font-weight:650;text-decoration:none;background:none;border:0;padding:0;cursor:pointer;font:inherit}header form{margin-left:auto}.card,section{background:#fff;border:1px solid #dbe3ef;border-radius:12px;padding:24px;margin-bottom:20px;box-shadow:0 2px 10px #15335c0d}.login{max-width:380px;margin:12vh auto}label{display:grid;gap:8px;margin:16px 0;font-weight:600}input,textarea{font:inherit;border:1px solid #aebed2;border-radius:8px;padding:10px}textarea{min-height:100px}button{background:#0753a6;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}.table{overflow:auto}table{border-collapse:collapse;width:100%;background:#fff}th,td{padding:12px;text-align:left;border-bottom:1px solid #dbe3ef;white-space:nowrap}.status{font-weight:700}.available{color:#087f3d}.attended{color:#0753a6}.not_started{color:#875800}.skipped{color:#8a1c68}.error{color:#a01818;background:#fff0f0;padding:10px;border-radius:8px}.setting{border-top:1px solid #dbe3ef;margin-top:18px;padding-top:8px}`;

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function htmlResponse(content, status = 200, headers = {}) {
  return new Response(content, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      ...headers,
    },
  });
}

export function renderPage(title, body, status = 200) {
  return htmlResponse(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · SiAdin</title><style>${dashboardCss}</style><script src="/dashboard.js" defer></script></head><body><main>${body}</main></body></html>`, status);
}

export function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store", ...headers } });
}
