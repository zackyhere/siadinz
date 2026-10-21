import { escapeHtml, renderPage } from "../partials/layout.mjs";
import { renderNavigation } from "../partials/navigation.mjs";

function accountDialog(session) {
  return `<dialog class="settings-dialog" data-settings-dialog="account"><form method="post" action="/settings"><div class="dialog-card"><h2>Setting akun</h2><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="scope" value="account"><label>NIM / username<input name="username" required autofocus></label><label>Password SiAdin<input type="password" name="password" required></label><div class="dialog-actions"><button class="button-secondary" type="button" data-close-settings>Batal</button><button>Simpan</button></div></div></form></dialog>`;
}

function secretDialog(session) {
  return `<dialog class="settings-dialog" data-settings-dialog="secret"><form method="post" action="/settings"><div class="dialog-card"><h2>API secret</h2><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="scope" value="apiSecret"><label>PRESENSI_API_SECRET<input type="password" name="apiSecret" required autofocus></label><div class="dialog-actions"><button class="button-secondary" type="button" data-close-settings>Batal</button><button>Simpan</button></div></div></form></dialog>`;
}

export function renderSettings(session, state, message = "") {
  const accountStatus = state.username && state.password ? "configured" : "missing";
  const secretStatus = state.apiSecret ? "configured" : "missing";
  return renderPage("Settings", `${renderNavigation(session.csrf, "settings")}${message ? `<p class="form-message">${escapeHtml(message)}</p>` : ""}<section class="settings-grid"><article class="settings-card settings-card--account"><h1>Setting akun</h1><p>${accountStatus}</p><button type="button" data-open-settings="account">Setting</button></article><article class="settings-card settings-card--secret"><h1>API secret</h1><p>${secretStatus}</p><button type="button" data-open-settings="secret">Setting</button></article></section>${accountDialog(session)}${secretDialog(session)}`);
}
