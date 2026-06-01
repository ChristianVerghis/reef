import type { AgentRun, RunStatus } from "@reef/shared";
import type { GitChanges } from "../agents/git.js";
import { db } from "./db.js";

interface RunRow {
  id: string;
  repo_path: string;
  prompt: string;
  model: string | null;
  status: string;
  started_at: number;
  ended_at: number | null;
  exit_code: number | null;
  git_before_sha: string | null;
  changes_json: string | null;
  task_id: string | null;
}

function rowToRun(row: RunRow): AgentRun {
  return {
    id: row.id,
    repoPath: row.repo_path,
    prompt: row.prompt,
    model: row.model ?? undefined,
    status: row.status as RunStatus,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    exitCode: row.exit_code ?? undefined,
    gitBeforeSha: row.git_before_sha ?? undefined,
    changes: row.changes_json ? (JSON.parse(row.changes_json) as GitChanges) : undefined,
    taskId: row.task_id ?? undefined,
  };
}

export function insertRun(run: AgentRun): void {
  db()
    .prepare(
      `INSERT INTO runs (id, repo_path, prompt, model, status, started_at, ended_at, exit_code, git_before_sha, changes_json, task_id)
       VALUES (@id, @repo_path, @prompt, @model, @status, @started_at, @ended_at, @exit_code, @git_before_sha, @changes_json, @task_id)`,
    )
    .run({
      id: run.id,
      repo_path: run.repoPath,
      prompt: run.prompt,
      model: run.model ?? null,
      status: run.status,
      started_at: run.startedAt,
      ended_at: run.endedAt ?? null,
      exit_code: run.exitCode ?? null,
      git_before_sha: run.gitBeforeSha ?? null,
      changes_json: run.changes ? JSON.stringify(run.changes) : null,
      task_id: run.taskId ?? null,
    });
}

export function findRun(id: string): AgentRun | null {
  const row = db().prepare<[string], RunRow>(`SELECT * FROM runs WHERE id = ?`).get(id);
  return row ? rowToRun(row) : null;
}

export function listAllRuns(): AgentRun[] {
  const rows = db()
    .prepare<[], RunRow>(`SELECT * FROM runs ORDER BY started_at DESC`)
    .all();
  return rows.map(rowToRun);
}

export function updateRunStatus(
  id: string,
  status: RunStatus,
  endedAt?: number,
  exitCode?: number,
): void {
  db()
    .prepare(
      `UPDATE runs SET status = ?, ended_at = COALESCE(?, ended_at), exit_code = COALESCE(?, exit_code) WHERE id = ?`,
    )
    .run(status, endedAt ?? null, exitCode ?? null, id);
}

export function updateRunGitBaseline(id: string, sha: string | null): void {
  db().prepare(`UPDATE runs SET git_before_sha = ? WHERE id = ?`).run(sha, id);
}

export function updateRunChanges(id: string, changes: GitChanges | null): void {
  db()
    .prepare(`UPDATE runs SET changes_json = ? WHERE id = ?`)
    .run(changes ? JSON.stringify(changes) : null, id);
}

/**
 * Called on daemon startup. Any runs still in queued/running state belong to a
 * subprocess that died with the previous daemon — mark them failed so the UI
 * doesn't show a perpetually-spinning row.
 */
export function reconcileOrphanedRuns(): number {
  const now = Date.now();
  const result = db()
    .prepare(
      `UPDATE runs
       SET status = 'failed', ended_at = ?, exit_code = -2
       WHERE status IN ('queued', 'running')`,
    )
    .run(now);
  return result.changes;
}
