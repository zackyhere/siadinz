import { escapeHtml, renderPage } from "../partials/layout.mjs";
import { renderNavigation } from "../partials/navigation.mjs";

export function renderTokenPage(session, result = {}) {
  return renderPage("Get token", `${renderNavigation(session.csrf)}<section class="card"><h1 class="page-title">Get access token</h1><p class="page-intro">Token hanya ditampilkan untuk respons ini dan tidak disimpan oleh dashboard.</p>${result.error ? `<p class="error">${escapeHtml(result.error)}</p>` : ""}<form method="post" action="/gettoken"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><label>NIM / username<input name="username" required></label><label>Password<input type="password" name="password" required></label><button>Dapatkan token</button></form>${result.accessToken ? `<label class="token-output">Access token<textarea readonly>${escapeHtml(result.accessToken)}</textarea></label>` : ""}</section>`);
}
