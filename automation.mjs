import { readSetting, writeSetting } from "./dashboard.mjs";

const API_ORIGIN = "https://api.dinus.ac.id";
const TOKEN_RENEWAL_WINDOW_MS = 60_000;

function tokenPayload(token) {
  const segment = token.split(".")[1];
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
}
export function tokenNeedsRefresh(token, now = Date.now()) { try { const payload = tokenPayload(token); return !Number.isFinite(payload.exp) || payload.exp * 1000 <= now + TOKEN_RENEWAL_WINDOW_MS; } catch { return false; } }
export async function loginSiadin(username, password, fetchImpl = fetch) {
  const response = await fetchImpl(`${API_ORIGIN}/api/v1/siadin/login`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  const body = await response.text(); let payload;
  try { payload = JSON.parse(body); } catch { throw new Error("SiAdin login did not return JSON."); }
  if (!response.ok) throw new Error(payload?.message || "SiAdin login failed.");
  const token = payload?.data?.access_token;
  if (typeof token !== "string" || token.length < 20) throw new Error("SiAdin login response has no access token.");
  return token;
}
export async function accessTokenForRequest(env, fetchImpl = fetch, forceRefresh = false, onRefresh) {
  const [storedToken, nim, password] = await Promise.all([readSetting(env.DB, "PRESENSI_ACCESS_TOKEN", env.CONFIG_ENCRYPTION_KEY), readSetting(env.DB, "SIADIN_USERNAME", env.CONFIG_ENCRYPTION_KEY), readSetting(env.DB, "SIADIN_PASSWORD", env.CONFIG_ENCRYPTION_KEY)]);
  const accessToken = storedToken || env.PRESENSI_ACCESS_TOKEN;
  if (!forceRefresh && accessToken && !tokenNeedsRefresh(accessToken)) return accessToken;
  if (!nim || !password) { if (accessToken) return accessToken; throw new Error("SiAdin credentials are missing; save NIM and password in Settings."); }
  const refreshedToken = await loginSiadin(nim, password, fetchImpl);
  await writeSetting(env.DB, "PRESENSI_ACCESS_TOKEN", refreshedToken, env.CONFIG_ENCRYPTION_KEY);
  await onRefresh?.();
  return refreshedToken;
}

export function jakartaDate(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now); }
export function jakartaWeekday(now = new Date()) { return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long" }).format(now).toLocaleUpperCase("id-ID"); }
export function scheduleKey(courseCode, classGroup) { return `${String(courseCode ?? "").trim()}\u0000${String(classGroup ?? "").trim()}`; }
export async function skippedScheduleKeys(database, day) { const result = await database.prepare("SELECT id_master FROM presensi_skips WHERE skip_date = ?").bind(day).all(); return new Set((result.results ?? []).map(({ id_master }) => String(id_master))); }
export async function setDailySkip(database, key, day) { await database.prepare("INSERT OR IGNORE INTO presensi_skips (id_master, skip_date, created_at) VALUES (?, ?, ?)").bind(key, day, new Date().toISOString()).run(); }
export async function clearDailySkip(database, key, day) { await database.prepare("DELETE FROM presensi_skips WHERE id_master = ? AND skip_date = ?").bind(key, day).run(); }

export const skippedMasterIds = skippedScheduleKeys;
export async function webhookConfiguration(env) {
  const [url, presensi, apiPresensi, settings, tokenRefresh] = await Promise.all([readSetting(env.DB, "DISCORD_WEBHOOK_URL", env.CONFIG_ENCRYPTION_KEY), readSetting(env.DB, "DISCORD_WEBHOOK_PRESENSI_ENABLED", env.CONFIG_ENCRYPTION_KEY), readSetting(env.DB, "DISCORD_WEBHOOK_API_PRESENSI_ENABLED", env.CONFIG_ENCRYPTION_KEY), readSetting(env.DB, "DISCORD_WEBHOOK_SETTINGS_ENABLED", env.CONFIG_ENCRYPTION_KEY), readSetting(env.DB, "DISCORD_WEBHOOK_TOKEN_REFRESH_ENABLED", env.CONFIG_ENCRYPTION_KEY)]);
  return { url, presensiEnabled: presensi === "true", apiPresensiEnabled: apiPresensi === "true", settingsEnabled: settings === "true", tokenRefreshEnabled: tokenRefresh === "true" };
}
export async function notifyDiscord(env, event, content, fetchImpl = fetch) {
  const config = await webhookConfiguration(env);
  const enabled = { presensi: config.presensiEnabled, api_presensi: config.apiPresensiEnabled, settings: config.settingsEnabled, token_refresh: config.tokenRefreshEnabled }[event];
  if (!config.url || !enabled) return;
  const response = await fetchImpl(config.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
  if (!response.ok) throw new Error(`Discord webhook returned HTTP ${response.status}.`);
}
export async function notifyDiscordPresensi(env, outcome, fetchImpl = fetch) { if (outcome.attempted.length) await notifyDiscord(env, "presensi", `✅ Presensi berhasil: ${outcome.attempted.map(({ courseName, classGroup }) => `${courseName} (${classGroup})`).join(", ")}`, fetchImpl); }
