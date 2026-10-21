const statements = [
  "CREATE TABLE IF NOT EXISTS presensi_events (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, outcome_status TEXT NOT NULL, rc INTEGER NOT NULL, http_status INTEGER NOT NULL, attempted_count INTEGER NOT NULL DEFAULT 0, attempted_courses_json TEXT NOT NULL DEFAULT '[]', state TEXT, error_code TEXT, error_message TEXT)",
  "CREATE INDEX IF NOT EXISTS presensi_events_created_at_idx ON presensi_events (created_at DESC)",
  "CREATE TABLE IF NOT EXISTS dashboard_settings (setting_key TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS presensi_skips (id_master TEXT NOT NULL, skip_date TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (id_master, skip_date))",
  "CREATE INDEX IF NOT EXISTS presensi_skips_skip_date_idx ON presensi_skips (skip_date)",
  "CREATE TABLE IF NOT EXISTS course_schedule_slots (course_code TEXT NOT NULL, class_group TEXT NOT NULL, weekday TEXT NOT NULL, start_minute INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440), end_minute INTEGER NOT NULL CHECK (end_minute > start_minute AND end_minute <= 1440), updated_at TEXT NOT NULL, PRIMARY KEY (course_code, class_group, weekday, start_minute, end_minute))",
];

const initialized = new WeakMap();

export function ensureDatabaseSchema(database) {
  if (!database?.batch) return Promise.resolve();
  const pending = initialized.get(database);
  if (pending) return pending;
  const setup = database.batch(statements.map((statement) => database.prepare(statement))).catch((error) => {
    initialized.delete(database);
    throw error;
  });
  initialized.set(database, setup);
  return setup;
}
