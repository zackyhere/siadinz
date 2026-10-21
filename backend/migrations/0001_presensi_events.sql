CREATE TABLE IF NOT EXISTS presensi_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  outcome_status TEXT NOT NULL,
  rc INTEGER NOT NULL,
  http_status INTEGER NOT NULL,
  attempted_count INTEGER NOT NULL DEFAULT 0,
  attempted_courses_json TEXT NOT NULL DEFAULT '[]',
  state TEXT,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS presensi_events_created_at_idx
  ON presensi_events (created_at DESC);
