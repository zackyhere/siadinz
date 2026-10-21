const WEEK_MINUTES = 7 * 24 * 60;
const WIB_OFFSET_MINUTES = 7 * 60;
const WEEKDAY_INDEX = new Map([
  ["SENIN", 0], ["SELASA", 1], ["RABU", 2], ["KAMIS", 3], ["JUMAT", 4], ["SABTU", 5], ["MINGGU", 6],
]);

function minutes(value) {
  const match = /^(\d{1,2})[.:](\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const result = Number(match[1]) * 60 + Number(match[2]);
  return result < 24 * 60 ? result : null;
}

function sessionRange(session) {
  const [start, end] = String(session ?? "").trim().split(/\s*[–-]\s*/, 2);
  const startMinute = minutes(start);
  const endMinute = minutes(end);
  return startMinute === null || endMinute === null || endMinute <= startMinute ? null : { startMinute, endMinute };
}

function dayIndex(day) {
  return WEEKDAY_INDEX.get(String(day ?? "").trim().toLocaleUpperCase("id-ID"));
}

function requestTime(now, zone) {
  const timeZone = zone === "WIB" ? "Asia/Jakarta" : "UTC";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const weekday = new Map([["Monday", 0], ["Tuesday", 1], ["Wednesday", 2], ["Thursday", 3], ["Friday", 4], ["Saturday", 5], ["Sunday", 6]]).get(value("weekday"));
  return weekday * 24 * 60 + Number(value("hour")) * 60 + Number(value("minute"));
}

function includes(requestMinute, weekday, startMinute, endMinute, zone) {
  const scheduleDay = dayIndex(weekday);
  if (scheduleDay === undefined) return false;
  const offset = zone === "UTC" ? -WIB_OFFSET_MINUTES : 0;
  const start = scheduleDay * 24 * 60 + Number(startMinute) + offset;
  const end = scheduleDay * 24 * 60 + Number(endMinute) + offset;
  return [-WEEK_MINUTES, 0, WEEK_MINUTES].some((weekOffset) => requestMinute >= start + weekOffset && requestMinute < end + weekOffset);
}

export function requestedCourseHours(headers) {
  if (headers.get("jam-matkul")?.trim().toLowerCase() !== "true") return null;
  const zone = headers.get("time-zone")?.trim().toUpperCase();
  if (zone !== "WIB" && zone !== "UTC") throw new Error("Time-Zone must be WIB or UTC when Jam-Matkul is true.");
  return zone;
}

export async function cacheCourseSchedule(database, schedule, now = new Date()) {
  const slots = (schedule.schedules ?? []).flatMap((course) => (course.slots ?? []).flatMap((slot) => {
    const range = sessionRange(slot.session);
    const weekday = String(slot.day ?? "").trim().toLocaleUpperCase("id-ID");
    if (!range || dayIndex(weekday) === undefined) return [];
    return [{ courseCode: String(course.courseCode ?? "").trim(), classGroup: String(course.classGroup ?? "").trim(), weekday, ...range }];
  })).filter((slot) => slot.courseCode && slot.classGroup);
  await database.prepare("DELETE FROM course_schedule_slots").bind().run();
  for (const slot of slots) {
    await database.prepare("INSERT INTO course_schedule_slots (course_code, class_group, weekday, start_minute, end_minute, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(slot.courseCode, slot.classGroup, slot.weekday, slot.startMinute, slot.endMinute, now.toISOString()).run();
  }
}

export async function isWithinCourseHours(database, zone, now = new Date()) {
  const result = await database.prepare("SELECT weekday, start_minute, end_minute FROM course_schedule_slots").bind().all();
  const currentMinute = requestTime(now, zone);
  return (result.results ?? []).some((slot) => includes(currentMinute, slot.weekday, slot.start_minute, slot.end_minute, zone));
}
