import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { REEF_HOME } from "../lifecycle/paths.js";

let _db: Database.Database | null = null;

export function initDb(filePath?: string): Database.Database {
  if (_db) return _db;
  const file = filePath ?? path.join(REEF_HOME, "state.db");
  mkdirSync(path.dirname(file), { recursive: true });
  _db = new Database(file);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.pragma("synchronous = NORMAL");
  applySchema(_db);
  return _db;
}

export function db(): Database.Database {
  if (!_db) throw new Error("db not initialized — call initDb() first");
  return _db;
}

function applySchema(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id              TEXT PRIMARY KEY,
      repo_path       TEXT NOT NULL,
      prompt          TEXT NOT NULL,
      model           TEXT,
      status          TEXT NOT NULL,
      started_at      INTEGER NOT NULL,
      ended_at        INTEGER,
      exit_code       INTEGER,
      git_before_sha  TEXT,
      changes_json    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);

    CREATE TABLE IF NOT EXISTS run_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id       TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      type         TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      ts           INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON run_events(run_id, id);

    CREATE TABLE IF NOT EXISTS tasks (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      body            TEXT NOT NULL DEFAULT '',
      repo_path       TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'queued',
      priority        INTEGER NOT NULL DEFAULT 2,
      pinned          INTEGER NOT NULL DEFAULT 0,
      current_run_id  TEXT,
      created_at      INTEGER NOT NULL,
      started_at      INTEGER,
      ended_at        INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_queue
      ON tasks(status, pinned DESC, priority DESC, created_at ASC);
  `);

  // Forward-compatible migration: add runs.task_id if upgrading from a DB that
  // predates the tasks model.
  const runCols = d
    .prepare<[], { name: string }>(`SELECT name FROM pragma_table_info('runs')`)
    .all();
  if (!runCols.some((c) => c.name === "task_id")) {
    d.exec(`ALTER TABLE runs ADD COLUMN task_id TEXT`);
  }
}
