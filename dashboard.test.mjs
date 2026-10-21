import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "./worker.mjs";

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
  assert.match(html, /Jadwal presensi hari ini/);
  assert.match(html, /Jadwal mata kuliah semester ini/);
  assert.match(html, /FISIKA/);
  assert.match(html, /KALKULUS/);
  assert.match(html, /JUMAT/);
  assert.equal((html.match(/FISIKA/g) ?? []).length, 2);
  assert.equal((html.match(/KALKULUS/g) ?? []).length, 2);
  assert.ok(html.indexOf("KALKULUS</td><td>F11.64101") < html.indexOf("FISIKA</td><td>F11.64102"));
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

test("settings accepts same-origin Sec-Fetch-Site", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const page = await handleRequest(new Request("https://siadinz.example/settings", { headers: { cookie } }), env, upstream());
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];
  const save = await handleRequest(formRequest("/settings", {
    csrf, username: "F11.2026.00245", password: "password", apiSecret: "secret",
  }, { cookie, "sec-fetch-site": "same-origin" }), env, upstream());
  assert.equal(save.status, 303);
});

test("gettoken displays only access token and posts credentials to SiAdin login", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const page = await handleRequest(new Request("https://siadinz.example/gettoken", { headers: { cookie } }), env, upstream());
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];
  let loginRequest;

  const response = await handleRequest(formRequest("/gettoken", {
    csrf, username: "F11.2026.00245", password: "secret-password",
  }, { cookie, "sec-fetch-site": "same-origin" }), env, async (input, init) => {
    if (String(input) === "https://api.dinus.ac.id/api/v1/siadin/login") {
      loginRequest = init;
      return new Response(JSON.stringify({ data: { access_token: "access-token-for-testing-123" } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return upstream()(input, init);
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /access-token-for-testing-123/);
  assert.doesNotMatch(html, /secret-password/);
  assert.equal(loginRequest.method, "POST");
  assert.deepEqual(JSON.parse(loginRequest.body), { username: "F11.2026.00245", password: "secret-password" });
});

test("gettoken rejects cross-site form posts before upstream login", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const page = await handleRequest(new Request("https://siadinz.example/gettoken", { headers: { cookie } }), env, upstream());
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1];
  let upstreamCalls = 0;

  const response = await handleRequest(formRequest("/gettoken", {
    csrf, username: "student", password: "password",
  }, { cookie, origin: "https://attacker.example" }), env, async () => {
    upstreamCalls += 1;
    return new Response("{}", { headers: { "content-type": "application/json" } });
  });

  assert.equal(response.status, 403);
  assert.equal(upstreamCalls, 0);
});

test("skip controls render only for the current WIB schedule slot", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const attendance = { state: "unavailable", schedules: [], skippedKeys: [], todaySlotKeys: ["F11.64103\u0000F11.C101\u0000RABU\u000010.20-12.00\u0000Lab 1"] };
  const courseSchedule = { schedules: [{ courseName: "DASAR PEMROGRAMAN", courseCode: "F11.64103", classGroup: "F11.C101", credits: 4, slots: [
    { day: "SELASA", session: "08.40-10.20", room: "A2.3", weekdayOrder: 2, startTimeOrder: 520 },
    { day: "RABU", session: "10.20-12.00", room: "Lab 1", weekdayOrder: 3, startTimeOrder: 620 },
  ] }] };
  const { handleDashboardRequest } = await import("./dashboard.mjs");
  const response = await handleDashboardRequest(new Request("https://siadinz.example/dashboard", { headers: { cookie } }), env, async () => ({ attendance, courseSchedule }), async () => "", {});
  const html = await response.text();

  assert.equal((html.match(/Skip hari ini/g) ?? []).length, 1);
  assert.match(html, /RABU/);
});

test("dashboard preserves a daily course skip after refresh", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const courseKey = "F11.64103\u0000F11.C101";
  const attendance = { state: "unavailable", schedules: [], skippedKeys: [courseKey], todaySlotKeys: [`${courseKey}\u0000RABU\u000010.20-12.00\u0000Lab 1`] };
  const courseSchedule = { schedules: [{ courseName: "DASAR PEMROGRAMAN", courseCode: "F11.64103", classGroup: "F11.C101", credits: 4, slots: [
    { day: "RABU", session: "10.20-12.00", room: "Lab 1", weekdayOrder: 3, startTimeOrder: 620 },
  ] }] };
  const { handleDashboardRequest } = await import("./dashboard.mjs");
  const response = await handleDashboardRequest(new Request("https://siadinz.example/dashboard", { headers: { cookie } }), env, async () => ({ attendance, courseSchedule }), async () => "", {});
  const html = await response.text();

  assert.match(html, /action="\/skip\/cancel"/);
  assert.match(html, /Tidak jadi skip/);
  assert.doesNotMatch(html, />Skip hari ini</);
});

test("dashboard serves same-origin no-refresh skip control script", async () => {
  const response = await handleRequest(new Request("https://siadinz.example/dashboard.js"), dashboardEnv(), upstream());
  const script = await response.text();

  assert.equal(response.status, 200);
  assert.match(script, /event\.preventDefault\(\)/);
  assert.match(script, /credentials: "same-origin"/);
  assert.match(script, /Tidak jadi skip/);
});
