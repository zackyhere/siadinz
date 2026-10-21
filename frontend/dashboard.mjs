import { renderLogin } from "./pages/auth.mjs";
import { renderApi } from "./pages/api.mjs";
import { renderDashboard } from "./pages/dashboard.mjs";
import { renderNotifications } from "./pages/notifications.mjs";
import { renderSettings } from "./pages/settings.mjs";
import { dashboardCss, redirect, renderPage } from "./partials/layout.mjs";

const COOKIE = "__Host-siadinz_session";
const SESSION_TTL_MS = 86_400_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export { dashboardCss };


function base64Url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=")),
    (character) => character.charCodeAt(0),
  );
}

function cookies(request) {
  return Object.fromEntries((request.headers.get("cookie") ?? "").split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    return separator > 0 ? [[part.slice(0, separator).trim(), part.slice(separator + 1).trim()]] : [];
  }));
}

async function same(left, right) {
  if (typeof left !== "string" || !right) return false;
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

async function mac(value, keyText) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(keyText), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function createSession(key) {
  const payload = { exp: Date.now() + SESSION_TTL_MS, csrf: base64Url(crypto.getRandomValues(new Uint8Array(32))) };
  const encodedPayload = base64Url(encoder.encode(JSON.stringify(payload)));
  return `${encodedPayload}.${base64Url(await mac(encodedPayload, key))}`;
}

async function verifySession(value, key) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !await same(base64Url(await mac(payload, key)), signature)) return null;
  try {
    const session = JSON.parse(decoder.decode(fromBase64Url(payload)));
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function hasValidCsrf(request, form, session) {
  const origin = new URL(request.url).origin;
  let hasSameOriginReferer = false;
  try {
    hasSameOriginReferer = new URL(request.headers.get("referer")).origin === origin;
  } catch {}
  return form.get("csrf") === session.csrf
    && (request.headers.get("origin") === origin || hasSameOriginReferer || request.headers.get("sec-fetch-site") === "same-origin");
}

export class CredentialConfigurationError extends Error {}

async function encryptionKey(secret) {
  const raw = fromBase64Url(secret);
  if (raw.length !== 32) throw new CredentialConfigurationError("Invalid encryption key.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), encoder.encode(value));
  return JSON.stringify({ iv: base64Url(iv), ct: base64Url(new Uint8Array(ciphertext)) });
}

async function decrypt(value, secret) {
  const envelope = JSON.parse(value);
  return decoder.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(envelope.iv) }, await encryptionKey(secret), fromBase64Url(envelope.ct)));
}

export async function readSetting(database, key, secret) {
  try {
    const row = await database.prepare("SELECT ciphertext FROM dashboard_settings WHERE setting_key = ?").bind(key).first();
    return row ? await decrypt(row.ciphertext, secret) : null;
  } catch {
    throw new CredentialConfigurationError("Stored setting cannot be decrypted.");
  }
}

export async function writeSetting(database, key, value, secret) {
  const ciphertext = await encrypt(value, secret);
  await database.prepare("INSERT INTO dashboard_settings (setting_key, ciphertext, updated_at) VALUES (?, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=excluded.updated_at")
    .bind(key, ciphertext, new Date().toISOString()).run();
}

export async function effectiveCredentials(env) {
  const [accessToken, apiSecret, username, password] = await Promise.all([
    readSetting(env.DB, "PRESENSI_ACCESS_TOKEN", env.CONFIG_ENCRYPTION_KEY),
    readSetting(env.DB, "PRESENSI_API_SECRET", env.CONFIG_ENCRYPTION_KEY),
    readSetting(env.DB, "SIADIN_USERNAME", env.CONFIG_ENCRYPTION_KEY),
    readSetting(env.DB, "SIADIN_PASSWORD", env.CONFIG_ENCRYPTION_KEY),
  ]);
  return { accessToken: accessToken || env.PRESENSI_ACCESS_TOKEN, apiSecret: apiSecret || env.PRESENSI_API_SECRET, username, password };
}

function forbidden() {
  return renderPage("Forbidden", "<h1>Forbidden</h1>", 403);
}

function notFound() {
  return renderPage("Not found", "<h1>Not found</h1>", 404);
}

