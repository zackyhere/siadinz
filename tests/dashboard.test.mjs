import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../backend/worker.mjs";

const encryptionKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function database(settings = new Map(), skips = new Set()) {
  return {
    prepare: (statement) => ({
      bind: (...values) => ({
        first: async () => settings.has(values[0]) ? { ciphertext: settings.get(values[0]) } : null,
        all: async () => statement.includes("presensi_skips")
          ? { results: [...skips].filter((value) => value.endsWith(`\u0000${values[0]}`)).map((value) => ({ id_master: value.split("\u0000")[0] })) }
          : { results: [] },
        run: async () => {
          if (statement.includes("dashboard_settings")) settings.set(values[0], values[1]);
          else if (statement.includes("INSERT OR IGNORE INTO presensi_skips")) skips.add(`${values[0]}\u0000${values[1]}`);
          else if (statement.includes("DELETE FROM presensi_skips")) {
            for (const value of skips) if (value.endsWith(`\u0000${values[0]}`) && (value.startsWith(`${values[1]}\u0000`) || value === `${values[1]}\u0000${values[0]}`)) skips.delete(value);
          }
          return { success: true };
        },
      }),
    }),
  };
}

function dashboardEnv(settings) {
  return {
    PRESENSI_ACCESS_TOKEN: "initial-access-token",
    PRESENSI_API_SECRET: "initial-api-secret",
    DASHBOARD_PASSWORD: "dashboard-password",
    SESSION_SIGNING_KEY: "session-signing-key",
    CONFIG_ENCRYPTION_KEY: encryptionKey,
    DB: database(settings),
  };
}

function upstream(attendanceSchedule = { nmmk: "KALKULUS", jam_kul: 0, is_attend: 0 }, courseSchedules = []) {
  const data = new Map([
    ["/api/v1/siadin/get-krs-online", { data: { jadwal: [attendanceSchedule] } }],
    ["/api/v1/siadin/get-krs-online-matr", { data: { jadwal: [] } }],
    ["/api/v1/siadin/get-krs-online-sa", { data: { jadwal: [] } }],
    ["/api/v1/siadin/get-krs", { data: { krs: courseSchedules } }],
  ]);
  return async (input) => new Response(JSON.stringify(data.get(new URL(input).pathname)), {
    headers: { "content-type": "application/json" },
  });
}

