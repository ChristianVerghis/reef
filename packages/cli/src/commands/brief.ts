import { DAEMON_DEFAULT_PORT, type Learning } from "@reef/shared";
import path from "node:path";

const DAEMON = `http://127.0.0.1:${DAEMON_DEFAULT_PORT}`;

const LAYER_META: Record<string, { color: string; tag: string }> = {
  bedrock: { color: "\x1b[35m", tag: "BEDROCK" },
  loam: { color: "\x1b[33m", tag: "LOAM   " },
  topsoil: { color: "\x1b[32m", tag: "TOPSOIL" },
  fossil: { color: "\x1b[90m", tag: "FOSSIL " },
};

/**
 * Preview what would prime an agent run for a given repo. Same ranking +
 * caps as the real priming path, but doesn't actually fire a run.
 */
export async function brief(args: string[]): Promise<void> {
  const repo = args[0] ? path.resolve(args[0]) : process.cwd();
  const url = new URL(`${DAEMON}/api/brief`);
  url.searchParams.set("repo", repo);

  let body: { learnings: Learning[] };
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`daemon returned ${res.status}`);
    body = await res.json();
  } catch (err) {
    console.error(
      `daemon unreachable at ${DAEMON} (${err instanceof Error ? err.message : err}).`,
    );
    process.exit(1);
  }

  console.log(`brief for: ${repo}`);
  console.log(
    `${body.learnings.length} learning${body.learnings.length === 1 ? "" : "s"} would prime an agent run.\n`,
  );

  if (body.learnings.length === 0) {
    console.log(
      "no substrate yet — run agents with REEF_EXTRACT_LEARNINGS=true to grow it, or seed bedrock manually via the /reef page.",
    );
    return;
  }

  for (const l of body.learnings) {
    const meta = LAYER_META[l.layer] ?? LAYER_META.topsoil!;
    console.log(
      `${meta.color}● ${meta.tag}\x1b[0m  ${l.topic}  \x1b[90mconf=${l.confidence.toFixed(2)} refs=${l.referencesCount}\x1b[0m`,
    );
    console.log(`              ${l.content.split("\n").join("\n              ")}\n`);
  }
}
