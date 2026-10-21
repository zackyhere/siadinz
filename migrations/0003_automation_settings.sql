CREATE TABLE IF NOT EXISTS presensi_skips (
  id_master TEXT NOT NULL,
  skip_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id_master, skip_date)
);

CREATE INDEX IF NOT EXISTS presensi_skips_skip_date_idx
  ON presensi_skips (skip_date);
