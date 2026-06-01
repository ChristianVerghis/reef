"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startTask, deleteTask } from "@/lib/daemon";
import type { Task } from "@reef/shared";

const PRIORITY_LABEL: Record<number, string> = { 1: "Low", 2: "Med", 3: "High" };
const PRIORITY_COLOR: Record<number, string> = {
  1: "text-zinc-500",
  2: "text-sky-600 dark:text-sky-400",
  3: "text-amber-600 dark:text-amber-400",
};

const STATUS_DOT: Record<string, string> = {
  queued: "bg-zinc-400",
  running: "bg-emerald-500",
  done: "bg-emerald-600",
  failed: "bg-rose-500",
  cancelled: "bg-zinc-500",
};

export function TaskRow({ task }: { task: Task }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [_, startTransition] = useTransition();

  async function onStart() {
    setBusy(true);
    try {
      const result = await startTask(task.id);
      router.push(`/agents/${result.run.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    setBusy(true);
    await deleteTask(task.id);
    startTransition(() => router.refresh());
  }

  const dot = STATUS_DOT[task.status] ?? "bg-zinc-400";

  return (
    <li className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60">
      <span className={`h-2.5 w-2.5 rounded-full ${dot} shrink-0`} />
      {task.pinned && (
        <span className="text-xs text-amber-600 dark:text-amber-400" title="Pinned">
          ★
        </span>
      )}
      <span className={`text-xs font-mono shrink-0 ${PRIORITY_COLOR[task.priority]}`}>
        {PRIORITY_LABEL[task.priority]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{task.title}</div>
        <div className="text-xs font-mono text-zinc-500 truncate">
          {task.repoPath.split("/").slice(-2).join("/")}
          {task.currentRunId && (
            <>
              {" · "}
              <Link
                href={`/agents/${task.currentRunId}`}
                className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                run {task.currentRunId}
              </Link>
            </>
          )}
        </div>
      </div>
      {task.status === "queued" && (
        <>
          <button
            onClick={onStart}
            disabled={busy}
            className="text-xs px-3 py-1 rounded-md bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 disabled:opacity-50"
          >
            {busy ? "starting…" : "Start"}
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50"
            title="Delete"
          >
            ×
          </button>
        </>
      )}
    </li>
  );
}
