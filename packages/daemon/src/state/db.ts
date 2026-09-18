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

/** Close the connection and forget it, so the next initDb() opens fresh. Used by tests and shutdown. */
export function closeDb(): void {
  if (!_db) return;
  _db.close();
  _db = null;
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

    -- Strata. Each learning is one durable fact about a repo. Layers progress:
    -- topsoil (fresh, low trust) → loam (referenced, settled) → bedrock (codified)
    -- with fossil as the terminal "outdated but preserved" state.
    CREATE TABLE IF NOT EXISTS learnings (
      id                 TEXT PRIMARY KEY,
      content            TEXT NOT NULL,
      topic              TEXT NOT NULL,
      layer              TEXT NOT NULL DEFAULT 'topsoil',
      source_run_id      TEXT REFERENCES runs(id) ON DELETE SET NULL,
      repo_path          TEXT NOT NULL,
      confidence         REAL NOT NULL DEFAULT 0.5,
      references_count   INTEGER NOT NULL DEFAULT 0,
      created_at         INTEGER NOT NULL,
      last_referenced_at INTEGER,
      promoted_at        INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_learnings_repo_topic ON learnings(repo_path, topic);
    CREATE INDEX IF NOT EXISTS idx_learnings_layer ON learnings(layer, repo_path);

    -- Which learnings were used to prime a run's prompt. This is THE signal
    -- of load-bearingness — every priming row is durable evidence that a
    -- learning shaped real work, and drives topsoil → loam auto-promotion.
    CREATE TABLE IF NOT EXISTS run_primings (
      run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      learning_id TEXT NOT NULL REFERENCES learnings(id) ON DELETE CASCADE,
      sort_order  INTEGER NOT NULL,
      PRIMARY KEY (run_id, learning_id)
    );
    CREATE INDEX IF NOT EXISTS idx_run_primings_order ON run_primings(run_id, sort_order);
  `);

  // Forward-compatible migration: add columns to `runs` as the schema evolves.
  // SQLite only supports ALTER TABLE ADD COLUMN, so we check pragma_table_info
  // and add what's missing. Each new column lives in its own NULL-safe block.
  const runCols = d
    .prepare<[], { name: string }>(`SELECT name FROM pragma_table_info('runs')`)
    .all();
  const hasCol = (name: string) => runCols.some((c) => c.name === name);
  if (!hasCol("task_id")) {
    d.exec(`ALTER TABLE runs ADD COLUMN task_id TEXT`);
  }
  // M4 usage telemetry — populated from the Agent SDK's `result` message.
  if (!hasCol("tokens_in")) {
    d.exec(`ALTER TABLE runs ADD COLUMN tokens_in INTEGER`);
  }
  if (!hasCol("tokens_out")) {
    d.exec(`ALTER TABLE runs ADD COLUMN tokens_out INTEGER`);
  }
  if (!hasCol("cost_usd")) {
    d.exec(`ALTER TABLE runs ADD COLUMN cost_usd REAL`);
  }
  if (!hasCol("model")) {
    d.exec(`ALTER TABLE runs ADD COLUMN model TEXT`);
  }
}
