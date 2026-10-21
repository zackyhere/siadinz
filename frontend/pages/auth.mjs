import { escapeHtml, renderPage } from "../partials/layout.mjs";

export function renderLogin(error = "") {
  return renderPage("Login", `<section class="card login"><h1>SiAdin Dashboard</h1>${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}<form method="post" action="/login"><label>Password<input type="password" name="password" required autofocus></label><button>Masuk</button></form></section>`);
}
