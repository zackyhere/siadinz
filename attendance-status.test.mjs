import assert from "node:assert/strict";
import test from "node:test";

import {
  attendAvailableSchedules,
  classifySchedule,
  summarizeAttendance,
} from "./attendance-status.mjs";

const source = { kind: "online" };
const payloadFor = (jadwal) => ({ data: { jadwal } });

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sourcePayloads(onlineSchedules) {
  return new Map([
    ["/api/v1/siadin/get-krs-online", { data: { jadwal: onlineSchedules } }],
    ["/api/v1/siadin/get-krs-online-matr", { data: { jadwal: [] } }],
    ["/api/v1/siadin/get-krs-online-sa", { data: { jadwal: [] } }],
  ]);
}

test("classifies API flags as Chrome attendance states", () => {
  assert.equal(classifySchedule({ jam_kul: 0, is_attend: 0 }), "not_started");
  assert.equal(classifySchedule({ jam_kul: 1, is_attend: 0 }), "available");
  assert.equal(classifySchedule({ jam_kul: 1, is_attend: 1 }), "attended");
});

test("prioritizes an available action over completed schedules", () => {
  const result = summarizeAttendance([{ source, payload: payloadFor([
    { nmmk: "KALKULUS", jam_kul: 1, is_attend: 1 },
    { nmmk: "ALJABAR", jam_kul: 1, is_attend: 0 },
  ]) }]);

  assert.equal(result.state, "available");
  assert.equal(result.hasAttendanceAction, true);
  assert.equal(result.hasSuccessfulAttendance, true);
  assert.deepEqual(result.schedules.map(({ courseName, status }) => ({ courseName, status })), [
    { courseName: "KALKULUS", status: "attended" },
    { courseName: "ALJABAR", status: "available" },
  ]);
});

test("reports unavailable when all API schedule lists are empty", () => {
  const result = summarizeAttendance([
    { source: { kind: "online" }, payload: payloadFor([]) },
    { source: { kind: "matrikulasi" }, payload: payloadFor([]) },
    { source: { kind: "semester_antara" }, payload: payloadFor([]) },
  ]);

  assert.equal(result.state, "unavailable");
  assert.equal(result.hasAttendanceAction, false);
  assert.equal(result.hasSuccessfulAttendance, false);
});

test("reports not_started when every schedule is before its attendance window", () => {
  const result = summarizeAttendance([{ source, payload: payloadFor([
    { nmmk: "KALKULUS", jam_kul: 0, is_attend: 0 },
    { nmmk: "BAHASA INDONESIA", jam_kul: "0", is_attend: "0" },
  ]) }]);

  assert.equal(result.state, "not_started");
  assert.equal(result.hasAttendanceAction, false);
  assert.equal(result.hasSuccessfulAttendance, false);
});

test("submits each available schedule once then verifies it", async () => {
  const pending = {
    nmmk: "KALKULUS", kdmk: "F11.64101", klpk: "F11.C101",
    tgl_kuliah: "19 October 2026", jam_kul: 1, is_attend: 0,
    id_master: 42, kdds: "D001",
  };
  const confirmed = { ...pending, is_attend: 1 };
  let reads = 0;
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input).pathname;
    requests.push({ url, method: init.method ?? "GET", body: init.body ?? null });

    if (url === "/api/v1/siadin/absensi-online") {
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), {
        comment: "", id_master: 42, kdds: "D001",
      });
      return jsonResponse({ code: 200 });
    }

    const payloads = sourcePayloads(reads < 3 ? [pending] : [confirmed]);
    reads += 1;
    return jsonResponse(payloads.get(url));
  };

  const result = await attendAvailableSchedules("token", fetchImpl);

  assert.equal(result.state, "attended");
  assert.deepEqual(result.attempted, [{
    source: "online", courseName: "KALKULUS", courseCode: "F11.64101",
    classGroup: "F11.C101", date: "19 October 2026", idMaster: "42",
  }]);
  assert.equal(requests.filter(({ method }) => method === "POST").length, 1);
});

test("does not submit when schedules have not started", async () => {
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input).pathname;
    requests.push({ url, method: init.method ?? "GET" });
    const payloads = sourcePayloads([{ jam_kul: 0, is_attend: 0 }]);
    return jsonResponse(payloads.get(url));
  };

  const result = await attendAvailableSchedules("token", fetchImpl);

  assert.equal(result.state, "not_started");
  assert.deepEqual(result.attempted, []);
  assert.equal(requests.filter(({ method }) => method === "POST").length, 0);
});
