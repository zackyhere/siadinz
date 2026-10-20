CREATE TABLE IF NOT EXISTS dashboard_settings (
  setting_key TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
