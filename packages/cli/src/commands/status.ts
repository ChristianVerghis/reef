import { type ListRunsResponse } from "@reef/shared";
import { findLiveDaemon, readPidfile } from "../lib/pidfile.js";

const STATUS_COLORS: Record<string, string> = {
  queued: "\x1b[90m",
  running: "\x1b[32m",
  paused: "\x1b[36m",
  done: "\x1b[32m",
  failed: "\x1b[31m",
  "handed-off": "\x1b[35m",
};

export async function status(_args: string[]): Promise<void> {
  // First, characterize the daemon itself. The pidfile gives us a richer
  // picture than just "did the HTTP call work?" — distinguishes "no daemon"
  // from "stale pidfile" from "process alive but hung."
  const live = findLiveDaemon();
  const file = readPidfile();

  if (!live) {
    if (file) {
      console.error(
        `daemon: ❌ pidfile points at pid ${file.pid} but that process is dead (stale pidfile).`,
      );
      console.error("        run 'reef start' to launch a fresh daemon.");
    } else {
      console.error("daemon: ❌ not running — 'reef start' to launch.");
    }
    process.exit(1);
  }

  const url = `http://127.0.0.1:${live.port}/api/runs`;
  let body: ListRunsResponse;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`daemon returned ${res.status}`);
    body = (await res.json()) as ListRunsResponse;
  } catch (err) {
    console.error(
      `daemon: ⚠️  alive (pid ${live.pid}) but unresponsive at ${url} — ${err instanceof Error ? err.message : err}`,
    );
    process.exit(1);
  }

  const ageMin = Math.floor((Date.now() - live.startedAt) / 60_000);
  console.log(
    `daemon: \x1b[32m✓\x1b[0m running (pid ${live.pid}, port ${live.port}, up ${ageMin}m)`,
  );

  if (body.runs.length === 0) {
    console.log("runs:   none yet — open the UI and start one, or `reef next`.");
    return;
  }

  console.log(`runs:   ${body.runs.length}`);
  for (const run of body.runs) {
    const color = STATUS_COLORS[run.status] ?? "";
    const reset = color ? "\x1b[0m" : "";
    const repo = run.repoPath.split("/").slice(-2).join("/");
    const prompt = run.prompt.replace(/\s+/g, " ").slice(0, 60);
    console.log(
      `  ${color}● ${run.status.padEnd(11)}${reset} ${run.id}  ${repo.padEnd(28)}  ${prompt}`,
    );
  }
}
