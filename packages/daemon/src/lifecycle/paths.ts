import { mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const REEF_HOME = process.env.REEF_HOME ?? path.join(os.homedir(), ".reef");
export const RUNS_DIR = path.join(REEF_HOME, "runs");

export async function ensureReefDir(): Promise<void> {
  await mkdir(RUNS_DIR, { recursive: true });
}

export function runLogPath(runId: string): string {
  return path.join(RUNS_DIR, `${runId}.log`);
}
