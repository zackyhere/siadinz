CREATE TABLE IF NOT EXISTS course_schedule_slots (
  course_code TEXT NOT NULL,
  class_group TEXT NOT NULL,
  weekday TEXT NOT NULL,
  start_minute INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute INTEGER NOT NULL CHECK (end_minute > start_minute AND end_minute <= 1440),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (course_code, class_group, weekday, start_minute, end_minute)
);
