"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/daemon";

export function NewTaskForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [priority, setPriority] = useState(2);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createTask({ title, body, repoPath, priority, pinned });
      setTitle("");
      setBody("");
      // Keep the repoPath — most users queue several tasks against the same repo.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col gap-4 bg-white dark:bg-zinc-950"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-wide text-zinc-500 font-mono">
          Queue a task
        </h2>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Short imperative — what should the agent do?"
            className="text-sm px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Repo path</span>
          <input
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            required
            placeholder="/Users/you/dev/repo"
            className="font-mono text-sm px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Body <span className="text-zinc-500 font-normal">(optional, becomes additional context for the agent)</span></span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="text-sm px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
        />
      </label>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="text-sm px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
          >
            <option value={3}>High</option>
            <option value={2}>Medium</option>
            <option value={1}>Low</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="h-4 w-4"
          />
          <span>Pin to top</span>
        </label>
        {error && <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>}
        <button
          type="submit"
          disabled={busy || !title || !repoPath}
          className="ml-auto px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "queuing…" : "Queue task"}
        </button>
      </div>
    </form>
  );
}
