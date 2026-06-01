import type { Task, TaskStatus, CreateTaskRequest } from "@reef/shared";
import { db } from "./db.js";

interface TaskRow {
  id: string;
  title: string;
  body: string;
  repo_path: string;
  status: string;
  priority: number;
  pinned: number;
  current_run_id: string | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    repoPath: row.repo_path,
    status: row.status as TaskStatus,
    priority: row.priority,
    pinned: row.pinned === 1,
    currentRunId: row.current_run_id ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
  };
}

export function insertTask(task: Task): void {
  db()
    .prepare(
      `INSERT INTO tasks (id, title, body, repo_path, status, priority, pinned, current_run_id, created_at, started_at, ended_at)
       VALUES (@id, @title, @body, @repo_path, @status, @priority, @pinned, @current_run_id, @created_at, @started_at, @ended_at)`,
    )
    .run({
      id: task.id,
      title: task.title,
      body: task.body,
      repo_path: task.repoPath,
      status: task.status,
      priority: task.priority,
      pinned: task.pinned ? 1 : 0,
      current_run_id: task.currentRunId ?? null,
      created_at: task.createdAt,
      started_at: task.startedAt ?? null,
      ended_at: task.endedAt ?? null,
    });
}

export function findTask(id: string): Task | null {
  const row = db()
    .prepare<[string], TaskRow>(`SELECT * FROM tasks WHERE id = ?`)
    .get(id);
  return row ? rowToTask(row) : null;
}

export function listAllTasks(): Task[] {
  const rows = db()
    .prepare<[], TaskRow>(
      `SELECT * FROM tasks
       ORDER BY
         CASE status WHEN 'queued' THEN 0 WHEN 'running' THEN 1 ELSE 2 END,
         pinned DESC,
         priority DESC,
         created_at ASC`,
    )
    .all();
  return rows.map(rowToTask);
}

export function findNextQueuedTask(): Task | null {
  const row = db()
    .prepare<[], TaskRow>(
      `SELECT * FROM tasks
       WHERE status = 'queued'
       ORDER BY pinned DESC, priority DESC, created_at ASC
       LIMIT 1`,
    )
    .get();
  return row ? rowToTask(row) : null;
}

export function updateTaskStatus(
  id: string,
  status: TaskStatus,
  patch: { currentRunId?: string | null; startedAt?: number; endedAt?: number } = {},
): void {
  db()
    .prepare(
      `UPDATE tasks
       SET status = ?,
           current_run_id = COALESCE(?, current_run_id),
           started_at    = COALESCE(?, started_at),
           ended_at      = COALESCE(?, ended_at)
       WHERE id = ?`,
    )
    .run(
      status,
      patch.currentRunId === undefined ? null : patch.currentRunId,
      patch.startedAt ?? null,
      patch.endedAt ?? null,
      id,
    );
}

export function deleteTask(id: string): boolean {
  return db().prepare(`DELETE FROM tasks WHERE id = ?`).run(id).changes > 0;
}

export function makeTask(req: CreateTaskRequest, id: string): Task {
  return {
    id,
    title: req.title,
    body: req.body,
    repoPath: req.repoPath,
    status: "queued",
    priority: req.priority,
    pinned: req.pinned,
    createdAt: Date.now(),
  };
}

export function findTaskByCurrentRunId(runId: string): Task | null {
  const row = db()
    .prepare<[string], TaskRow>(
      `SELECT * FROM tasks WHERE current_run_id = ? LIMIT 1`,
    )
    .get(runId);
  return row ? rowToTask(row) : null;
}
