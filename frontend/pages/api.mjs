import { escapeHtml, renderPage } from "../partials/layout.mjs";
import { renderNavigation } from "../partials/navigation.mjs";

const origin = "https://siadinz.zackyhere.workers.dev";
const maskedSecret = "*****";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

export function apiCommand(template, secret) {
  const header = `-H ${shellQuote(`X-API-Secret: ${secret}`)}`;
  if (template === "schedule") return `curl ${header} \\
  ${origin}/api/v1/jadwal`;
  if (template === "attendance") return `curl -X POST \\
  ${header} \\
  ${origin}/api/v1/presensi`;
  if (template === "course-hours") return `curl -X POST \\
  ${header} \\
  -H "Jam-Matkul: true" \\
  -H "Time-Zone: WIB" \\
  ${origin}/api/v1/presensi`;
  return null;
}

function template(id, title, method, preview) {
  return `<div class="api-template"><div><h2>${title}</h2><p>${method}</p></div><pre class="api-code"><code>${escapeHtml(preview)}</code></pre><button class="button-secondary" type="button" data-copy-code data-api-template="${id}">Salin</button></div>`;
}

export function renderApi(session) {
  return renderPage("API", `${renderNavigation(session.csrf, "api")}<section class="api-page" data-api-copy-csrf="${escapeHtml(session.csrf)}"><h1 class="page-title">API</h1>${template("schedule", "Ambil jadwal", "GET /api/v1/jadwal", apiCommand("schedule", maskedSecret))}${template("course-hours", "Presensi sesuai jam kuliah", "POST /api/v1/presensi", apiCommand("course-hours", maskedSecret))}</section>`);
}
