const SESSION_COOKIE = "__Host-siadinz_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const dashboardCss = `:root{font-family:system-ui,sans-serif;color:#172033;background:#f4f7fb}body{margin:0}main{max-width:1100px;margin:auto;padding:24px}header{display:flex;gap:18px;align-items:center;margin-bottom:32px}header a,.link{color:#0753a6;font-weight:650;text-decoration:none;background:none;border:0;padding:0;cursor:pointer;font:inherit}header form{margin-left:auto}.card,section{background:#fff;border:1px solid #dbe3ef;border-radius:12px;padding:24px;box-shadow:0 2px 10px #15335c0d}.login{max-width:380px;margin:12vh auto}label{display:grid;gap:8px;margin:16px 0;font-weight:600}input,textarea{font:inherit;border:1px solid #aebed2;border-radius:8px;padding:10px}textarea{min-height:100px}button{background:#0753a6;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}.table{overflow:auto}table{border-collapse:collapse;width:100%;background:#fff}th,td{padding:12px;text-align:left;border-bottom:1px solid #dbe3ef;white-space:nowrap}.status{font-weight:700}.available{color:#087f3d}.attended{color:#0753a6}.not_started{color:#875800}.error{color:#a01818;background:#fff0f0;padding:10px;border-radius:8px}`;

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function responseHtml(html, status = 200, headers = {}) {
  return new Response(html, { status, headers: {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...headers,
  } });
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store", ...headers } });
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.get("cookie") ?? "").split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    return separator > 0 ? [[part.slice(0, separator).trim(), part.slice(separator + 1).trim()]] : [];
  }));
}

