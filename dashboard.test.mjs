import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "./worker.mjs";

const encryptionKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function database(settings = new Map()) {
  return {
    prepare: (statement) => ({
      bind: (...values) => ({
        first: async () => settings.has(values[0]) ? { ciphertext: settings.get(values[0]) } : null,
        run: async () => {
          if (statement.includes("dashboard_settings")) settings.set(values[0], values[1]);
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

function upstream(schedule = { nmmk: "KALKULUS", jam_kul: 0, is_attend: 0 }) {
  const data = new Map([
    ["/api/v1/siadin/get-krs-online", { data: { jadwal: [schedule] } }],
    ["/api/v1/siadin/get-krs-online-matr", { data: { jadwal: [] } }],
    ["/api/v1/siadin/get-krs-online-sa", { data: { jadwal: [] } }],
  ]);
  return async (input, init = {}) => new Response(JSON.stringify(data.get(new URL(input).pathname)), {
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

test("dashboard session is secure and displays upstream schedule data", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  assert.equal(login.status, 303);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(cookie, /Max-Age=86400/);

  const response = await handleRequest(new Request("https://siadinz.example/dashboard", { headers: { cookie } }), env, upstream());
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /KALKULUS/);
  assert.doesNotMatch(html, /initial-access-token/);
});

test("settings encrypt credentials and API reads updated values", async () => {
  const settings = new Map();
  const env = dashboardEnv(settings);
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const settingsPage = await handleRequest(new Request("https://siadinz.example/settings", { headers: { cookie } }), env, upstream());
  const html = await settingsPage.text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  assert.ok(csrf);

  const save = await handleRequest(formRequest("/settings", {
    csrf,
    accessToken: "updated-access-token",
    apiSecret: "updated-api-secret",
  }, { cookie, origin: "https://siadinz.example" }), env, upstream());
  assert.equal(save.status, 303);
  assert.notEqual(settings.get("PRESENSI_ACCESS_TOKEN"), "updated-access-token");
  assert.notEqual(settings.get("PRESENSI_API_SECRET"), "updated-api-secret");

  let authorization;
  const response = await handleRequest(new Request("https://siadinz.example/api/v1/jadwal", {
    headers: { "x-api-secret": "updated-api-secret" },
  }), env, async (input, init = {}) => {
    authorization = init.headers.authorization;
    return upstream()(input, init);
  });
  assert.equal(response.status, 200);
  assert.equal(authorization, "Bearer updated-access-token");
});

test("settings accepts a same-origin Referer when Origin is absent", async () => {
  const env = dashboardEnv();
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");
  const settingsPage = await handleRequest(new Request("https://siadinz.example/settings", { headers: { cookie } }), env, upstream());
  const csrf = /name="csrf" value="([^"]+)"/.exec(await settingsPage.text())?.[1];

  const save = await handleRequest(formRequest("/settings", {
    csrf, accessToken: "replacement-token", apiSecret: "replacement-secret",
  }, { cookie, referer: "https://siadinz.example/settings" }), env, upstream());

  assert.equal(save.status, 303);
});

test("settings renders a recovery page when stored ciphertext is invalid", async () => {
  const settings = new Map([["PRESENSI_ACCESS_TOKEN", "not-an-encrypted-envelope"]]);
  const env = dashboardEnv(settings);
  const login = await handleRequest(formRequest("/login", { password: "dashboard-password" }), env, upstream());
  const cookie = login.headers.get("set-cookie");

  const response = await handleRequest(new Request("https://siadinz.example/settings", { headers: { cookie } }), env, upstream());
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Kredensial tersimpan tidak dapat didekripsi/);
});
