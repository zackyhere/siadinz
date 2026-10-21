import { escapeHtml, renderPage } from "../partials/layout.mjs";
import { renderNavigation } from "../partials/navigation.mjs";

function attendanceFor(course, attendance) {
  return attendance.find((schedule) => schedule.courseCode === course.courseCode && schedule.classGroup === course.classGroup);
}

function attendanceButton(session, course, attendance) {
  const status = attendance?.status;
  if (status === "available") {
    return `<form method="post" action="/attendance"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><input type="hidden" name="courseCode" value="${escapeHtml(course.courseCode)}"><input type="hidden" name="classGroup" value="${escapeHtml(course.classGroup)}"><button>Absen sekarang</button></form>`;
  }
  if (status === "attended") return `<button type="button" disabled>Sudah absen</button>`;
  return `<button type="button" disabled>Presensi belum dibuka</button>`;
}

function todayCourses(session, data) {
  const todaySlots = new Set(data.attendance.todaySlotKeys ?? []);
  const attendance = data.attendance.schedules ?? [];
  return (data.courseSchedule?.schedules ?? [])
    .flatMap((course) => course.slots.map((slot) => ({ course, slot })))
    .filter(({ course, slot }) => todaySlots.has(`${course.courseCode}\u0000${course.classGroup}\u0000${String(slot.day ?? "").trim()}\u0000${String(slot.session ?? "").trim()}\u0000${String(slot.room ?? "").trim()}`))
    .sort((left, right) => left.slot.startTimeOrder - right.slot.startTimeOrder)
    .map(({ course, slot }) => {
      const current = attendanceFor(course, attendance);
      return `<article class="today-course"><div><h2>${escapeHtml(course.courseName)}</h2><p>${escapeHtml(slot.room)} · ${escapeHtml(slot.session)}</p></div>${attendanceButton(session, course, current)}</article>`;
    })
    .join("");
}

function sessionBounds(session) {
  const times = String(session ?? "").match(/\d{1,2}[.:]\d{2}/g) ?? [];
  return { start: times[0] ?? String(session ?? ""), end: times.at(-1) ?? String(session ?? "") };
}

function groupedSchedule(schedules) {
  const byDay = new Map();
  for (const course of schedules) {
    for (const slot of course.slots) {
      const group = byDay.get(slot.day) ?? { day: slot.day, order: slot.weekdayOrder, slots: [] };
      group.slots.push({ course, slot });
      byDay.set(slot.day, group);
    }
  }
  return [...byDay.values()]
    .sort((left, right) => left.order - right.order)
    .map((group) => {
      const sorted = group.slots.sort((left, right) => left.slot.startTimeOrder - right.slot.startTimeOrder);
      const first = sessionBounds(sorted[0].slot.session);
      const last = sessionBounds(sorted.at(-1).slot.session);
      return { ...group, slots: sorted, time: `${first.start}–${last.end}` };
    });
}

function scheduleRows(slots) {
  return slots.map(({ course, slot }) => `<tr><td>${escapeHtml(course.courseName)}</td><td>${escapeHtml(course.courseCode)}</td><td>${escapeHtml(course.classGroup)}</td><td>${escapeHtml(course.credits)}</td><td>${escapeHtml(slot.session)}</td><td>${escapeHtml(slot.room)}</td></tr>`).join("");
}

function weeklySchedule(schedules) {
  return groupedSchedule(schedules).map(({ day, time, slots }) => `<details class="day-schedule"><summary><span>${escapeHtml(day)}</span><span class="day-schedule__time">${escapeHtml(time)}</span></summary><div class="day-schedule__content"><div class="table"><table><thead><tr><th>Mata kuliah</th><th>Kode</th><th>Kelas</th><th>SKS</th><th>Sesi</th><th>Ruang</th></tr></thead><tbody>${scheduleRows(slots)}</tbody></table></div></div></details>`).join("");
}

export function renderDashboard(session, data, message = "") {
  const courses = data.courseSchedule?.schedules ?? [];
  const today = todayCourses(session, data);
  const schedule = weeklySchedule(courses);
  return renderPage("Dashboard", `${renderNavigation(session.csrf, "dashboard")}${message ? `<p class="form-message">${escapeHtml(message)}</p>` : ""}<section class="today-card"><div class="today-card__heading"><h1>Jadwal matkul hari ini</h1><p>Tombol presensi aktif hanya ketika SiAdin membuka jadwalnya.</p></div><div class="today-list">${today || "<p class=empty-today>Tidak ada jadwal mata kuliah hari ini.</p>"}</div></section><section class="semester-section"><h1>Jadwal mata kuliah semester ini</h1><p>Pilih hari untuk melihat mata kuliah, kelas, SKS, sesi, dan ruang.</p>${schedule || "<p class=empty-state>Data jadwal semester belum tersedia.</p>"}</section>`);
}
