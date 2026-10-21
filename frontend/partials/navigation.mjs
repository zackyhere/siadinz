import { escapeHtml } from "./layout.mjs";

export function renderNavigation(csrfToken) {
  return `<header><a href="/dashboard">Dashboard</a><a href="/gettoken">Get token</a><a href="/webhook">Webhook</a><a href="/settings">Settings</a><form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><button class="link">Keluar</button></form></header>`;
}
