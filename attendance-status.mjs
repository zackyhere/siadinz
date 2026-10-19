const API_ORIGIN = "https://api.dinus.ac.id";
const USER_AGENT = "presensi-status-check/2.0";

export const ATTENDANCE_SOURCES = [
  {
    kind: "online",
    path: "/api/v1/siadin/get-krs-online",
    submitPath: "/api/v1/siadin/absensi-online",
  },
  {
    kind: "matrikulasi",
    path: "/api/v1/siadin/get-krs-online-matr",
    submitPath: "/api/v1/siadin/absensi-online-matr",
  },
  {
    kind: "semester_antara",
    path: "/api/v1/siadin/get-krs-online-sa",
    submitPath: "/api/v1/siadin/absensi-online-sa",
  },
];

function isZero(value) {
  return value === 0 || value === "0";
}

function asScheduleArray(payload, source) {
  const data = payload?.data;
  if (!data || !Array.isArray(data.jadwal)) {
    throw new Error(`Unexpected ${source.kind} attendance response shape.`);
  }
  return data.jadwal;
}

export function classifySchedule(schedule) {
  if (isZero(schedule.jam_kul)) return "not_started";
  if (isZero(schedule.is_attend)) return "available";
  return "attended";
}
function publicSchedule(source, schedule) {
  return {
    source: source.kind,
    courseName: schedule.nmmk ?? null,
    courseCode: schedule.kdmk ?? null,
    classGroup: schedule.klpk ?? null,
    date: schedule.tgl_kuliah ?? null,
    startTime: schedule.jam_mulai ?? null,
    endTime: schedule.jam_selesai ?? null,
    lecturerCode: schedule.kdds ?? null,
    attendancePercent: schedule.prsn_hadir ?? null,
    status: classifySchedule(schedule),
    details: schedule,
  };
}

function eligibleSchedules(sourcePayloads) {
  return sourcePayloads.flatMap(({ source, payload }) =>
    asScheduleArray(payload, source)
      .filter((schedule) => classifySchedule(schedule) === "available")
      .map((schedule) => ({ source, schedule })),
  );
}

function attendanceIdentity({ source, schedule }) {
  if (!schedule.id_master || !schedule.kdds) {
    throw new Error(`Eligible ${source.kind} schedule is missing attendance identifiers.`);
  }

  return {
    source: source.kind,
    courseName: schedule.nmmk ?? null,
    courseCode: schedule.kdmk ?? null,
    classGroup: schedule.klpk ?? null,
    date: schedule.tgl_kuliah ?? null,
    idMaster: String(schedule.id_master),
  };
}

function isAttendanceConfirmed(identity, sourcePayloads) {
  return sourcePayloads.some(({ source, payload }) =>
    source.kind === identity.source && asScheduleArray(payload, source).some((schedule) =>
      String(schedule.id_master) === identity.idMaster
      && classifySchedule(schedule) === "attended",
    ),
  );
}

export function summarizeAttendance(sourcePayloads) {
  const schedules = sourcePayloads.flatMap(({ source, payload }) =>
    asScheduleArray(payload, source).map((schedule) => publicSchedule(source, schedule)),
  );

  const hasAttendanceAction = schedules.some(({ status }) => status === "available");
  const hasSuccessfulAttendance = schedules.some(({ status }) => status === "attended");
  const hasNotStartedSchedule = schedules.some(({ status }) => status === "not_started");

  return {
    hasAttendanceAction,
    hasSuccessfulAttendance,
    state: hasAttendanceAction
      ? "available"
      : hasSuccessfulAttendance
        ? "attended"
        : hasNotStartedSchedule
          ? "not_started"
          : "unavailable",
    schedules,
  };
}

export async function fetchAttendanceSource(source, accessToken, fetchImpl = fetch) {
  const response = await fetchImpl(new URL(source.path, API_ORIGIN), {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": USER_AGENT,
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`${source.kind} attendance request returned HTTP ${response.status}.`);
  }
  if (!contentType.includes("application/json")) {
    throw new Error(`${source.kind} attendance request did not return JSON.`);
  }

  try {
    return { source, payload: JSON.parse(body) };
  } catch {
    throw new Error(`${source.kind} attendance response contained invalid JSON.`);
  }
}

async function fetchAttendanceSources(accessToken, fetchImpl) {
  return Promise.all(
    ATTENDANCE_SOURCES.map((source) => fetchAttendanceSource(source, accessToken, fetchImpl)),
  );
}

export async function submitAttendance(candidate, accessToken, fetchImpl = fetch) {
  const { source, schedule } = candidate;
  const response = await fetchImpl(new URL(source.submitPath, API_ORIGIN), {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "user-agent": USER_AGENT,
    },
    body: JSON.stringify({
      comment: "",
      id_master: schedule.id_master,
      kdds: schedule.kdds,
    }),
  });

  if (!response.ok) {
    throw new Error(`${source.kind} attendance submission returned HTTP ${response.status}.`);
  }
}

export async function fetchAttendanceStatus(accessToken, fetchImpl = fetch) {
  const sourcePayloads = await fetchAttendanceSources(accessToken, fetchImpl);
  return summarizeAttendance(sourcePayloads);
}

export async function attendAvailableSchedules(accessToken, fetchImpl = fetch) {
  const before = await fetchAttendanceSources(accessToken, fetchImpl);
  const candidates = eligibleSchedules(before);
  const attempted = candidates.map(attendanceIdentity);

  if (candidates.length === 0) {
    return { attempted, ...summarizeAttendance(before) };
  }

  for (const candidate of candidates) {
    await submitAttendance(candidate, accessToken, fetchImpl);
  }

  const after = await fetchAttendanceSources(accessToken, fetchImpl);
  const unconfirmed = attempted.filter((identity) => !isAttendanceConfirmed(identity, after));
  if (unconfirmed.length > 0) {
    throw new Error("Attendance submission completed, but status verification did not confirm every schedule.");
  }

  return { attempted, ...summarizeAttendance(after) };
}
