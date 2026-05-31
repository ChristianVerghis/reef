"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { daemonUrl, stopRun } from "@/lib/daemon";
import { STATUS_COLORS } from "@/lib/status";
import type { AgentRun, RunEvent, RunStatus } from "@roost/shared";

export function AgentStream({ initialRun }: { initialRun: AgentRun }) {
  const [status, setStatus] = useState<RunStatus>(initialRun.status);
  const [exitCode, setExitCode] = useState<number | undefined>(initialRun.exitCode);
  const [output, setOutput] = useState<string>("");
  const tailRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const es = new EventSource(`${daemonUrl()}/api/runs/${initialRun.id}/stream`);
    const onStdout = (e: MessageEvent) => append(JSON.parse(e.data) as RunEvent);
    const onStderr = (e: MessageEvent) => append(JSON.parse(e.data) as RunEvent);
    const onStatus = (e: MessageEvent) => {
      const event = JSON.parse(e.data) as Extract<RunEvent, { type: "status" }>;
      setStatus(event.status);
      if (event.exitCode !== undefined) setExitCode(event.exitCode);
    };
    es.addEventListener("stdout", onStdout);
    es.addEventListener("stderr", onStderr);
    es.addEventListener("status", onStatus);
    es.onerror = () => {
      // Browser auto-reconnects; nothing to do.
    };
    return () => es.close();
  }, [initialRun.id]);

  function append(event: RunEvent) {
    if (event.type !== "stdout" && event.type !== "stderr") return;
    setOutput((prev) => prev + event.chunk);
    // Auto-scroll the next tick after paint.
    queueMicrotask(() => {
      const el = tailRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  const c = STATUS_COLORS[status];
  const isLive = status === "running" || status === "queued";

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
          {exitCode !== undefined && (
            <span className="text-xs font-mono text-zinc-500">
              exit {exitCode}
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

      <pre
        ref={tailRef}
        className="flex-1 min-h-[60vh] max-h-[70vh] overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap"
      >
        {output || <span className="text-zinc-400">waiting for output…</span>}
      </pre>
    </main>
  );
}
