import { attendAvailableSchedules, fetchAttendanceStatus, fetchFullCourseSchedule } from "./attendance-status.mjs";
import { effectiveCredentials, handleDashboardRequest, writeSetting, dashboardClientScript } from "./dashboard.mjs";
import {
  accessTokenForRequest, clearDailySkip, jakartaDate, jakartaWeekday, loginSiadin,
  notifyDiscord, notifyDiscordPresensi, scheduleSlotKey, setDailySkip,
  skippedScheduleKeys, webhookConfiguration,
} from "./automation.mjs";

const RC = { SUCCESS: 0, NOT_AVAILABLE: 1, INVALID_REQUEST: 2, UPSTREAM_FAILED: 3, UPSTREAM_AUTHENTICATION_FAILED: 4, SERVER_MISCONFIGURED: 5, UNAUTHORIZED: 6 };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const failureBody = (rc, code, message) => ({ status: "failed", rc, error: { code, message } });
const upstreamStatus = (error) => Number(/HTTP (\d{3})\./.exec(error.message)?.[1] ?? 502);
const isTokenRejection = (error) => /HTTP (401|403)\./.test(error instanceof Error ? error.message : String(error));

async function sameSecret(left, right) { if (!left || !right) return false; const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)), crypto.subtle.digest("SHA-256", new TextEncoder().encode(right))]); const a = new Uint8Array(x), b = new Uint8Array(y); let difference = 0; for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i]; return difference === 0; }
async function recordEvent(database, outcome) { try { await database.prepare("INSERT INTO presensi_events (created_at, outcome_status, rc, http_status, attempted_count, attempted_courses_json, state, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(new Date().toISOString(), outcome.status, outcome.rc, outcome.httpStatus, outcome.attempted.length, JSON.stringify(outcome.attempted), outcome.state ?? null, outcome.errorCode ?? null, outcome.errorMessage ?? null).run(); } catch (error) { console.error("Failed to persist presensi audit event:", error); } }
function upstreamFailure(error) { const status = upstreamStatus(error); return { status, body: failureBody(status === 401 || status === 403 ? RC.UPSTREAM_AUTHENTICATION_FAILED : RC.UPSTREAM_FAILED, status === 401 || status === 403 ? "authentication_failed" : "upstream_failed", error.message) }; }
function background(ctx, promise) { if (ctx?.waitUntil) ctx.waitUntil(promise.catch((error) => console.error("Background notification failed:", error))); else return promise; }

async function withSiadinToken(env, fetchImpl, operation, ctx) {
  const tokenRefresh = () => background(ctx, notifyDiscord(env, "token_refresh", "🔄 Access token SiAdin diperbarui.", fetchImpl));
  let token = await accessTokenForRequest(env, fetchImpl, false, tokenRefresh);
  try { return await operation(token); } catch (error) {
    if (!isTokenRejection(error)) throw error;
    token = await accessTokenForRequest(env, fetchImpl, true, tokenRefresh);
    return operation(token);
  }
}

function dashboardAutomation(env, fetchImpl, ctx) {
  const notify = (event, content) => background(ctx, notifyDiscord(env, event, content, fetchImpl));
  return {
    webhookConfig: () => webhookConfiguration(env),
    saveWebhook: async (url, toggles) => {
      if (url && !/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//.test(url)) throw new Error("Invalid Discord webhook URL.");
      if (url) await writeSetting(env.DB, "DISCORD_WEBHOOK_URL", url, env.CONFIG_ENCRYPTION_KEY);
      for (const [key, value] of Object.entries(toggles)) await writeSetting(env.DB, key, String(value), env.CONFIG_ENCRYPTION_KEY);
    },
    skip: (key) => setDailySkip(env.DB, key, jakartaDate()),
    unskip: (key) => clearDailySkip(env.DB, key, jakartaDate()),
    notify,
  };
}

export async function handleRequest(request, env, fetchImpl = fetch, ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    if (url.pathname === "/dashboard.js") {
      return new Response(dashboardClientScript, {
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" },
      });
    }
    return handleDashboardRequest(request, env, async () => withSiadinToken(env, fetchImpl, async (token) => {
      const [attendance, courseSchedule, skippedKeys] = await Promise.all([
        fetchAttendanceStatus(token, fetchImpl),
        fetchFullCourseSchedule(token, fetchImpl).catch(() => ({ schedules: [] })),
        skippedScheduleKeys(env.DB, jakartaDate()),
      ]);
      const weekday = jakartaWeekday();
      const todaySlotKeys = new Set((courseSchedule.schedules ?? []).flatMap((course) => course.slots
        .filter((slot) => slot.day.toLocaleUpperCase("id-ID") === weekday)
        .map((slot) => scheduleSlotKey(course.courseCode, course.classGroup, slot.day, slot.session, slot.room))));
      return { attendance: { ...attendance, skippedKeys: [...skippedKeys], todaySlotKeys: [...todaySlotKeys] }, courseSchedule };
    }, ctx), (username, password) => loginSiadin(username, password, fetchImpl), dashboardAutomation(env, fetchImpl, ctx));
  }

  if (!env.CONFIG_ENCRYPTION_KEY || !env.DB) return json(500, failureBody(RC.SERVER_MISCONFIGURED, "server_misconfigured", "Worker encryption secret or D1 binding is not configured."));
  let apiSecret;
  try { apiSecret = (await effectiveCredentials(env)).apiSecret; } catch { return json(500, failureBody(RC.SERVER_MISCONFIGURED, "credential_configuration_invalid", "Stored attendance credentials cannot be decrypted with the current encryption key.")); }
  if (!apiSecret) return json(500, failureBody(RC.SERVER_MISCONFIGURED, "server_misconfigured", "Attendance API secret is not configured."));
  if (!await sameSecret(request.headers.get("x-api-secret"), apiSecret)) return json(401, failureBody(RC.UNAUTHORIZED, "unauthorized", "A valid X-API-Secret header is required."));

  if (request.method === "GET" && url.pathname === "/api/v1/jadwal") {
    try { const attendance = await withSiadinToken(env, fetchImpl, (token) => fetchAttendanceStatus(token, fetchImpl), ctx); return json(200, { status: "success", rc: RC.SUCCESS, checkedAt: new Date().toISOString(), data: attendance }); }
    catch (error) { const failure = upstreamFailure(error instanceof Error ? error : new Error(String(error))); return json(failure.status, failure.body); }
  }

  if (request.method === "POST" && url.pathname === "/api/v1/presensi") {
    let outcome;
    try {
      const skipped = await skippedScheduleKeys(env.DB, jakartaDate());
      const attendance = await withSiadinToken(env, fetchImpl, (token) => attendAvailableSchedules(token, fetchImpl, skipped), ctx);
      outcome = attendance.attempted.length ? { httpStatus: 200, status: "success", rc: RC.SUCCESS, message: "Attendance was submitted and verified.", state: attendance.state, attempted: attendance.attempted, data: attendance } : { httpStatus: 200, status: "failed", rc: RC.NOT_AVAILABLE, message: "No non-skipped schedule is currently available for attendance.", state: attendance.state, attempted: [], data: attendance };
      background(ctx, notifyDiscord(env, "api_presensi", `📡 API presensi dipanggil: ${outcome.status} (rc ${outcome.rc}).`, fetchImpl));
      if (outcome.status === "success") background(ctx, notifyDiscordPresensi(env, outcome, fetchImpl));
    } catch (error) {
      const failure = upstreamFailure(error instanceof Error ? error : new Error(String(error)));
      outcome = { httpStatus: failure.status, status: "failed", rc: failure.body.rc, errorCode: failure.body.error.code, errorMessage: failure.body.error.message, attempted: [] };
      background(ctx, notifyDiscord(env, "api_presensi", `⚠️ API presensi gagal: ${outcome.errorCode} (rc ${outcome.rc}).`, fetchImpl));
    }
    background(ctx, recordEvent(env.DB, outcome));
    if (outcome.status === "success" || outcome.rc === RC.NOT_AVAILABLE) return json(outcome.httpStatus, { status: outcome.status, rc: outcome.rc, message: outcome.message, checkedAt: new Date().toISOString(), data: outcome.data });
    return json(outcome.httpStatus, failureBody(outcome.rc, outcome.errorCode, outcome.errorMessage));
  }

  if (["/api/v1/jadwal", "/api/v1/presensi"].includes(url.pathname)) return json(405, failureBody(RC.INVALID_REQUEST, "method_not_allowed", "Use GET /api/v1/jadwal or POST /api/v1/presensi."));
  return json(404, failureBody(RC.INVALID_REQUEST, "not_found", "Endpoint not found."));
}
export default { fetch(request, env, ctx) { return handleRequest(request, env, fetch, ctx); } };
