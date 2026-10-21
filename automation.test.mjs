import assert from "node:assert/strict";
import test from "node:test";

import {
  accessTokenForRequest,
  clearDailySkip,
  notifyDiscordPresensi,
  setDailySkip,
  skippedMasterIds,
} from "./automation.mjs";
import { writeSetting } from "./dashboard.mjs";

const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function database(settings = new Map(), skips = new Set()) {
  return {
    prepare: (statement) => ({
      bind: (...values) => ({
        first: async () => settings.has(values[0]) ? { ciphertext: settings.get(values[0]) } : null,
        all: async () => ({
          results: statement.includes("presensi_skips")
            ? [...skips].filter((entry) => entry.endsWith(`\u0000${values[0]}`)).map((entry) => ({ id_master: entry.split("\u0000")[0] }))
            : [],
        }),
        run: async () => {
          if (statement.includes("dashboard_settings")) settings.set(values[0], values[1]);
          if (statement.includes("INSERT OR IGNORE INTO presensi_skips")) skips.add(`${values[0]}\u0000${values[1]}`);
          if (statement.includes("DELETE FROM presensi_skips")) {
            for (const entry of skips) if (entry.endsWith(`\u0000${values[0]}`) && (entry.startsWith(`${values[1]}\u0000`) || entry === `${values[1]}\u0000${values[0]}`)) skips.delete(entry);
          }
          return { success: true };
        },
      }),
    }),
  };
}

function jwt(exp) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp })}.signature`;
}

test("expired cached token is refreshed with encrypted SiAdin credentials", async () => {
  const settings = new Map();
  const env = { DB: database(settings), CONFIG_ENCRYPTION_KEY: key };
  await writeSetting(env.DB, "PRESENSI_ACCESS_TOKEN", jwt(1), key);
  await writeSetting(env.DB, "SIADIN_USERNAME", "F11.2026.00245", key);
  await writeSetting(env.DB, "SIADIN_PASSWORD", "secret-password", key);
  let loginBody;
  const refreshed = jwt(Math.floor(Date.now() / 1000) + 3600);

  const token = await accessTokenForRequest(env, async (input, init) => {
    assert.equal(String(input), "https://api.dinus.ac.id/api/v1/siadin/login");
    loginBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ data: { access_token: refreshed } }), {
      headers: { "content-type": "application/json" },
    });
  });

  assert.equal(token, refreshed);
  assert.deepEqual(loginBody, { username: "F11.2026.00245", password: "secret-password" });
  assert.notEqual(settings.get("PRESENSI_ACCESS_TOKEN"), refreshed);
});

test("daily skip applies only to its Jakarta date", async () => {
  const skips = new Set();
  const db = database(new Map(), skips);
  await setDailySkip(db, "132649", "2026-10-21");
  assert.deepEqual([...await skippedMasterIds(db, "2026-10-21")], ["132649"]);
  assert.deepEqual([...await skippedMasterIds(db, "2026-10-22")], []);
  await clearDailySkip(db, "132649", "2026-10-21");
  assert.deepEqual([...await skippedMasterIds(db, "2026-10-21")], []);
});

test("cancelling a course skip removes legacy slot skips", async () => {
  const skips = new Set(["F11.64103\u0000F11.C101\u0000RABU\u000010.20-12.00\u0000Lab 1\u00002026-10-21"]);
  const db = database(new Map(), skips);

  await clearDailySkip(db, "F11.64103\u0000F11.C101", "2026-10-21");

  assert.deepEqual([...skips], []);
});

test("Discord notification posts only when configured and attendance succeeded", async () => {
  const settings = new Map();
  const env = { DB: database(settings), CONFIG_ENCRYPTION_KEY: key };
  await writeSetting(env.DB, "DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/123/token", key);
  await writeSetting(env.DB, "DISCORD_WEBHOOK_PRESENSI_ENABLED", "true", key);
  let notification;

  await notifyDiscordPresensi(env, { attempted: [{ courseName: "FISIKA", classGroup: "F11.C101" }] }, async (input, init) => {
    notification = { input: String(input), body: JSON.parse(init.body) };
    return new Response(null, { status: 204 });
  });

  assert.equal(notification.input, "https://discord.com/api/webhooks/123/token");
  assert.match(notification.body.content, /FISIKA \(F11.C101\)/);
});

test("Discord API-hit event respects its own toggle", async () => {
  const settings = new Map();
  const env = { DB: database(settings), CONFIG_ENCRYPTION_KEY: key };
  await writeSetting(env.DB, "DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/123/token", key);
  await writeSetting(env.DB, "DISCORD_WEBHOOK_API_PRESENSI_ENABLED", "true", key);
  let posted = false;
  const { notifyDiscord } = await import("./automation.mjs");

  await notifyDiscord(env, "api_presensi", "API hit", async () => {
    posted = true;
    return new Response(null, { status: 204 });
  });

  assert.equal(posted, true);
});
