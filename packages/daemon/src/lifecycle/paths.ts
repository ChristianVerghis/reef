import { mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const ROOST_HOME = process.env.ROOST_HOME ?? path.join(os.homedir(), ".roost");
export const RUNS_DIR = path.join(ROOST_HOME, "runs");

export async function ensureRoostDir(): Promise<void> {
  await mkdir(RUNS_DIR, { recursive: true });
}

export function runLogPath(runId: string): string {
  return path.join(RUNS_DIR, `${runId}.log`);
}
