import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { DAEMON_PIDFILE } from "./paths.js";

export interface PidfileContents {
  pid: number;
  port: number;
  startedAt: number;
}

export function writePidfile(port: number): void {
  const contents: PidfileContents = {
    pid: process.pid,
    port,
    startedAt: Date.now(),
  };
  writeFileSync(DAEMON_PIDFILE, JSON.stringify(contents), "utf8");
}

export function clearPidfile(): void {
  try {
    unlinkSync(DAEMON_PIDFILE);
  } catch (err) {
    // ENOENT is fine — pidfile already gone (likely cleared by a sibling exit handler).
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export function readPidfile(): PidfileContents | null {
  if (!existsSync(DAEMON_PIDFILE)) return null;
  try {
    const raw = readFileSync(DAEMON_PIDFILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<PidfileContents>;
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.port !== "number" ||
      typeof parsed.startedAt !== "number"
    ) {
      return null;
    }
    return parsed as PidfileContents;
  } catch {
    return null;
  }
}

/**
 * `kill(pid, 0)` is the POSIX "does this process exist?" check — it sends no
 * signal but throws if the pid is dead. Used to distinguish a stale pidfile
 * (process crashed without cleanup) from a live daemon.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is owned by another user — count as
    // alive (safer to refuse to start a sibling than to clobber).
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Returns the live daemon's pidfile contents if one is actually running.
 * Returns null in three cases: no pidfile, stale pidfile (process died),
 * or pidfile points at this process (which is fine for the caller — we're
 * the live daemon).
 */
export function findLiveDaemon(): PidfileContents | null {
  const file = readPidfile();
  if (!file) return null;
  if (file.pid === process.pid) return null;
  if (!isProcessAlive(file.pid)) {
    clearPidfile();
    return null;
  }
  return file;
}
