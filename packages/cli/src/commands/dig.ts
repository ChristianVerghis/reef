import { DAEMON_DEFAULT_PORT, type Learning } from "@reef/shared";

const DAEMON = `http://127.0.0.1:${DAEMON_DEFAULT_PORT}`;

const LAYER_LABEL: Record<string, { color: string; tag: string }> = {
  bedrock: { color: "\x1b[35m", tag: "BEDROCK" }, // violet — load-bearing
  loam: { color: "\x1b[33m", tag: "LOAM   " }, // amber — settled
  topsoil: { color: "\x1b[32m", tag: "TOPSOIL" }, // green — fresh
  fossil: { color: "\x1b[90m", tag: "FOSSIL " }, // grey — preserved
};

export async function dig(args: string[]): Promise<void> {
  const topic = args[0];
  if (!topic) {
    console.error("usage: reef dig <topic> [--repo <path>]");
    process.exit(1);
  }
  const repoIdx = args.indexOf("--repo");
  const repo = repoIdx >= 0 ? args[repoIdx + 1] : undefined;

  const url = new URL(`${DAEMON}/api/learnings`);
  url.searchParams.set("topic", topic);
  if (repo) url.searchParams.set("repo", repo);

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

  if (body.learnings.length === 0) {
    console.log(`no learnings on "${topic}" yet.`);
    if (repo) console.log(`(scope: ${repo})`);
    return;
  }

  for (const l of body.learnings) {
    const meta = LAYER_LABEL[l.layer] ?? LAYER_LABEL.topsoil!;
    const ageDays = Math.floor((Date.now() - l.createdAt) / 86_400_000);
    const refs = l.referencesCount;
    console.log(
      `${meta.color}● ${meta.tag}\x1b[0m  ${l.topic}  \x1b[90mid=${l.id} conf=${l.confidence.toFixed(2)} refs=${refs} age=${ageDays}d\x1b[0m`,
    );
    console.log(`              ${l.content.split("\n").join("\n              ")}\n`);
  }
}
