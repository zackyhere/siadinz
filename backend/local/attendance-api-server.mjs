import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

import {
  attendAvailableSchedules,
  fetchAttendanceStatus,
} from "../services/attendance-status.mjs";

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function upstreamStatus(error) {
  const match = /HTTP (\d{3})\./.exec(error.message);
  if (match) return Number(match[1]);
  return 502;
}

function failurePayload(error) {
  const statusCode = upstreamStatus(error);
  return {
    statusCode,
    body: {
      status: "failed",
      error: {
        code: statusCode === 401 || statusCode === 403 ? "authentication_failed" : "upstream_failed",
        message: error.message,
      },
    },
  };
}

function hasValidApiSecret(request, apiSecret) {
  const received = request.headers["x-api-secret"];
  if (typeof received !== "string") return false;

  const expectedBytes = Buffer.from(apiSecret);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length
    && timingSafeEqual(expectedBytes, receivedBytes);
}

export function createAttendanceApiServer({ accessToken, apiSecret, fetchImpl = fetch }) {
  if (!accessToken) {
    throw new Error("PRESENSI_ACCESS_TOKEN is required.");
  }
  if (!apiSecret) {
    throw new Error("PRESENSI_API_SECRET is required.");
  }
  let attendanceInProgress = false;

  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");

    if (!hasValidApiSecret(request, apiSecret)) {
      json(response, 401, {
        status: "failed",
        error: { code: "unauthorized", message: "A valid X-API-Secret header is required." },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/jadwal") {
      try {
        const attendance = await fetchAttendanceStatus(accessToken, fetchImpl);
        json(response, 200, {
          status: "success",
          checkedAt: new Date().toISOString(),
          data: attendance,
        });
      } catch (error) {
        const failure = failurePayload(error instanceof Error ? error : new Error(String(error)));
        json(response, failure.statusCode, failure.body);
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/presensi") {
      if (attendanceInProgress) {
        json(response, 409, {
          status: "in_progress",
          message: "An attendance submission is already in progress.",
        });
        return;
      }

      attendanceInProgress = true;
      try {
        const attendance = await attendAvailableSchedules(accessToken, fetchImpl);
        if (attendance.attempted.length === 0) {
          json(response, 409, {
            status: "not_available",
            message: "No schedule is currently available for attendance.",
            checkedAt: new Date().toISOString(),
            data: attendance,
          });
          return;
        }

        json(response, 200, {
          status: "success",
          message: "Attendance was submitted and verified.",
          checkedAt: new Date().toISOString(),
          data: attendance,
        });
      } catch (error) {
        const failure = failurePayload(error instanceof Error ? error : new Error(String(error)));
        json(response, failure.statusCode, failure.body);
      } finally {
        attendanceInProgress = false;
      }
      return;
    }

    if (["/api/v1/jadwal", "/api/v1/presensi"].includes(url.pathname)) {
      json(response, 405, {
        status: "failed",
        error: { code: "method_not_allowed", message: "Use GET /api/v1/jadwal or POST /api/v1/presensi." },
      });
      return;
    }

    json(response, 404, {
      status: "failed",
      error: { code: "not_found", message: "Endpoint not found." },
    });
  });
}