async function hmac(value, signingKey) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function sameSecret(left, right) {
  if (typeof left !== "string" || !right) return false;
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function createSession(signingKey) {
  const payload = { exp: Date.now() + SESSION_TTL_MS, csrf: base64url(crypto.getRandomValues(new Uint8Array(32))) };
  const encoded = base64url(encoder.encode(JSON.stringify(payload)));
  return `${encoded}.${base64url(await hmac(encoded, signingKey))}`;
}

async function verifySession(token, signingKey) {
  if (!token || !signingKey) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = base64url(await hmac(encoded, signingKey));
  if (expected.length !== signature.length || !await sameSecret(expected, signature)) return null;
  try {
    const payload = JSON.parse(decoder.decode(fromBase64url(encoded)));
    return Number.isFinite(payload.exp) && payload.exp > Date.now() && typeof payload.csrf === "string" ? payload : null;
  } catch { return null; }
}

function sessionCookie(value) {
  return `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_TTL_MS / 1000}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function expiredSessionCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export class CredentialConfigurationError extends Error {}

async function encryptionKey(secret) {
  const raw = fromBase64url(secret);
  if (raw.length !== 32) throw new Error("CONFIG_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), encoder.encode(value));
  return JSON.stringify({ v: 1, iv: base64url(iv), ct: base64url(new Uint8Array(ciphertext)) });
}

async function decrypt(value, secret) {
  const envelope = JSON.parse(value);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64url(envelope.iv) }, await encryptionKey(secret), fromBase64url(envelope.ct));
  return decoder.decode(plaintext);
}

async function readSetting(database, key, encryptionSecret) {
  try {
    const row = await database.prepare("SELECT ciphertext FROM dashboard_settings WHERE setting_key = ?").bind(key).first();
    return row ? await decrypt(row.ciphertext, encryptionSecret) : null;
  } catch {
    throw new CredentialConfigurationError("Stored dashboard credentials cannot be read with the current encryption key.");
  }
}

export async function effectiveCredentials(env) {
  const [accessToken, apiSecret] = await Promise.all([
    readSetting(env.DB, "PRESENSI_ACCESS_TOKEN", env.CONFIG_ENCRYPTION_KEY),
    readSetting(env.DB, "PRESENSI_API_SECRET", env.CONFIG_ENCRYPTION_KEY),
  ]);
  return { accessToken: accessToken || env.PRESENSI_ACCESS_TOKEN, apiSecret: apiSecret || env.PRESENSI_API_SECRET };
}

function layout(title, body) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · SiAdin</title><style>${dashboardCss}</style></head><body><main>${body}</main></body></html>`;
}

function loginPage(error = "") {
  return responseHtml(layout("Login", `<section class="card login"><h1>SiAdin Dashboard</h1><p>Masuk untuk mengelola integrasi presensi.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}<form method="post" action="/login"><label>Password<input type="password" name="password" autocomplete="current-password" required autofocus></label><button type="submit">Masuk</button></form></section>`));
}

function nav(csrf) {
  return `<header><a href="/dashboard">Dashboard</a><a href="/settings">Settings</a><form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button class="link" type="submit">Keluar</button></form></header>`;
}

function scheduleRows(schedules, includeAttendanceStatus = false) {
  return schedules.map((schedule) => `<tr><td>${escapeHtml(schedule.courseName)}</td><td>${escapeHtml(schedule.courseCode)}</td><td>${escapeHtml(schedule.classGroup)}</td><td>${escapeHtml(schedule.date)}</td><td>${escapeHtml(schedule.startTime)}–${escapeHtml(schedule.endTime)}</td><td>${escapeHtml(schedule.lecturerName || schedule.lecturerCode)}</td>${includeAttendanceStatus ? `<td><span class="status ${escapeHtml(schedule.status)}">${escapeHtml(schedule.status)}</span></td>` : `<td>${escapeHtml(schedule.room)}</td>`}</tr>`).join("");
}

function dashboardPage(session, data, message = "") {
  const attendance = data.attendance;
  const courseSchedule = data.courseSchedule?.schedules ?? [];
  const attendanceRows = scheduleRows(attendance.schedules, true);
  const courseRows = scheduleRows(courseSchedule);
  return responseHtml(layout("Dashboard", `${nav(session.csrf)}<section><h1>Jadwal presensi hari ini</h1>${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}<p>Status agregat: <strong>${escapeHtml(attendance.state)}</strong></p><div class="table"><table><thead><tr><th>Mata kuliah</th><th>Kode</th><th>Kelas</th><th>Tanggal</th><th>Waktu</th><th>Dosen</th><th>Status</th></tr></thead><tbody>${attendanceRows || "<tr><td colspan=7>Tidak ada jadwal presensi.</td></tr>"}</tbody></table></div></section><section><h1>Jadwal mata kuliah hari ini</h1><div class="table"><table><thead><tr><th>Mata kuliah</th><th>Kode</th><th>Kelas</th><th>Tanggal</th><th>Waktu</th><th>Dosen</th><th>Ruang</th></tr></thead><tbody>${courseRows || "<tr><td colspan=7>Data jadwal mata kuliah tidak tersedia.</td></tr>"}</tbody></table></div></section>`));
}

function settingsPage(session, configured, message = "") {
  return responseHtml(layout("Settings", `${nav(session.csrf)}<section class="card"><h1>Settings</h1>${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}<p>Nilai kosong mempertahankan nilai yang ada. Nilai tidak pernah ditampilkan kembali.</p><p>Access token: <strong>${configured.accessToken ? "configured" : "missing"}</strong>. API secret: <strong>${configured.apiSecret ? "configured" : "missing"}</strong>.</p><form method="post" action="/settings"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><label>PRESENSI_ACCESS_TOKEN<textarea name="accessToken" autocomplete="off" spellcheck="false"></textarea></label><label>PRESENSI_API_SECRET<input type="password" name="apiSecret" autocomplete="new-password"></label><button type="submit">Simpan terenkripsi</button></form></section>`));
}

function csrfValid(request, form, session) {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site");
  const sameOriginReferer = referer && (() => {
    try { return new URL(referer).origin === expectedOrigin; } catch { return false; }
  })();
  const browserSameOrigin = origin === expectedOrigin
    || sameOriginReferer
    || fetchSite === "same-origin";
  return browserSameOrigin && form.get("csrf") === session.csrf;
}

export async function handleDashboardRequest(request, env, attendanceLoader) {
  const url = new URL(request.url);
  if (!env.DASHBOARD_PASSWORD || !env.SESSION_SIGNING_KEY || !env.CONFIG_ENCRYPTION_KEY) return responseHtml(layout("Configuration error", "<section class=card><h1>Dashboard belum dikonfigurasi</h1></section>"), 500);
  if (url.pathname === "/login" && request.method === "GET") return loginPage();
  if (url.pathname === "/login" && request.method === "POST") {
    const form = await request.formData();
    if (!await sameSecret(form.get("password"), env.DASHBOARD_PASSWORD)) return loginPage("Password salah.");
    return redirect("/dashboard", { "set-cookie": sessionCookie(await createSession(env.SESSION_SIGNING_KEY)) });
  }
  const session = await verifySession(parseCookies(request)[SESSION_COOKIE], env.SESSION_SIGNING_KEY);
  if (!session) return redirect("/login");
  if (url.pathname === "/logout" && request.method === "POST") {
    const form = await request.formData();
    return csrfValid(request, form, session) ? redirect("/login", { "set-cookie": expiredSessionCookie() }) : responseHtml(layout("Forbidden", "<section class=card><h1>Forbidden</h1></section>"), 403);
  }
  if (url.pathname === "/settings" && request.method === "GET") {
    try {
      const credentials = await effectiveCredentials(env);
      return settingsPage(session, { accessToken: Boolean(credentials.accessToken), apiSecret: Boolean(credentials.apiSecret) });
    } catch (error) {
      if (error instanceof CredentialConfigurationError) {
        return settingsPage(session, { accessToken: false, apiSecret: false }, "Kredensial tersimpan tidak dapat didekripsi. Isi ulang kedua nilai untuk menggantinya.");
      }
      return settingsPage(session, { accessToken: false, apiSecret: false }, "Konfigurasi tidak dapat dibaca. Anda dapat menyimpan ulang kedua nilai.");
    }
  }
  if (url.pathname === "/settings" && request.method === "POST") {
    const form = await request.formData();
    if (!csrfValid(request, form, session)) return responseHtml(layout("Forbidden", "<section class=card><h1>Forbidden</h1></section>"), 403);
    const values = [["PRESENSI_ACCESS_TOKEN", "accessToken"], ["PRESENSI_API_SECRET", "apiSecret"]]
      .map(([key, field]) => [key, String(form.get(field) ?? "").trim()]);
    if (values.some(([, value]) => !value)) {
      return settingsPage(session, { accessToken: false, apiSecret: false }, "Isi kedua nilai untuk menyimpan konfigurasi.");
    }
    try {
      for (const [key, value] of values) {
        await env.DB.prepare("INSERT INTO dashboard_settings (setting_key, ciphertext, updated_at) VALUES (?, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET ciphertext = excluded.ciphertext, updated_at = excluded.updated_at").bind(key, await encrypt(value, env.CONFIG_ENCRYPTION_KEY), new Date().toISOString()).run();
      }
      return redirect("/settings");
    } catch {
      return settingsPage(session, { accessToken: false, apiSecret: false }, "Konfigurasi tidak dapat disimpan. Periksa binding D1 dan kunci enkripsi.");
    }
  }
  if (url.pathname === "/" || url.pathname === "/dashboard") {
    try { return dashboardPage(session, await attendanceLoader()); } catch { return dashboardPage(session, { attendance: { state: "error", schedules: [] }, courseSchedule: { schedules: [] } }, "Jadwal tidak dapat dimuat."); }
  }
  return responseHtml(layout("Not found", "<section class=card><h1>Not found</h1></section>"), 404);
}
