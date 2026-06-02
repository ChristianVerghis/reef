"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { daemonUrl, stopRun, getRunDiff, nextTask, startTask, listRunPrimings } from "@/lib/daemon";
import { STATUS_COLORS } from "@/lib/status";
import type { AgentRun, Learning, RunEvent, RunStatus, Task } from "@reef/shared";

export function AgentStream({ initialRun }: { initialRun: AgentRun }) {
  const router = useRouter();
  const [run, setRun] = useState<AgentRun>(initialRun);
  const [output, setOutput] = useState<string>("");
  const [diff, setDiff] = useState<{ text: string; truncated: boolean } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [upNext, setUpNext] = useState<Task | null>(null);
  const [spreeBusy, setSpreeBusy] = useState(false);
  const [primings, setPrimings] = useState<Learning[] | null>(null);
  const [primingsOpen, setPrimingsOpen] = useState(false);
  const tailRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    listRunPrimings(initialRun.id)
      .then((res) => setPrimings(res.learnings))
      .catch(() => setPrimings([]));
  }, [initialRun.id]);

  useEffect(() => {
    const es = new EventSource(`${daemonUrl()}/api/runs/${initialRun.id}/stream`);
    const onChunk = (e: MessageEvent) => append(JSON.parse(e.data) as RunEvent);
    const onStatus = async (e: MessageEvent) => {
      const event = JSON.parse(e.data) as Extract<RunEvent, { type: "status" }>;
      if (event.status === "done" || event.status === "failed") {
        try {
          const res = await fetch(`${daemonUrl()}/api/runs/${initialRun.id}`);
          if (res.ok) {
            const data = (await res.json()) as { run: AgentRun };
            setRun(data.run);
          }
        } catch {
          setRun((prev) => ({ ...prev, status: event.status, exitCode: event.exitCode }));
        }
        // Prefetch the next queued task so the spree CTA is ready instantly.
        try {
          const next = await nextTask();
          setUpNext(next.task);
        } catch {
          // ignore — empty queue is the normal case
        }
        return;
      }
      setRun((prev) => ({ ...prev, status: event.status, exitCode: event.exitCode }));
    };
    es.addEventListener("stdout", onChunk);
    es.addEventListener("stderr", onChunk);
    es.addEventListener("status", onStatus);
    es.onerror = () => {
      // Browser auto-reconnects.
    };
    return () => es.close();
  }, [initialRun.id]);

  function append(event: RunEvent) {
    if (event.type !== "stdout" && event.type !== "stderr") return;
    setOutput((prev) => prev + event.chunk);
    queueMicrotask(() => {
      const el = tailRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function loadDiff() {
    if (diff) {
      setDiffOpen((o) => !o);
      return;
    }
    setDiffLoading(true);
    try {
      const result = await getRunDiff(initialRun.id);
      setDiff({ text: result.diff, truncated: result.truncated });
      setDiffOpen(true);
    } finally {
      setDiffLoading(false);
    }
  }

  async function startNext() {
    if (!upNext) return;
    setSpreeBusy(true);
    try {
      const { run: nextRun } = await startTask(upNext.id);
      router.push(`/agents/${nextRun.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setSpreeBusy(false);
    }
  }

  const c = STATUS_COLORS[run.status];
  const isLive = run.status === "running" || run.status === "queued";
  const isDone = run.status === "done" || run.status === "failed";
  const changes = run.changes ?? null;
  const noChanges = isDone && changes && changes.filesChanged === 0;
  const hasChanges = isDone && changes && changes.filesChanged > 0;

  return (
    <main className="mx-auto max-w-5xl w-full px-6 py-10 flex-1 flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            ← runs
          </Link>
          <span>·</span>
          <span>{initialRun.id}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
          <span className={`text-sm font-medium ${c.text}`}>{c.label}</span>
          {run.exitCode !== undefined && (
            <span className="text-xs font-mono text-zinc-500">
              exit {run.exitCode}
            </span>
          )}
          {run.model && (
            <span className="text-xs font-mono text-zinc-500" title="model">
              {shortModel(run.model)}
            </span>
          )}
          {(run.tokensIn !== undefined || run.tokensOut !== undefined) && (
            <span className="text-xs font-mono text-zinc-500" title="tokens in / out">
              {formatTokens(run.tokensIn ?? 0)}↓ {formatTokens(run.tokensOut ?? 0)}↑
            </span>
          )}
          {run.costUsd !== undefined && run.costUsd !== null && (
            <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300" title="estimated cost">
              ${run.costUsd.toFixed(4)}
            </span>
          )}
          {isLive && (
            <button
              onClick={() => stopRun(initialRun.id)}
              className="ml-auto text-xs px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Stop
            </button>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{initialRun.prompt}</h1>
        <p className="text-xs font-mono text-zinc-500">{initialRun.repoPath}</p>
      </header>

      {primings && primings.length > 0 && (
        <section className="rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/20">
          <header className="flex items-center gap-3 px-4 py-3 border-b border-violet-200 dark:border-violet-900">
            <span className="uppercase tracking-wide text-xs text-violet-700 dark:text-violet-300 font-mono">
              primed with
            </span>
            <span className="text-sm">
              <span className="font-medium">{primings.length}</span>{" "}
              <span className="text-zinc-500">
                learning{primings.length === 1 ? "" : "s"} from the reef
              </span>
            </span>
            <button
              onClick={() => setPrimingsOpen((o) => !o)}
              className="ml-auto text-xs px-2.5 py-1 rounded border border-violet-300 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-950/40"
            >
              {primingsOpen ? "Hide" : "Show"}
            </button>
          </header>
          {primingsOpen && (
            <ul className="px-4 py-3 space-y-2 text-sm">
              {primings.map((l) => (
                <li key={l.id} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
                    <LayerDot layer={l.layer} />
                    <span className="text-zinc-700 dark:text-zinc-300 font-semibold">{l.topic}</span>
                    <span>· {l.layer}</span>
                    <span>· conf {l.confidence.toFixed(2)}</span>
                    <Link
                      href={`/reef`}
                      className="ml-auto underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      reef
                    </Link>
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{l.content}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {primings && primings.length === 0 && (
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-xs font-mono text-zinc-500">
          no substrate primed this run — the reef is empty for {initialRun.repoPath.split("/").slice(-2).join("/")}
        </section>
      )}

      {isDone && upNext && (
        <section className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-4 flex items-center gap-4">
          <span className="uppercase tracking-wide text-xs text-emerald-700 dark:text-emerald-300 font-mono shrink-0">
            up next
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{upNext.title}</div>
            <div className="text-xs font-mono text-emerald-700/70 dark:text-emerald-300/70 truncate">
              {upNext.repoPath.split("/").slice(-2).join("/")}
            </div>
          </div>
          <button
            onClick={startNext}
            disabled={spreeBusy}
            autoFocus
            className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {spreeBusy ? "starting…" : "Run next →"}
          </button>
        </section>
      )}

      {isDone && (
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <header className="flex items-center gap-4 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <span className="uppercase tracking-wide text-xs text-zinc-500 font-mono">
              changes
            </span>
            {hasChanges && changes && (
              <span className="text-sm">
                <span className="font-medium">{changes.filesChanged}</span>{" "}
                <span className="text-zinc-500">files</span>{" "}
                <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                  +{changes.insertions}
                </span>{" "}
                <span className="text-rose-600 dark:text-rose-400 font-mono">
                  −{changes.deletions}
                </span>
              </span>
            )}
            {noChanges && (
              <span className="text-sm text-zinc-500">
                No changes in the working tree.
              </span>
            )}
            {!changes && (
              <span className="text-sm text-zinc-500">
                Not a git repo — skipped diff.
              </span>
            )}
            {hasChanges && (
              <button
                onClick={loadDiff}
                disabled={diffLoading}
                className="ml-auto text-xs px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50"
              >
                {diffLoading ? "loading…" : diffOpen ? "Hide diff" : "View diff"}
              </button>
            )}
          </header>

          {hasChanges && changes && (
            <ul className="px-4 py-3 text-xs font-mono space-y-1">
              {changes.filesList.slice(0, 30).map((file) => (
                <li key={file} className="text-zinc-600 dark:text-zinc-400 truncate">
                  {file}
                </li>
              ))}
              {changes.filesList.length > 30 && (
                <li className="text-zinc-500 italic">
                  …{changes.filesList.length - 30} more
                </li>
              )}
            </ul>
          )}

          {diffOpen && diff && (
            <div className="border-t border-zinc-200 dark:border-zinc-800">
              {diff.truncated && (
                <div className="px-4 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30">
                  Diff truncated at 1MB. See the working tree for the full change.
                </div>
              )}
              <pre className="max-h-[60vh] overflow-auto p-4 text-xs font-mono leading-relaxed whitespace-pre">
                {diff.text || "(empty)"}
              </pre>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2 flex-1">
        <span className="uppercase tracking-wide text-xs text-zinc-500 font-mono">
          output
        </span>
        <pre
          ref={tailRef}
          className="flex-1 min-h-[40vh] max-h-[60vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap"
        >
          {output || <span className="text-zinc-400">waiting for output…</span>}
        </pre>
      </section>
    </main>
  );
}

function LayerDot({ layer }: { layer: Learning["layer"] }) {
  const dot =
    layer === "bedrock"
      ? "bg-violet-500"
      : layer === "loam"
        ? "bg-amber-500"
        : layer === "topsoil"
          ? "bg-emerald-500"
          : "bg-zinc-500";
  return <span className={`h-2 w-2 rounded-full ${dot}`} />;
}

function shortModel(model: string): string {
  // claude-sonnet-4-5-20250929 → sonnet-4-5
  const m = model.match(/(?:claude-)?([a-z]+)-?(\d+)?-?(\d+)?/);
  if (!m) return model;
  return [m[1], m[2], m[3]].filter(Boolean).join("-");
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
