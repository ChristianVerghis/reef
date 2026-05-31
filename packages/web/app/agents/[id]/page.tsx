import { notFound } from "next/navigation";
import { daemonUrl } from "@/lib/daemon";
import { AgentStream } from "./stream";
import type { AgentRun } from "@roost/shared";

export const dynamic = "force-dynamic";

export default async function AgentRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await fetch(`${daemonUrl()}/api/runs/${id}`, { cache: "no-store" });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`failed to load run ${id}: ${res.status}`);
  const { run } = (await res.json()) as { run: AgentRun };

  return <AgentStream initialRun={run} />;
}
