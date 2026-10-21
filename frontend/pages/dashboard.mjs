import { dailySkipKey, isSkippedCourse, legacyCourseKey } from "../../backend/lib/skip-keys.mjs";
import { escapeHtml, renderPage } from "../partials/layout.mjs";
import { renderNavigation } from "../partials/navigation.mjs";

function statusLabel(status) {
  return ({ available: "Tersedia", attended: "Sudah presensi", not_started: "Belum jadwal", unavailable: "Tidak tersedia", skipped: "Dilewati" })[status] ?? status;
}

function renderStatus(status) {
  const value = String(status ?? "unavailable").replace(/[^a-z_]/g, "");
  return `<span class="status status--${escapeHtml(value)}">${escapeHtml(statusLabel(value))}</span>`;
}

function renderAttendanceRows(schedules) {
  return schedules.map((schedule) => `<tr><td>${escapeHtml(schedule.courseName)}</td><td>${escapeHtml(schedule.courseCode)}</td><td>${escapeHtml(schedule.classGroup)}</td><td>${escapeHtml(schedule.date)}</td><td>${escapeHtml(schedule.startTime)}–${escapeHtml(schedule.endTime)}</td><td>${escapeHtml(schedule.lecturerCode)}</td><td>${renderStatus(schedule.status)}</td></tr>`).join("");
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
  const schedules = data.attendance.schedules ?? [];
  const attendanceRows = renderAttendanceRows(schedules);
  const courseRows = renderCourseRows(session, data);
  const courses = data.courseSchedule?.schedules ?? [];
  const available = schedules.filter((schedule) => schedule.status === "available");
  const attended = schedules.filter((schedule) => schedule.status === "attended");
  const skipped = data.attendance.skippedKeys?.length ?? 0;
  const focus = available[0] ?? schedules[0];
  const focusTitle = focus ? focus.courseName : "Belum ada presensi";
  const focusDetail = focus ? `${focus.startTime}–${focus.endTime} · ${focus.classGroup}` : "SiAdin belum mengirim jadwal presensi untuk hari ini.";
  const notice = skipped ? `${skipped} jadwal dilewati hari ini` : "Skip tersedia pada slot kuliah hari ini";
  return renderPage("Dashboard", `${renderNavigation(session.csrf)}<div class="bento-heading"><div><h1>Presensi hari ini</h1><p>Ringkasan kehadiran dan jadwal aktif dari SiAdin.</p></div></div>${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}<div class="bento"><article class="bento-card bento-focus"><span class="bento-card__label">Jadwal prioritas</span><div><h2>${escapeHtml(focusTitle)}</h2><p class="bento-card__detail">${escapeHtml(focusDetail)}</p></div>${renderStatus(focus?.status ?? data.attendance.state ?? "unavailable")}</article><article class="bento-card bento-active"><span class="bento-card__label">Siap presensi</span><strong class="bento-card__value">${available.length}</strong><p class="bento-card__detail">kelas dapat diproses sekarang</p></article><article class="bento-card bento-courses"><span class="bento-card__label">Semester ini</span><strong class="bento-card__value">${courses.length}</strong><p class="bento-card__detail">mata kuliah terdaftar</p></article><article class="bento-card bento-notice"><span class="bento-card__label">Pengingat</span><h2>${escapeHtml(notice)}</h2><p class="bento-card__detail">${attended.length ? `${attended.length} presensi tercatat hari ini.` : "Periksa kembali saat jadwal dibuka admin."}</p></article></div><section class="dashboard-section"><h2>Jadwal presensi hari ini</h2><p class="dashboard-section__copy">Status ditentukan langsung oleh SiAdin saat halaman dimuat.</p><div class="table"><table><thead><tr><th>Mata kuliah</th><th>Kode</th><th>Kelas</th><th>Tanggal</th><th>Waktu</th><th>Dosen</th><th>Status</th></tr></thead><tbody>${attendanceRows || "<tr><td class=empty-state colspan=7>Belum ada presensi yang tersedia hari ini.</td></tr>"}</tbody></table></div></section><section class="dashboard-section"><h2>Jadwal mata kuliah semester ini</h2><p class="dashboard-section__copy">Skip muncul untuk jadwal yang berlangsung hari ini menurut waktu WIB, meskipun admin belum membuka presensi.</p><div class="table"><table><thead><tr><th>Mata kuliah</th><th>Kode</th><th>Kelas</th><th>SKS</th><th>Hari</th><th>Sesi</th><th>Ruang</th><th>Aksi</th></tr></thead><tbody>${courseRows || "<tr><td class=empty-state colspan=8>Data jadwal semester belum tersedia.</td></tr>"}</tbody></table></div></section>`);
}
