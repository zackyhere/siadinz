import assert from "node:assert/strict";
import test from "node:test";

import { cacheCourseSchedule, isWithinCourseHours, requestedCourseHours } from "./course-hours.mjs";

function database() {
  const slots = [];
  return {
    prepare: (statement) => ({
      bind: (...values) => ({
        all: async () => ({ results: [...slots] }),
        run: async () => {
          if (statement.startsWith("DELETE FROM course_schedule_slots")) slots.length = 0;
          if (statement.startsWith("INSERT INTO course_schedule_slots")) slots.push({
            course_code: values[0], class_group: values[1], weekday: values[2], start_minute: values[3], end_minute: values[4], updated_at: values[5],
          });
          return { success: true };
        },
      }),
    }),
  };
}

test("course hours compare cached WIB schedules in WIB and UTC", async () => {
  const db = database();
  await cacheCourseSchedule(db, { schedules: [{ courseCode: "F11.64103", classGroup: "F11.C101", slots: [
    { day: "RABU", session: "08.40-10.20", room: "Lab" },
  ] }] }, new Date("2026-10-20T00:00:00.000Z"));

  const within = new Date("2026-10-21T02:00:00.000Z"); // 09:00 WIB, Wednesday
  const outside = new Date("2026-10-21T01:00:00.000Z"); // 08:00 WIB, Wednesday
  assert.equal(await isWithinCourseHours(db, "WIB", within), true);
  assert.equal(await isWithinCourseHours(db, "UTC", within), true);
  assert.equal(await isWithinCourseHours(db, "WIB", outside), false);
  assert.equal(await isWithinCourseHours(db, "UTC", outside), false);
});

test("course-hour headers require WIB or UTC only when enabled", () => {
  assert.equal(requestedCourseHours(new Headers()), null);
  assert.equal(requestedCourseHours(new Headers({ "Jam-Matkul": "true", "Time-Zone": "WIB" })), "WIB");
  assert.throws(() => requestedCourseHours(new Headers({ "Jam-Matkul": "true", "Time-Zone": "Asia/Jakarta" })), /Time-Zone/);
});
