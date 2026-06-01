"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { promoteLearning } from "@/lib/daemon";
import type { Layer, Learning } from "@reef/shared";

export function LearningRow({ learning }: { learning: Learning }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const ageDays = Math.floor((Date.now() - learning.createdAt) / 86_400_000);

  async function promote(layer: Layer) {
    setBusy(true);
    try {
      await promoteLearning(learning.id, layer);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 hover:bg-zinc-100/40 dark:hover:bg-zinc-900/40">
      <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
        <span className="text-zinc-700 dark:text-zinc-300 font-semibold">{learning.topic}</span>
        <span>·</span>
        <span>id={learning.id}</span>
        <span>·</span>
        <span>conf {learning.confidence.toFixed(2)}</span>
        <span>·</span>
        <span>refs {learning.referencesCount}</span>
        <span>·</span>
        <span>{ageDays}d</span>
        {learning.sourceRunId && (
          <>
            <span>·</span>
            <Link
              href={`/agents/${learning.sourceRunId}`}
              className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              source run
            </Link>
          </>
        )}
        <div className="ml-auto flex gap-2">
          {learning.layer !== "bedrock" && (
            <button
              onClick={() => promote("bedrock")}
              disabled={busy}
              className="text-xs px-2 py-0.5 rounded border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-50"
              title="Promote to bedrock"
            >
              petrify
            </button>
          )}
          {learning.layer !== "fossil" && (
            <button
              onClick={() => promote("fossil")}
              disabled={busy}
              className="text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50"
              title="Mark as fossil"
            >
              fossilize
            </button>
          )}
        </div>
      </div>
      <p className="text-sm leading-relaxed">{learning.content}</p>
      <p className="text-xs font-mono text-zinc-500 truncate">
        {learning.repoPath.split("/").slice(-3).join("/")}
      </p>
    </li>
  );
}
