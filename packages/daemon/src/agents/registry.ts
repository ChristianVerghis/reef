import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import type { AgentRun, CreateRunRequest, RunStatus } from "@reef/shared";
import { runLogPath } from "../lifecycle/paths.js";
import { emit } from "./events.js";
import { snapshot, changesSince, diffSince } from "./git.js";
import {
  insertRun,
  findRun,
  listAllRuns,
  updateRunStatus,
  updateRunGitBaseline,
  updateRunChanges,
} from "../state/runs.js";
import { findTaskByCurrentRunId, updateTaskStatus } from "../state/tasks.js";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

// Live subprocess tracking — intentionally not persisted; rebuilt fresh each daemon
// boot. Reconciliation in state/runs.ts marks any orphaned rows failed on startup.
const liveProcs = new Map<string, ChildProcess>();

export function listRuns(): AgentRun[] {
  return listAllRuns();
}

export function getRun(id: string): AgentRun | null {
  return findRun(id);
}

export async function createRun(req: CreateRunRequest): Promise<AgentRun> {
  const id = shortId();
  const repoPath = path.resolve(req.repoPath);
  if (!existsSync(repoPath)) {
    throw new BadRequestError(`repo path does not exist: ${repoPath}`);
  }

  const run: AgentRun = {
    id,
    repoPath,
    prompt: req.prompt,
    model: req.model,
    status: "queued",
    startedAt: Date.now(),
    taskId: req.taskId ?? null,
  };
  insertRun(run);

  queueMicrotask(() => spawnAgent(id).catch((err) => fail(id, err)));

  return run;
}

export function stopRun(id: string): boolean {
  const proc = liveProcs.get(id);
  if (!proc) return false;
  proc.kill("SIGTERM");
  return true;
}

export async function getRunDiff(id: string): Promise<{ diff: string; truncated: boolean } | null> {
  const run = findRun(id);
  if (!run) return null;
  return diffSince(run.repoPath, run.gitBeforeSha ?? null);
}

async function spawnAgent(id: string): Promise<void> {
  const run = findRun(id);
  if (!run) return;

  const before = await snapshot(run.repoPath);
  updateRunGitBaseline(id, before.sha);

  setStatus(id, "running");

  const logStream = createWriteStream(runLogPath(id), { flags: "a" });
  logStream.write(
    `# reef run ${id}\n# repo: ${run.repoPath}\n# prompt: ${run.prompt}\n# started: ${new Date(run.startedAt).toISOString()}\n# git baseline: ${before.sha ?? "(not a git repo)"}\n\n`,
  );

  const proc = spawn("claude", ["-p", run.prompt], {
    cwd: run.repoPath,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  liveProcs.set(id, proc);

  proc.stdout?.setEncoding("utf8");
  proc.stderr?.setEncoding("utf8");

  proc.stdout?.on("data", (chunk: string) => {
    logStream.write(chunk);
    emit({ type: "stdout", runId: id, chunk, ts: Date.now() });
  });

  proc.stderr?.on("data", (chunk: string) => {
    logStream.write(`[stderr] ${chunk}`);
    emit({ type: "stderr", runId: id, chunk, ts: Date.now() });
  });

  proc.on("error", (err) => {
    logStream.write(`\n[error] ${err.message}\n`);
    liveProcs.delete(id);
    fail(id, err);
    logStream.end();
  });

  proc.on("close", async (code) => {
    liveProcs.delete(id);
    logStream.write(`\n# exit: ${code}\n`);
    try {
      const ch = await changesSince(run.repoPath, before.sha);
      updateRunChanges(id, ch);
      if (ch) {
        logStream.write(
          `# changes: ${ch.filesChanged} files (+${ch.insertions}/-${ch.deletions})\n`,
        );
      }
    } catch (err) {
      logStream.write(`\n[git-diff failed] ${err instanceof Error ? err.message : err}\n`);
    }
    logStream.end();
    finalize(id, code ?? 0);
  });
}

function setStatus(id: string, status: RunStatus, exitCode?: number) {
  const endedAt = status === "done" || status === "failed" ? Date.now() : undefined;
  updateRunStatus(id, status, endedAt, exitCode);
  emit({ type: "status", runId: id, status, exitCode, ts: Date.now() });
}

function finalize(id: string, exitCode: number) {
  const status = exitCode === 0 ? "done" : "failed";
  setStatus(id, status, exitCode);
  // Mirror the run's outcome onto any linked task so the queue updates.
  const linkedTask = findTaskByCurrentRunId(id);
  if (linkedTask) {
    updateTaskStatus(linkedTask.id, status, { endedAt: Date.now() });
  }
}

function fail(id: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  emit({ type: "stderr", runId: id, chunk: `\n[reef] ${message}\n`, ts: Date.now() });
  setStatus(id, "failed", -1);
}

function shortId(): string {
  return randomUUID().slice(0, 8);
}