function sessionCookie(value, maxAge) {
  return `${COOKIE}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export async function handleDashboardRequest(request, env, loadDashboard, attendCourse, automation = {}) {
  const url = new URL(request.url);
  if (!env.DASHBOARD_PASSWORD || !env.SESSION_SIGNING_KEY || !env.CONFIG_ENCRYPTION_KEY) {
    return renderPage("Configuration error", "<section class=card><h1>Dashboard belum dikonfigurasi</h1></section>", 500);
  }

  if (url.pathname === "/login" && request.method === "GET") return renderLogin();
  if (url.pathname === "/login" && request.method === "POST") {
    const form = await request.formData();
    if (!await same(form.get("password"), env.DASHBOARD_PASSWORD)) return renderLogin("Password salah.");
    return redirect("/dashboard", { "set-cookie": sessionCookie(await createSession(env.SESSION_SIGNING_KEY), 86400) });
  }

  const session = await verifySession(cookies(request)[COOKIE], env.SESSION_SIGNING_KEY);
  if (!session) return redirect("/login");

  if (url.pathname === "/logout" && request.method === "POST") {
    const form = await request.formData();
    return hasValidCsrf(request, form, session)
      ? redirect("/login", { "set-cookie": sessionCookie("", 0) })
      : forbidden();
  }

  if (url.pathname === "/api" && request.method === "GET") return renderApi(session);

  if (url.pathname === "/settings" && request.method === "GET") {
    try {
      return renderSettings(session, await effectiveCredentials(env));
    } catch {
      return renderSettings(session, {}, "Konfigurasi tidak dapat dibaca.");
    }
  }
  if (url.pathname === "/settings" && request.method === "POST") {
    const form = await request.formData();
    if (!hasValidCsrf(request, form, session)) return forbidden();
    const scope = String(form.get("scope") || "all");
    const fields = scope === "all" ? ["username", "password", "apiSecret"] : scope === "account" ? ["username", "password"] : [scope];
    const keys = { username: "SIADIN_USERNAME", password: "SIADIN_PASSWORD", apiSecret: "PRESENSI_API_SECRET", accessToken: "PRESENSI_ACCESS_TOKEN" };
    try {
      for (const field of fields) {
        const value = String(form.get(field) ?? "").trim();
        if (!value || !keys[field]) throw new Error("Invalid setting.");
        await writeSetting(env.DB, keys[field], value, env.CONFIG_ENCRYPTION_KEY);
      }
      automation.notify?.("settings", "⚙️ Settings diperbarui.");
      return redirect("/settings?notice=settings");
    } catch {
      return renderSettings(session, {}, "Nilai wajib diisi dan tidak dapat disimpan.");
    }
  }

  if (url.pathname === "/notifications" && request.method === "GET") return renderNotifications(session, await automation.webhookConfig());
  if (url.pathname === "/notifications" && request.method === "POST") {
    const form = await request.formData();
    if (!hasValidCsrf(request, form, session)) return forbidden();
    try {
      await automation.saveWebhook(String(form.get("url") ?? "").trim(), {
        DISCORD_WEBHOOK_PRESENSI_ENABLED: form.get("presensi") === "on",
        DISCORD_WEBHOOK_API_PRESENSI_ENABLED: form.get("apiPresensi") === "on",
        DISCORD_WEBHOOK_SETTINGS_ENABLED: form.get("settings") === "on",
        DISCORD_WEBHOOK_TOKEN_REFRESH_ENABLED: form.get("tokenRefresh") === "on",
      });
      return redirect("/notifications");
    } catch {
      return renderNotifications(session, await automation.webhookConfig(), "Webhook tidak dapat disimpan. Gunakan URL webhook Discord HTTPS yang valid.");
    }
  }

  if (["/skip", "/skip/cancel"].includes(url.pathname) && request.method === "POST") {
    const form = await request.formData();
    if (!hasValidCsrf(request, form, session)) return forbidden();
    const key = String(form.get("key") ?? "");
    if (!key) return redirect("/dashboard");
    if (url.pathname === "/skip") await automation.skip(key);
    else await automation.unskip(key);
    return redirect(`/dashboard?notice=${url.pathname === "/skip" ? "skip" : "unskip"}`);
  }

  if (url.pathname === "/attendance" && request.method === "POST") {
    const form = await request.formData();
    if (!hasValidCsrf(request, form, session)) return forbidden();
    const courseCode = String(form.get("courseCode") ?? "").trim();
    const classGroup = String(form.get("classGroup") ?? "").trim();
    if (!courseCode || !classGroup) return redirect("/dashboard");
    try {
      const attendance = await attendCourse(courseCode, classGroup);
      return redirect(attendance.attempted.length ? "/dashboard?notice=presensi" : "/dashboard");
    } catch {
      return renderDashboard(session, await loadDashboard(), "Presensi gagal diproses. Periksa status terbaru sebelum mencoba lagi.");
    }
  }

  if (url.pathname === "/" || url.pathname === "/dashboard") {
    try {
      return renderDashboard(session, await loadDashboard());
    } catch {
      return renderDashboard(session, { attendance: { schedules: [], skippedKeys: [], todaySlotKeys: [] } }, "Jadwal tidak dapat dimuat.");
    }
  }

  return notFound();
}
