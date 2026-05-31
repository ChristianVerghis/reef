"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { daemonUrl, stopRun, getRunDiff } from "@/lib/daemon";
import { STATUS_COLORS } from "@/lib/status";
import type { AgentRun, RunEvent, RunStatus } from "@roost/shared";

export function AgentStream({ initialRun }: { initialRun: AgentRun }) {
  const [run, setRun] = useState<AgentRun>(initialRun);
  const [output, setOutput] = useState<string>("");
  const [diff, setDiff] = useState<{ text: string; truncated: boolean } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const tailRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const es = new EventSource(`${daemonUrl()}/api/runs/${initialRun.id}/stream`);
    const onChunk = (e: MessageEvent) => append(JSON.parse(e.data) as RunEvent);
    const onStatus = async (e: MessageEvent) => {
      const event = JSON.parse(e.data) as Extract<RunEvent, { type: "status" }>;
      // Pull the fresh row so we get the changes summary populated on completion.
      if (event.status === "done" || event.status === "failed") {
        try {
          const res = await fetch(`${daemonUrl()}/api/runs/${initialRun.id}`);
          if (res.ok) {
            const data = (await res.json()) as { run: AgentRun };
            setRun(data.run);
            return;
          }
        } catch {
          // fall through to optimistic update
        }
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
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
          <span className={`text-sm font-medium ${c.text}`}>{c.label}</span>
          {run.exitCode !== undefined && (
            <span className="text-xs font-mono text-zinc-500">
              exit {run.exitCode}
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
