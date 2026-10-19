import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "./worker.mjs";

const env = {
  PRESENSI_ACCESS_TOKEN: "test-token",
  PRESENSI_API_SECRET: "test-api-secret",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function payloads(onlineSchedules) {
  return new Map([
    ["/api/v1/siadin/get-krs-online", { data: { jadwal: onlineSchedules } }],
    ["/api/v1/siadin/get-krs-online-matr", { data: { jadwal: [] } }],
    ["/api/v1/siadin/get-krs-online-sa", { data: { jadwal: [] } }],
  ]);
}

function request(path, init = {}) {
  return new Request(`https://siadinz.example${path}`, {
    ...init,
    headers: { "x-api-secret": env.PRESENSI_API_SECRET, ...init.headers },
  });
}

test("Worker rejects requests without its API secret", async () => {
  let upstreamCalls = 0;
  const response = await handleRequest(
    new Request("https://siadinz.example/api/v1/jadwal"),
    env,
    async () => { upstreamCalls += 1; return jsonResponse({}); },
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "unauthorized");
  assert.equal(upstreamCalls, 0);
});

test("Worker returns complete schedule details", async () => {
  const schedule = { nmmk: "KALKULUS", jam_kul: 0, is_attend: 0, jam_mulai: "07:00" };
  const fetchImpl = async (input) => jsonResponse(payloads([schedule]).get(new URL(input).pathname));
  const response = await handleRequest(request("/api/v1/jadwal"), env, fetchImpl);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "success");
  assert.equal(body.data.schedules[0].status, "not_started");
  assert.equal(body.data.schedules[0].details.jam_mulai, "07:00");
});

test("Worker does not submit unavailable schedules", async () => {
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const path = new URL(input).pathname;
    requests.push({ path, method: init.method ?? "GET" });
    return jsonResponse(payloads([{ jam_kul: 0, is_attend: 0 }]).get(path));
  };
  const response = await handleRequest(request("/api/v1/presensi", { method: "POST" }), env, fetchImpl);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.status, "not_available");
  assert.equal(requests.some(({ method }) => method === "POST"), false);
});
