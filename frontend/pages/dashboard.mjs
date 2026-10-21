import { dailySkipKey, isSkippedCourse, legacyCourseKey } from "../../backend/lib/skip-keys.mjs";
import { escapeHtml, renderPage } from "../partials/layout.mjs";
import { renderNavigation } from "../partials/navigation.mjs";

function renderAttendanceRows(schedules) {
  return schedules.map((schedule) => `<tr><td>${escapeHtml(schedule.courseName)}</td><td>${escapeHtml(schedule.courseCode)}</td><td>${escapeHtml(schedule.classGroup)}</td><td>${escapeHtml(schedule.date)}</td><td>${escapeHtml(schedule.startTime)}–${escapeHtml(schedule.endTime)}</td><td>${escapeHtml(schedule.lecturerCode)}</td><td>${escapeHtml(schedule.status)}</td></tr>`).join("");
}

function renderCourseRows(session, data) {
  const skipped = new Set(data.attendance.skippedKeys ?? []);
  const todaySlots = new Set(data.attendance.todaySlotKeys ?? []);

  return (data.courseSchedule?.schedules ?? [])
    .flatMap((course) => course.slots.map((slot) => ({ course, slot })))
    .sort((left, right) => left.slot.weekdayOrder - right.slot.weekdayOrder || left.slot.startTimeOrder - right.slot.startTimeOrder)
    .map(({ course, slot }) => {
      const legacyKey = legacyCourseKey(course.courseCode, course.classGroup);
      const slotKey = `${legacyKey}\u0000${String(slot.day ?? "").trim()}\u0000${String(slot.session ?? "").trim()}\u0000${String(slot.room ?? "").trim()}`;
      const isToday = todaySlots.has(slotKey);
      const isSkipped = [...skipped].some((key) => isSkippedCourse(key, course.courseCode, course.classGroup));
      const action = isToday
        ? `<form method="post" action="${isSkipped ? "/skip/cancel" : "/skip"}"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="key" value="${escapeHtml(dailySkipKey(course.courseCode, course.classGroup))}"><button class="link">${isSkipped ? "Tidak jadi skip" : "Skip hari ini"}</button></form>`
        : "";
      return `<tr><td>${escapeHtml(course.courseName)}</td><td>${escapeHtml(course.courseCode)}</td><td>${escapeHtml(course.classGroup)}</td><td>${escapeHtml(course.credits)}</td><td>${escapeHtml(slot.day)}</td><td>${escapeHtml(slot.session)}</td><td>${escapeHtml(slot.room)}</td><td>${action}</td></tr>`;
    })
    .join("");
}

export function renderDashboard(session, data, message = "") {
  const attendanceRows = renderAttendanceRows(data.attendance.schedules);
  const courseRows = renderCourseRows(session, data);
  return renderPage("Dashboard", `${renderNavigation(session.csrf)}<section><h1>Jadwal presensi hari ini</h1>${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}<div class="table"><table><thead><tr><th>Mata kuliah</th><th>Kode</th><th>Kelas</th><th>Tanggal</th><th>Waktu</th><th>Dosen</th><th>Status</th></tr></thead><tbody>${attendanceRows || "<tr><td colspan=7>Presensi belum tersedia.</td></tr>"}</tbody></table></div></section><section><h1>Jadwal mata kuliah semester ini</h1><p>Skip muncul untuk jadwal yang berlangsung hari ini menurut waktu WIB, meskipun admin belum membuka presensi.</p><div class="table"><table><thead><tr><th>Mata kuliah</th><th>Kode</th><th>Kelas</th><th>SKS</th><th>Hari</th><th>Sesi</th><th>Ruang</th><th>Aksi</th></tr></thead><tbody>${courseRows || "<tr><td colspan=8>Data tidak tersedia.</td></tr>"}</tbody></table></div></section>`);
}
