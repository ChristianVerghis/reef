import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import type { AgentRun, CreateRunRequest, RunEvent, RunStatus } from "@roost/shared";
import { runLogPath } from "../lifecycle/paths.js";
import { emit } from "./events.js";

interface RegistryEntry {
  run: AgentRun;
  proc?: ChildProcess;
}

const runs = new Map<string, RegistryEntry>();

export function listRuns(): AgentRun[] {
  return [...runs.values()]
    .map((e) => e.run)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function getRun(id: string): AgentRun | null {
  return runs.get(id)?.run ?? null;
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
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
  };
  runs.set(id, { run });

  // Fire-and-track: spawn after returning so the HTTP response isn't blocked.
  queueMicrotask(() => spawnAgent(id).catch((err) => fail(id, err)));

  return run;
}

export function stopRun(id: string): boolean {
  const entry = runs.get(id);
  if (!entry?.proc) return false;
  entry.proc.kill("SIGTERM");
  return true;
}

async function spawnAgent(id: string): Promise<void> {
  const entry = runs.get(id);
  if (!entry) return;
  const { run } = entry;

  setStatus(id, "running");

  const logStream = createWriteStream(runLogPath(id), { flags: "a" });
  logStream.write(`# roost run ${id}\n# repo: ${run.repoPath}\n# prompt: ${run.prompt}\n# started: ${new Date(run.startedAt).toISOString()}\n\n`);

  // M1 uses the `claude` CLI in non-interactive mode. The Claude Agent SDK
  // swap-in happens in M2 once the runtime abstraction is in place.
  const proc = spawn("claude", ["-p", run.prompt], {
    cwd: run.repoPath,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  entry.proc = proc;

  proc.stdout?.setEncoding("utf8");
  proc.stderr?.setEncoding("utf8");

  proc.stdout?.on("data", (chunk: string) => {
    logStream.write(chunk);
    const event: RunEvent = { type: "stdout", runId: id, chunk, ts: Date.now() };
    emit(event);
  });

  proc.stderr?.on("data", (chunk: string) => {
    logStream.write(`[stderr] ${chunk}`);
    const event: RunEvent = { type: "stderr", runId: id, chunk, ts: Date.now() };
    emit(event);
  });

  proc.on("error", (err) => {
    logStream.write(`\n[error] ${err.message}\n`);
    fail(id, err);
    logStream.end();
  });

  proc.on("close", (code) => {
    logStream.write(`\n# exit: ${code}\n`);
    logStream.end();
    finalize(id, code ?? 0);
  });
}

function setStatus(id: string, status: RunStatus, exitCode?: number) {
  const entry = runs.get(id);
  if (!entry) return;
  entry.run.status = status;
  if (status === "done" || status === "failed") {
    entry.run.endedAt = Date.now();
    if (exitCode !== undefined) entry.run.exitCode = exitCode;
  }
  emit({ type: "status", runId: id, status, exitCode, ts: Date.now() });
}

function finalize(id: string, exitCode: number) {
  setStatus(id, exitCode === 0 ? "done" : "failed", exitCode);
}

function fail(id: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  emit({ type: "stderr", runId: id, chunk: `\n[roost] ${message}\n`, ts: Date.now() });
  setStatus(id, "failed", -1);
}

function shortId(): string {
  return randomUUID().slice(0, 8);
}
