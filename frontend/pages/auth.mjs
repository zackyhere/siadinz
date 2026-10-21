import { escapeHtml, renderPage } from "../partials/layout.mjs";

export function renderLogin(error = "") {
  return renderPage("Login", `<section class="card login"><h1 class="page-title">SiAdin</h1><p class="page-intro">Masuk untuk membuka ringkasan presensi dan jadwal kuliah Anda.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}<form method="post" action="/login"><label>Password dashboard<input type="password" name="password" required autofocus></label><button>Masuk</button></form></section>`);
}
