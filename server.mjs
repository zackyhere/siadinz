#!/usr/bin/env node

import { createAttendanceApiServer } from "./attendance-api-server.mjs";
import { loadLocalEnv } from "./env.mjs";

await loadLocalEnv();

const host = process.env.PRESENSI_API_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PRESENSI_API_PORT ?? "3000", 10);
const accessToken = process.env.PRESENSI_ACCESS_TOKEN;
const apiSecret = process.env.PRESENSI_API_SECRET;

if (!accessToken) {
  process.stderr.write("PRESENSI_ACCESS_TOKEN is required in .env.\n");
  process.exitCode = 1;
} else if (!apiSecret) {
  process.stderr.write("PRESENSI_API_SECRET is required in .env.\n");
  process.exitCode = 1;
} else if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write("PRESENSI_API_PORT must be an integer between 1 and 65535.\n");
  process.exitCode = 1;
} else {
  const server = createAttendanceApiServer({ accessToken, apiSecret });
  server.listen(port, host, () => {
    process.stdout.write(`Attendance API listening on http://${host}:${port}\n`);
  });
}
