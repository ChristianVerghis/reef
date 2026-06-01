import type {
  AgentRun,
  CreateRunRequest,
  CreateTaskRequest,
  ListRunsResponse,
  ListTasksResponse,
  RunDiffResponse,
  StartTaskResponse,
  Task,
} from "@reef/shared";

export function daemonUrl(): string {
  return process.env.NEXT_PUBLIC_DAEMON_URL ?? "http://127.0.0.1:3738";
}

export async function listRuns(): Promise<ListRunsResponse> {
  const res = await fetch(`${daemonUrl()}/api/runs`, { cache: "no-store" });
  if (!res.ok) throw new Error(`listRuns failed: ${res.status}`);
  return res.json();
}

export async function createRun(req: CreateRunRequest): Promise<{ run: AgentRun }> {
  const res = await fetch(`${daemonUrl()}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createRun failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function stopRun(id: string): Promise<void> {
  await fetch(`${daemonUrl()}/api/runs/${id}`, { method: "DELETE" });
}

export async function getRunDiff(id: string): Promise<RunDiffResponse> {
  const res = await fetch(`${daemonUrl()}/api/runs/${id}/diff`);
  if (!res.ok) throw new Error(`getRunDiff failed: ${res.status}`);
  return res.json();
}

export async function listTasks(): Promise<ListTasksResponse> {
  const res = await fetch(`${daemonUrl()}/api/tasks`, { cache: "no-store" });
  if (!res.ok) throw new Error(`listTasks failed: ${res.status}`);
  return res.json();
}

export async function nextTask(): Promise<{ task: Task | null }> {
  const res = await fetch(`${daemonUrl()}/api/tasks/next`, { cache: "no-store" });
  if (!res.ok) throw new Error(`nextTask failed: ${res.status}`);
  return res.json();
}

export async function createTask(req: CreateTaskRequest): Promise<{ task: Task }> {
  const res = await fetch(`${daemonUrl()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createTask failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function startTask(id: string): Promise<StartTaskResponse> {
  const res = await fetch(`${daemonUrl()}/api/tasks/${id}/start`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`startTask failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function deleteTask(id: string): Promise<void> {
  await fetch(`${daemonUrl()}/api/tasks/${id}`, { method: "DELETE" });
}
