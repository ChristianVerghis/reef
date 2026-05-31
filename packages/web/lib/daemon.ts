import type { AgentRun, CreateRunRequest, ListRunsResponse } from "@roost/shared";

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
