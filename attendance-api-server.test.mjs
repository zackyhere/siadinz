import assert from "node:assert/strict";
import test from "node:test";

import { createAttendanceApiServer } from "./attendance-api-server.mjs";

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

const apiSecret = "test-api-secret";

async function withServer(fetchImpl, run) {
  const server = createAttendanceApiServer({
    accessToken: "test-token",
    apiSecret,
    fetchImpl,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("GET jadwal returns normalized and complete schedule data", async () => {
  const schedule = {
    nmmk: "KALKULUS", kdmk: "F11.64101", klpk: "F11.C101",
    tgl_kuliah: "20 October 2026", jam_mulai: "07:00", jam_selesai: "08:40",
    jam_kul: 1, is_attend: 0, custom_upstream_field: "retained",
  };
  const fetchImpl = async (input) => jsonResponse(payloads([schedule]).get(new URL(input).pathname));

  await withServer(fetchImpl, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/jadwal`, {
      headers: { "x-api-secret": apiSecret },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "success");
    assert.equal(body.data.schedules[0].status, "available");
    assert.equal(body.data.schedules[0].startTime, "07:00");
    assert.equal(body.data.schedules[0].details.custom_upstream_field, "retained");
  });
});

test("POST presensi returns not_available without posting when no schedule is available", async () => {
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const path = new URL(input).pathname;
    requests.push({ path, method: init.method ?? "GET" });
    return jsonResponse(payloads([{ jam_kul: 0, is_attend: 0 }]).get(path));
  };

  await withServer(fetchImpl, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/presensi`, {
      method: "POST",
      headers: { "x-api-secret": apiSecret },
    });
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.status, "not_available");
    assert.equal(body.data.state, "not_started");
    assert.equal(requests.some(({ method }) => method === "POST"), false);
  });
});

test("POST presensi returns success only after status verification", async () => {
  const pending = { nmmk: "FISIKA", jam_kul: 1, is_attend: 0, id_master: 42, kdds: "D001" };
  const attended = { ...pending, is_attend: 1 };
  const requests = [];
  let reads = 0;
  const fetchImpl = async (input, init = {}) => {
    const path = new URL(input).pathname;
    requests.push({ path, method: init.method ?? "GET", body: init.body ?? null });
    if (path === "/api/v1/siadin/absensi-online") return jsonResponse({ code: 200 });

    const responsePayloads = payloads(reads < 3 ? [pending] : [attended]);
    reads += 1;
    return jsonResponse(responsePayloads.get(path));
  };

  await withServer(fetchImpl, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/presensi`, {
      method: "POST",
      headers: { "x-api-secret": apiSecret },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "success");
    assert.equal(body.data.state, "attended");
    assert.equal(body.data.attempted.length, 1);
    assert.equal(requests.filter(({ method }) => method === "POST").length, 1);
  });
});

test("GET jadwal exposes upstream authentication failure for caller fallback", async () => {
  const fetchImpl = async () => jsonResponse({ code: 401 }, 401);

  await withServer(fetchImpl, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/jadwal`, {
      headers: { "x-api-secret": apiSecret },
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.status, "failed");
    assert.equal(body.error.code, "authentication_failed");
  });
});

test("rejects absent and invalid API secrets before upstream calls", async () => {
  let upstreamCalls = 0;
  const fetchImpl = async () => {
    upstreamCalls += 1;
    return jsonResponse({});
  };

  await withServer(fetchImpl, async (baseUrl) => {
    for (const headers of [{}, { "x-api-secret": "wrong-secret" }]) {
      const response = await fetch(`${baseUrl}/api/v1/jadwal`, { headers });
      const body = await response.json();

      assert.equal(response.status, 401);
      assert.equal(body.status, "failed");
      assert.equal(body.error.code, "unauthorized");
    }
  });

  assert.equal(upstreamCalls, 0);
});
