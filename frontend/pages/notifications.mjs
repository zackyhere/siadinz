import { escapeHtml, renderPage } from "../partials/layout.mjs";
import { renderNavigation } from "../partials/navigation.mjs";

export function renderNotifications(session, configuration, message = "") {
  const option = (name, label, checked) => `<label><input type="checkbox" name="${name}" ${checked ? "checked" : ""}> ${label}</label>`;
  return renderPage("Notification", `${renderNavigation(session.csrf, "notifications")}<section class="card notification-card"><h1 class="page-title">Webhook Discord</h1>${message ? `<p class="form-message">${escapeHtml(message)}</p>` : ""}<p>Webhook: <strong>${configuration.url ? "configured" : "missing"}</strong>.</p><form method="post" action="/notifications"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><label>Discord webhook URL<input type="url" name="url"></label><div class="notification-options"><h2>Jenis notifikasi</h2>${option("presensi", "Presensi berhasil", configuration.presensiEnabled)}${option("apiPresensi", "Aksi presensi API", configuration.apiPresensiEnabled)}${option("settings", "Settings diperbarui", configuration.settingsEnabled)}${option("tokenRefresh", "Token diperbarui", configuration.tokenRefreshEnabled)}</div><button>Simpan webhook</button></form></section>`);
}
