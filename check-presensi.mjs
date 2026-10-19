#!/usr/bin/env node

import { attendAvailableSchedules, fetchAttendanceStatus } from "./attendance-status.mjs";

function fail(message, code = 1) {
  process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = code;
}

async function main() {
  const accessToken = process.env.PRESENSI_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Set PRESENSI_ACCESS_TOKEN.");
  }

  const absen = process.env.PRESENSI_ABSEN === "true";
  const attendance = absen
    ? await attendAvailableSchedules(accessToken)
    : await fetchAttendanceStatus(accessToken);

  process.stdout.write(`${JSON.stringify({
    checkedAt: new Date().toISOString(),
    mode: absen ? "attend" : "check",
    attempted: attendance.attempted ?? [],
    ...attendance,
  })}\n`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
