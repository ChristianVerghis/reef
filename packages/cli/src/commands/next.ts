import { DAEMON_DEFAULT_PORT, WEB_DEFAULT_PORT, type Task, type AgentRun } from "@roost/shared";

const DAEMON = `http://127.0.0.1:${DAEMON_DEFAULT_PORT}`;

export async function next(_args: string[]): Promise<void> {
  let nextRes: Response;
  try {
    nextRes = await fetch(`${DAEMON}/api/tasks/next`);
  } catch (err) {
    console.error(`daemon unreachable at ${DAEMON} (${err instanceof Error ? err.message : err}).`);
    console.error("run `roost start` first.");
    process.exit(1);
  }
  if (!nextRes.ok) {
    console.error(`daemon returned ${nextRes.status}`);
    process.exit(1);
  }
  const { task } = (await nextRes.json()) as { task: Task | null };
  if (!task) {
    console.log("queue is empty — `roost` web UI → Tasks to add one.");
    return;
  }

  const startRes = await fetch(`${DAEMON}/api/tasks/${task.id}/start`, { method: "POST" });
  if (!startRes.ok) {
    const text = await startRes.text();
    console.error(`failed to start task: ${startRes.status} ${text}`);
    process.exit(1);
  }
  const { run } = (await startRes.json()) as { run: AgentRun };

  const url = `http://localhost:${WEB_DEFAULT_PORT}/agents/${run.id}`;
  console.log(`▶ ${task.title}`);
  console.log(`  repo: ${task.repoPath}`);
  console.log(`  run:  ${url}`);
}
