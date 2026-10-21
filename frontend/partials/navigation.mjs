import { escapeHtml } from "./layout.mjs";

export function renderNavigation(csrfToken) {
  return `<header class="site-header"><a class="brand" href="/dashboard">SiAdin</a><nav class="site-nav" aria-label="Navigasi dashboard"><a href="/dashboard">Dashboard</a><a href="/gettoken">Get token</a><a href="/webhook">Webhook</a><a href="/settings">Settings</a><form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><button class="link logout">Keluar</button></form></nav></header>`;
}
