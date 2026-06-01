import { DAEMON_DEFAULT_PORT, type Learning } from "@reef/shared";

const DAEMON = `http://127.0.0.1:${DAEMON_DEFAULT_PORT}`;

export async function show(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("usage: reef show <learning-id>");
    process.exit(1);
  }
  const res = await fetch(`${DAEMON}/api/learnings/${id}`);
  if (res.status === 404) {
    console.error(`no learning with id: ${id}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`daemon returned ${res.status}`);
    process.exit(1);
  }
  const { learning } = (await res.json()) as { learning: Learning };
  console.log(`id:         ${learning.id}`);
  console.log(`topic:      ${learning.topic}`);
  console.log(`layer:      ${learning.layer}`);
  console.log(`confidence: ${learning.confidence}`);
  console.log(`refs:       ${learning.referencesCount}`);
  console.log(`repo:       ${learning.repoPath}`);
  console.log(`source run: ${learning.sourceRunId ?? "(none)"}`);
  console.log(`created:    ${new Date(learning.createdAt).toISOString()}`);
  if (learning.promotedAt) {
    console.log(`promoted:   ${new Date(learning.promotedAt).toISOString()}`);
  }
  console.log();
  console.log(learning.content);
}
