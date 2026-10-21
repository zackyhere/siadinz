import { renderPage } from "../partials/layout.mjs";
import { renderNavigation } from "../partials/navigation.mjs";

const apiSecret = "*****";

function code(value) {
  return `<pre class="api-code"><code>${value}</code></pre>`;
}

export function renderApi(session) {
  const scheduleCurl = `curl -H "X-API-Secret: ${apiSecret}" \\
  https://siadinz.zackyhere.workers.dev/api/v1/jadwal`;
  const attendanceCurl = `curl -X POST \\
  -H "X-API-Secret: ${apiSecret}" \\
  https://siadinz.zackyhere.workers.dev/api/v1/presensi`;
  const gatedAttendanceCurl = `curl -X POST \\
  -H "X-API-Secret: ${apiSecret}" \\
  -H "Jam-Matkul: true" \\
  -H "Time-Zone: WIB" \\
  https://siadinz.zackyhere.workers.dev/api/v1/presensi`;
  return renderPage("API", `${renderNavigation(session.csrf, "api")}<section class="api-page"><h1 class="page-title">API</h1><div class="api-template"><div><h2>Ambil jadwal</h2><p>GET <code>/api/v1/jadwal</code></p></div>${code(scheduleCurl)}<button class="button-secondary" type="button" data-copy-code>Salin</button></div><div class="api-template"><div><h2>Presensi sekarang</h2><p>POST <code>/api/v1/presensi</code></p></div>${code(attendanceCurl)}<button class="button-secondary" type="button" data-copy-code>Salin</button></div><div class="api-template"><div><h2>Presensi sesuai jam kuliah</h2><p>POST <code>/api/v1/presensi</code></p></div>${code(gatedAttendanceCurl)}<button class="button-secondary" type="button" data-copy-code>Salin</button></div></section>`);
}
