import { apiCommand } from "./api.mjs";
import { escapeHtml, renderPage } from "../partials/layout.mjs";

const maskedSecret = "*****";

function setupForm(session) {
  return `<section class="card login"><p class="page-intro">Quick setup · langkah 1 dari 2</p><h1 class="page-title">Siapkan dashboard</h1><p class="page-intro">Buat password dashboard dan simpan akun SiAdin Anda. API secret dibuat otomatis saat konfigurasi disimpan.</p><form method="post" action="/quick-setup/save"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><label>Password dashboard baru<input type="password" name="dashboardPassword" required autofocus></label><label>NIM / username SiAdin<input name="username" required></label><label>Password SiAdin<input type="password" name="password" required></label><label>API secret<input value="Dibuat otomatis saat disimpan" disabled></label><button>Simpan dan lanjutkan</button></form></section>`;
}

function completeForm(session, origin) {
  const command = apiCommand("course-hours", maskedSecret, origin);
  return `<section class="card login" data-api-copy-csrf="${escapeHtml(session.csrf)}"><p class="page-intro">Quick setup · langkah 2 dari 2</p><h1 class="page-title">Buat cronjob presensi</h1><p class="page-intro">Konfigurasi sudah tersimpan. Jalankan perintah ini sesuai jadwal yang diinginkan.</p><fieldset disabled><label>Password dashboard baru<input value="Tersimpan"></label><label>NIM / username SiAdin<input value="Tersimpan"></label><label>Password SiAdin<input value="Tersimpan"></label><label>API secret<input value="Dibuat otomatis"></label></fieldset><pre class="api-code"><code>${escapeHtml(command)}</code></pre><button class="button-secondary" type="button" data-copy-code data-api-template="course-hours">Salin perintah</button><form method="post" action="/quick-setup/finish"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button>Selesai</button></form></section>`;
}

export function renderQuickSetup(session, origin, complete = false) {
  return renderPage("Quick setup", complete ? completeForm(session, origin) : setupForm(session));
}
