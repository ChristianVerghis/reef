import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const REEF_HOME = process.env.REEF_HOME ?? path.join(os.homedir(), ".reef");
export const DAEMON_PIDFILE = path.join(REEF_HOME, "daemon.pid");

export interface PidfileContents {
  pid: number;
  port: number;
  startedAt: number;
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

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function findLiveDaemon(): PidfileContents | null {
  const file = readPidfile();
  if (!file) return null;
  if (!isProcessAlive(file.pid)) return null;
  return file;
}
