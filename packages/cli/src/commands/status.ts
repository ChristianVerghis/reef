import { DAEMON_DEFAULT_PORT, type ListRunsResponse } from "@roost/shared";

const STATUS_COLORS: Record<string, string> = {
  queued: "\x1b[90m",
  running: "\x1b[32m",
  paused: "\x1b[36m",
  done: "\x1b[32m",
  failed: "\x1b[31m",
  "handed-off": "\x1b[35m",
};

export async function status(_args: string[]): Promise<void> {
  const url = `http://127.0.0.1:${DAEMON_DEFAULT_PORT}/api/runs`;
  let body: ListRunsResponse;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`daemon returned ${res.status}`);
    body = (await res.json()) as ListRunsResponse;
  } catch (err) {
    console.error(
      `daemon unreachable at ${url} (${err instanceof Error ? err.message : err}).`,
    );
    console.error("run `roost start` first.");
    process.exit(1);
  }

  if (body.runs.length === 0) {
    console.log("no runs yet — `roost start` then create one in the UI.");
    return;
  }

  for (const run of body.runs) {
    const color = STATUS_COLORS[run.status] ?? "";
    const reset = color ? "\x1b[0m" : "";
    const repo = run.repoPath.split("/").slice(-2).join("/");
    const prompt = run.prompt.replace(/\s+/g, " ").slice(0, 60);
    console.log(
      `${color}● ${run.status.padEnd(11)}${reset} ${run.id}  ${repo.padEnd(28)}  ${prompt}`,
    );
  }
}