function formRequest(path, fields, headers = {}) {
  return new Request(`https://siadinz.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(fields),
  });
}

test("dashboard routes redirect unauthenticated users to login", async () => {
  const response = await handleRequest(new Request("https://siadinz.example/dashboard"), dashboardEnv(), upstream());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/login");
});

test("dashboard session is secure and displays both schedule sources", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  assert.equal(login.status, 303);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(cookie, /Max-Age=86400/);

  const response = await handleRequest(new Request("https://siadinz.example/dashboard", { headers: { cookie } }), env, upstream(
    { nmmk: "KALKULUS", jam_kul: 0, is_attend: 0 },
    [
      { nmmk: "FISIKA", kdmk: "F11.64102", klpk: "F11.C101", sks: 4, hari1: "JUMAT", sesi1: "10.20-12.00", ruang1: "D1.2.KDR", hari2: "SENIN", sesi2: "12.30-14.10", ruang2: "A2.3.KDR", hari3: "-", sesi3: "-", ruang3: "-" },
      { nmmk: "KALKULUS", kdmk: "F11.64101", klpk: "F11.C101", sks: 3, hari1: "SENIN", sesi1: "07.00-09.30", ruang1: "A2.2.KDR", hari2: "-", sesi2: "-", ruang2: "-", hari3: "-", sesi3: "-", ruang3: "-" },
    ],
  ));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Jadwal matkul hari ini/);
  assert.match(html, /Jadwal mata kuliah semester ini/);
  assert.match(html, /FISIKA/);
  assert.match(html, /KALKULUS/);
  assert.match(html, /JUMAT/);
  assert.doesNotMatch(html, /<td>-<\/td>/);
  assert.doesNotMatch(html, /initial-access-token/);
});

test("settings encrypts NIM password and API secret", async () => {
  const settings = new Map();
  const env = dashboardEnv(settings);
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const page = await handleRequest(new Request("https://siadinz.example/settings", { headers: { cookie } }), env, upstream());
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];

  const save = await handleRequest(formRequest("/settings", {
    csrf, username: "F11.2026.00245", password: "siadin-password", apiSecret: "updated-api-secret",
  }, { cookie, referer: "https://siadinz.example/settings" }), env, upstream());

  assert.equal(save.status, 303);
  assert.notEqual(settings.get("SIADIN_USERNAME"), "F11.2026.00245");
  assert.notEqual(settings.get("SIADIN_PASSWORD"), "siadin-password");
  assert.notEqual(settings.get("PRESENSI_API_SECRET"), "updated-api-secret");
});

test("settings renders a recovery page when stored ciphertext is invalid", async () => {
  const settings = new Map([["SIADIN_PASSWORD", "not-an-encrypted-envelope"]]);
  const env = dashboardEnv(settings);
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const response = await handleRequest(new Request("https://siadinz.example/settings", { headers: { cookie } }), env, upstream());
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Konfigurasi tidak dapat dibaca/);
});

test("settings accepts an account modal save with same-origin Sec-Fetch-Site", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const page = await handleRequest(new Request("https://siadinz.example/settings", { headers: { cookie } }), env, upstream());
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];
  const save = await handleRequest(formRequest("/settings", {
    csrf, scope: "account", username: "F11.2026.00245", password: "password",
  }, { cookie, "sec-fetch-site": "same-origin" }), env, upstream());
  assert.equal(save.status, 303);
  assert.equal(save.headers.get("location"), "/settings?notice=settings");
});

test("notifications shows only Discord webhook and API page masks secrets", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const notifications = await handleRequest(new Request("https://siadinz.example/notifications", { headers: { cookie } }), env, upstream());
  const notificationHtml = await notifications.text();
  const api = await handleRequest(new Request("https://siadinz.example/api", { headers: { cookie } }), env, upstream());
  const apiHtml = await api.text();
  const token = await handleRequest(new Request("https://siadinz.example/gettoken", { headers: { cookie } }), env, upstream());
  const webhook = await handleRequest(new Request("https://siadinz.example/webhook", { headers: { cookie } }), env, upstream());

  assert.equal(notifications.status, 200);
  assert.match(notificationHtml, /Webhook Discord/);
  assert.doesNotMatch(notificationHtml, /Notifikasi perangkat/);
  assert.equal(api.status, 200);
  assert.match(apiHtml, /X-API-Secret: \*\*\*\*\*/);
  assert.match(apiHtml, /data-copy-code/);
  assert.equal(token.status, 404);
  assert.equal(webhook.status, 404);
});

test("dashboard attendance route submits only the CSRF-authorized selected course", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const page = await handleRequest(new Request("https://siadinz.example/dashboard", { headers: { cookie } }), env, upstream());
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];
  let selected;
  const { handleDashboardRequest } = await import("../frontend/dashboard.mjs");

  const response = await handleDashboardRequest(formRequest("/attendance", {
    csrf,
    courseCode: "F11.64103",
    classGroup: "F11.C101",
  }, { cookie, "sec-fetch-site": "same-origin" }), env, async () => ({ attendance: { schedules: [], todaySlotKeys: [] }, courseSchedule: { schedules: [] } }), async (courseCode, classGroup) => {
    selected = { courseCode, classGroup };
    return { attempted: [{ courseCode, classGroup }] };
  }, {});

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/dashboard?notice=presensi");
  assert.deepEqual(selected, { courseCode: "F11.64103", classGroup: "F11.C101" });
});

test("dashboard skip route changes only the current course skip state", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const page = await handleRequest(new Request("https://siadinz.example/dashboard", { headers: { cookie } }), env, upstream());
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];
  let skipped;
  const { handleDashboardRequest } = await import("../frontend/dashboard.mjs");
  const response = await handleDashboardRequest(formRequest("/skip", {
    csrf,
    key: "v1:%5B%22F11.64103%22%2C%22F11.C101%22%5D",
  }, { cookie, "sec-fetch-site": "same-origin" }), env, async () => ({ attendance: { schedules: [], todaySlotKeys: [] }, courseSchedule: { schedules: [] } }), async () => ({ attempted: [] }), { skip: (key) => { skipped = key; } });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/dashboard?notice=skip");
  assert.equal(skipped, "v1:%5B%22F11.64103%22%2C%22F11.C101%22%5D");
});

test("dashboard serves modal and floating-control interactions", async () => {
  const response = await handleRequest(new Request("https://siadinz.example/dashboard.js"), dashboardEnv(), upstream());
  const script = await response.text();

  assert.equal(response.status, 200);
  assert.match(script, /showModal/);
  assert.match(script, /data-settings-dialog/);
  assert.match(script, /closeSkipMenus/);
  assert.match(script, /data-copy-code/);
});
