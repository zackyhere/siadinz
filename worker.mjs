import {
  attendAvailableSchedules,
  fetchAttendanceStatus,
} from "./attendance-status.mjs";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function upstreamStatus(error) {
  const match = /HTTP (\d{3})\./.exec(error.message);
  return match ? Number(match[1]) : 502;
}

function failureResponse(error) {
  const status = upstreamStatus(error);
  return json(status, {
    status: "failed",
    error: {
      code: status === 401 || status === 403 ? "authentication_failed" : "upstream_failed",
      message: error.message,
    },
  });
}

async function hasValidApiSecret(request, apiSecret) {
  const received = request.headers.get("x-api-secret");
  if (!received || !apiSecret) return false;

  const encoder = new TextEncoder();
  const [expected, actual] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(apiSecret)),
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
  ]);
  const expectedBytes = new Uint8Array(expected);
  const actualBytes = new Uint8Array(actual);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ actualBytes[index];
  }
  return difference === 0;
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  if (!env.PRESENSI_ACCESS_TOKEN || !env.PRESENSI_API_SECRET) {
    return json(500, {
      status: "failed",
      error: { code: "server_misconfigured", message: "Worker secrets are not configured." },
    });
  }

  if (!await hasValidApiSecret(request, env.PRESENSI_API_SECRET)) {
    return json(401, {
      status: "failed",
      error: { code: "unauthorized", message: "A valid X-API-Secret header is required." },
    });
  }

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/v1/jadwal") {
    try {
      const attendance = await fetchAttendanceStatus(env.PRESENSI_ACCESS_TOKEN, fetchImpl);
      return json(200, {
        status: "success",
        checkedAt: new Date().toISOString(),
        data: attendance,
      });
    } catch (error) {
      return failureResponse(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (request.method === "POST" && url.pathname === "/api/v1/presensi") {
    try {
      const attendance = await attendAvailableSchedules(env.PRESENSI_ACCESS_TOKEN, fetchImpl);
      if (attendance.attempted.length === 0) {
        return json(409, {
          status: "not_available",
          message: "No schedule is currently available for attendance.",
          checkedAt: new Date().toISOString(),
          data: attendance,
        });
      }

      return json(200, {
        status: "success",
        message: "Attendance was submitted and verified.",
        checkedAt: new Date().toISOString(),
        data: attendance,
      });
    } catch (error) {
      return failureResponse(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (["/api/v1/jadwal", "/api/v1/presensi"].includes(url.pathname)) {
    return json(405, {
      status: "failed",
      error: { code: "method_not_allowed", message: "Use GET /api/v1/jadwal or POST /api/v1/presensi." },
    });
  }

  return json(404, {
    status: "failed",
    error: { code: "not_found", message: "Endpoint not found." },
  });
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
