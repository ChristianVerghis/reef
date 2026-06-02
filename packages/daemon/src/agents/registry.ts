import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import type { AgentRun, CreateRunRequest, RunStatus } from "@reef/shared";
import { ClaudeSDKRunner, type RunHandle, type UsageReport } from "@reef/agent-runtime";
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
  updateRunUsage,
} from "../state/runs.js";
import { findTaskByCurrentRunId, updateTaskStatus } from "../state/tasks.js";
import { extractLearningsFromRun, isExtractionEnabled } from "./extract-learnings.js";
import {
  composePrimingPreamble,
  findLearningsForPriming,
  recordPrimings,
} from "../state/learnings.js";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

// Live handle tracking — intentionally not persisted; rebuilt fresh each daemon
// boot. Reconciliation in state/runs.ts marks any orphaned rows failed on startup.
const liveHandles = new Map<string, RunHandle>();
const runner = new ClaudeSDKRunner();

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
  const handle = liveHandles.get(id);
  if (!handle) return false;
  handle.stop();
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

  // Prime with relevant substrate. Bedrock + loam + topsoil for this repo,
  // ranked and capped. Recording the primings bumps references_count and
  // ultimately drives auto-promotion.
  const primed = findLearningsForPriming(run.repoPath);
  if (primed.length > 0) recordPrimings(id, primed);
  const preamble = composePrimingPreamble(primed);
  const finalPrompt = preamble ? preamble + run.prompt : run.prompt;

  setStatus(id, "running");

  const logStream = createWriteStream(runLogPath(id), { flags: "a" });
  logStream.write(
    `# reef run ${id}\n# repo: ${run.repoPath}\n# prompt: ${run.prompt}\n# started: ${new Date(run.startedAt).toISOString()}\n# git baseline: ${before.sha ?? "(not a git repo)"}\n# primed: ${primed.length} learning(s) (${primed.map((l) => l.topic).join(", ") || "—"})\n\n`,
  );

  const handle = runner.start({
    prompt: finalPrompt,
    cwd: run.repoPath,
    ...(run.model ? { model: run.model } : {}),
  });
  liveHandles.set(id, handle);

  let finalUsage: UsageReport | null = null;

  // Drain events in the background. The Agent SDK's structured events get
  // translated into our event bus shape (stdout/stderr) for SSE consumers.
  // Tool-use events are noted in the log for now; future M5 work surfaces
  // them in the UI.
  (async () => {
    try {
      for await (const event of handle.events) {
        switch (event.type) {
          case "stdout":
            logStream.write(event.chunk);
            emit({ type: "stdout", runId: id, chunk: event.chunk, ts: event.ts });
            break;
          case "stderr":
            logStream.write(`[stderr] ${event.chunk}`);
            emit({ type: "stderr", runId: id, chunk: event.chunk, ts: event.ts });
            break;
          case "tool-use":
            logStream.write(`\n[tool-use] ${event.tool}\n`);
            break;
          case "tool-result":
            if (event.isError) logStream.write(`[tool-error]\n`);
            break;
          case "usage":
            finalUsage = event.report;
            break;
        }
      }
    } catch (err) {
      logStream.write(
        `\n[stream-error] ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  })();

  const exitCode = await handle.done;
  liveHandles.delete(id);

  // Persist usage telemetry (if the SDK reported it) before flipping status —
  // that way the final `status: done` event landing on SSE comes after the
  // row already reflects the cost numbers.
  const usage = handle.getUsage() ?? finalUsage;
  if (usage) {
    updateRunUsage(id, {
      tokensIn: usage.inputTokens,
      tokensOut: usage.outputTokens,
      costUsd: usage.costUsd,
      model: usage.model,
    });
    logStream.write(
      `\n# usage: ${usage.inputTokens} in / ${usage.outputTokens} out · $${usage.costUsd.toFixed(4)} · ${usage.model}\n`,
    );
  }
  logStream.write(`# exit: ${exitCode}\n`);

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
  finalize(id, exitCode);
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
  // Optional: mine learnings from successful runs. Disabled by default because
  // it fires an extra `claude -p` call per run, which counts against the
  // user's plan allowance on top of the run itself. Opt in with
  // REEF_EXTRACT_LEARNINGS=true to grow the substrate automatically.
  if (status === "done" && isExtractionEnabled()) {
    const run = findRun(id);
    if (run) {
      queueMicrotask(() =>
        extractLearningsFromRun({
          runId: run.id,
          repoPath: run.repoPath,
          prompt: run.prompt,
        }).catch((err) => console.warn(`[extract] background failure:`, err)),
      );
    }
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
