"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRun } from "@/lib/daemon";

export default function NewRunPage() {
  const router = useRouter();
  const [repoPath, setRepoPath] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { run } = await createRun({ repoPath, prompt });
      router.push(`/agents/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl w-full px-6 py-10 flex-1 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="uppercase tracking-wide text-xs text-zinc-500 font-mono">
          spawn
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">New run</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Spawns the local{" "}
          <code className="font-mono text-xs px-1 py-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800/60">
            claude
          </code>{" "}
          CLI in the chosen repo with the given prompt.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Repo path</span>
          <input
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/Users/you/dev/some-repo"
            required
            className="font-mono text-sm px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Prompt</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should the agent do?"
            required
            rows={6}
            className="text-sm px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
          />
        </label>

        {error && (
          <div className="rounded-md border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !repoPath || !prompt}
            className="px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Starting…" : "Start run"}
          </button>
          <span className="text-xs text-zinc-500 font-mono">
            ⌘+enter to submit
          </span>
        </div>
      </form>
    </main>
  );
}
