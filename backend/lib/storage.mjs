const schema = `
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
CREATE INDEX IF NOT EXISTS presensi_events_created_at_idx ON presensi_events (created_at DESC);
CREATE TABLE IF NOT EXISTS dashboard_settings (
  setting_key TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS presensi_skips (
  id_master TEXT NOT NULL,
  skip_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id_master, skip_date)
);
CREATE INDEX IF NOT EXISTS presensi_skips_skip_date_idx ON presensi_skips (skip_date);
CREATE TABLE IF NOT EXISTS course_schedule_slots (
  course_code TEXT NOT NULL,
  class_group TEXT NOT NULL,
  weekday TEXT NOT NULL,
  start_minute INTEGER NOT NULL CHECK (start_minute >= 0 AND start_minute < 1440),
  end_minute INTEGER NOT NULL CHECK (end_minute > start_minute AND end_minute <= 1440),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (course_code, class_group, weekday, start_minute, end_minute)
);`;

export class AppStorage {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    this.sql.exec(schema);
  }

  async fetch(request) {
    const { operation, statement, values } = await request.json();
    const rows = this.sql.exec(statement, ...(values ?? [])).toArray();
    if (operation === "first") return Response.json(rows[0] ?? null);
    if (operation === "all") return Response.json({ results: rows });
    if (operation === "run") return Response.json({ success: true });
    return new Response("Invalid storage operation.", { status: 400 });
  }
}

function remoteStatement(stub, statement) {
  const execute = async (operation, values) => {
    const response = await stub.fetch("https://app-storage/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation, statement, values }),
    });
    if (!response.ok) throw new Error(`Storage returned HTTP ${response.status}.`);
    return response.json();
  };
  return {
    bind: (...values) => ({
      first: () => execute("first", values),
      all: () => execute("all", values),
      run: () => execute("run", values),
    }),
  };
}

export function databaseFor(env) {
  if (env.DB) return env.DB;
  if (!env.APP_STORAGE) return null;
  const stub = env.APP_STORAGE.get(env.APP_STORAGE.idFromName("singleton"));
  return { prepare: (statement) => remoteStatement(stub, statement) };
}
