import { DAEMON_DEFAULT_PORT, type Learning } from "@reef/shared";

const DAEMON = `http://127.0.0.1:${DAEMON_DEFAULT_PORT}`;

/**
 * Promote a learning to bedrock (load-bearing, codified truth). Use when a
 * learning is repeatedly confirmed and you want it to outrank topsoil/loam
 * findings in future retrievals.
 */
export async function petrify(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("usage: reef petrify <learning-id>");
    process.exit(1);
  }
  const res = await fetch(`${DAEMON}/api/learnings/${id}/promote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ layer: "bedrock" }),
  });
  if (res.status === 404) {
    console.error(`no learning with id: ${id}`);
    process.exit(1);
  }
  if (!res.ok) {
    const text = await res.text();
    console.error(`promote failed: ${res.status} ${text}`);
    process.exit(1);
  }
  const { learning } = (await res.json()) as { learning: Learning };
  console.log(`petrified ${learning.id} → bedrock`);
  console.log(`  ${learning.topic}: ${learning.content.slice(0, 80)}`);
}

/**
 * Inverse of petrify: mark a learning as fossil (outdated but preserved for
 * historical context). Fossils are excluded from default dig results.
 */
export async function fossilize(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("usage: reef fossilize <learning-id>");
    process.exit(1);
  }
  const res = await fetch(`${DAEMON}/api/learnings/${id}/promote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ layer: "fossil" }),
  });
  if (res.status === 404) {
    console.error(`no learning with id: ${id}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`fossilize failed: ${res.status}`);
    process.exit(1);
  }
  const { learning } = (await res.json()) as { learning: Learning };
  console.log(`fossilized ${learning.id} (was: ${learning.topic})`);
}
