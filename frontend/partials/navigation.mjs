import { escapeHtml } from "./layout.mjs";

const powerIcon = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2v10"/><path d="M6.2 5.2a9 9 0 1 0 11.6 0"/></svg>`;

export function renderNavigation(csrfToken, current = "dashboard") {
  const nav = (href, label, key) => `<a href="${href}" ${current === key ? 'aria-current="page"' : ""}>${label}</a>`;
  const logout = csrfToken ? `<button class="icon-button icon-button--logout" type="button" aria-label="Keluar" data-open-logout>${powerIcon}</button>` : "";
  const dialog = csrfToken ? `<dialog class="logout-dialog" data-logout-dialog><div class="dialog-card"><h2>Keluar dari dashboard?</h2><p>Sesi dashboard pada perangkat ini akan diakhiri.</p><div class="dialog-actions"><button class="button-secondary" type="button" data-close-logout>Batal</button><form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><button>Keluar</button></form></div></div></dialog>` : "";
  return `<header class="site-header"><nav class="site-nav" aria-label="Navigasi dashboard">${nav("/dashboard", "Dashboard", "dashboard")}${nav("/notifications", "Notification", "notifications")}${nav("/settings", "Settings", "settings")}${nav("/api", "API", "api")}${logout}</nav></header>${dialog}`;
}
