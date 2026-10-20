import {
  attendAvailableSchedules,
  fetchAttendanceStatus,
} from "./attendance-status.mjs";

const RC = {
  SUCCESS: 0,
  NOT_AVAILABLE: 1,
  INVALID_REQUEST: 2,
  UPSTREAM_FAILED: 3,
  UPSTREAM_AUTHENTICATION_FAILED: 4,
  SERVER_MISCONFIGURED: 5,
  UNAUTHORIZED: 6,
};

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

function failureBody(rc, code, message) {
  return { status: "failed", rc, error: { code, message } };
}

function attemptedCourses(attempted) {
  return attempted.map(({ source, courseName, courseCode, classGroup, date, idMaster }) => ({
    source, courseName, courseCode, classGroup, date, idMaster,
  }));
}

async function recordPresensiEvent(database, outcome) {
  try {
    await database.prepare(`
      INSERT INTO presensi_events (
        created_at, outcome_status, rc, http_status, attempted_count,
        attempted_courses_json, state, error_code, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      new Date().toISOString(),
      outcome.status,
      outcome.rc,
      outcome.httpStatus,
      outcome.attempted.length,
      JSON.stringify(attemptedCourses(outcome.attempted)),
      outcome.state ?? null,
      outcome.errorCode ?? null,
      outcome.errorMessage ?? null,
    ).run();
  } catch (error) {
    console.error("Failed to persist presensi audit event:", error);
  }
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

function upstreamFailure(error) {
  const httpStatus = upstreamStatus(error);
  const isAuthenticationFailure = httpStatus === 401 || httpStatus === 403;
  return {
    httpStatus,
    body: failureBody(
      isAuthenticationFailure ? RC.UPSTREAM_AUTHENTICATION_FAILED : RC.UPSTREAM_FAILED,
      isAuthenticationFailure ? "authentication_failed" : "upstream_failed",
      error.message,
    ),
  };
}

export async function handleRequest(request, env, fetchImpl = fetch, ctx) {
  if (!env.PRESENSI_ACCESS_TOKEN || !env.PRESENSI_API_SECRET || !env.DB) {
    return json(500, failureBody(
      RC.SERVER_MISCONFIGURED,
      "server_misconfigured",
      "Worker secrets or D1 binding are not configured.",
    ));
  }

  if (!await hasValidApiSecret(request, env.PRESENSI_API_SECRET)) {
    return json(401, failureBody(
      RC.UNAUTHORIZED,
      "unauthorized",
      "A valid X-API-Secret header is required.",
    ));
  }

  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/v1/jadwal") {
    try {
      const attendance = await fetchAttendanceStatus(env.PRESENSI_ACCESS_TOKEN, fetchImpl);
      return json(200, {
        status: "success",
        rc: RC.SUCCESS,
        checkedAt: new Date().toISOString(),
        data: attendance,
      });
    } catch (error) {
      const failure = upstreamFailure(error instanceof Error ? error : new Error(String(error)));
      return json(failure.httpStatus, failure.body);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/v1/presensi") {
    let outcome;
    try {
      const attendance = await attendAvailableSchedules(env.PRESENSI_ACCESS_TOKEN, fetchImpl);
      outcome = attendance.attempted.length === 0
        ? {
          httpStatus: 200,
          status: "failed",
          rc: RC.NOT_AVAILABLE,
          message: "No schedule is currently available for attendance.",
          state: attendance.state,
          attempted: [],
          data: attendance,
        }
        : {
          httpStatus: 200,
          status: "success",
          rc: RC.SUCCESS,
          message: "Attendance was submitted and verified.",
          state: attendance.state,
          attempted: attendance.attempted,
          data: attendance,
        };
    } catch (error) {
      const failure = upstreamFailure(error instanceof Error ? error : new Error(String(error)));
      outcome = {
        httpStatus: failure.httpStatus,
        status: "failed",
        rc: failure.body.rc,
        errorCode: failure.body.error.code,
        errorMessage: failure.body.error.message,
        attempted: [],
      };
    }

    const audit = recordPresensiEvent(env.DB, outcome);
    if (ctx?.waitUntil) ctx.waitUntil(audit);
    else await audit;

    if (outcome.status === "success" || outcome.rc === RC.NOT_AVAILABLE) {
      return json(outcome.httpStatus, {
        status: outcome.status,
        rc: outcome.rc,
        message: outcome.message,
        checkedAt: new Date().toISOString(),
        data: outcome.data,
      });
    }

    return json(outcome.httpStatus, failureBody(outcome.rc, outcome.errorCode, outcome.errorMessage));
  }

  if (["/api/v1/jadwal", "/api/v1/presensi"].includes(url.pathname)) {
    return json(405, failureBody(
      RC.INVALID_REQUEST,
      "method_not_allowed",
      "Use GET /api/v1/jadwal or POST /api/v1/presensi.",
    ));
  }

  return json(404, failureBody(RC.INVALID_REQUEST, "not_found", "Endpoint not found."));
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, fetch, ctx);
  },
};
