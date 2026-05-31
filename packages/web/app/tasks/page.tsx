import Link from "next/link";
import { listTasks } from "@/lib/daemon";
import { NewTaskForm } from "./new-task-form";
import { TaskRow } from "./task-row";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  let tasks: Awaited<ReturnType<typeof listTasks>>["tasks"] = [];
  let daemonError: string | null = null;
  try {
    tasks = (await listTasks()).tasks;
  } catch (err) {
    daemonError = err instanceof Error ? err.message : String(err);
  }

  const queued = tasks.filter((t) => t.status === "queued");
  const running = tasks.filter((t) => t.status === "running");
  const done = tasks.filter((t) => t.status === "done" || t.status === "failed" || t.status === "cancelled");

  return (
    <main className="mx-auto max-w-5xl w-full px-6 py-10 flex-1 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="uppercase tracking-wide text-xs text-zinc-500 font-mono">
          queue
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-zinc-600 dark:text-zinc-400 max-w-prose">
          Queued work items. <code className="font-mono text-xs">roost next</code> picks
          the highest-priority pinned task and starts a run. The agent inherits the
          task&apos;s repo and prompt.
        </p>
      </header>

      {daemonError && (
        <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
          <span className="font-mono">daemon unreachable.</span> {daemonError}
        </div>
      )}

      <NewTaskForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm uppercase tracking-wide text-zinc-500 font-mono">
          Queued <span className="text-zinc-700 dark:text-zinc-300">({queued.length})</span>
        </h2>
        {queued.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">
            Nothing queued. Add a task above or hit <Link href="/new" className="underline underline-offset-4">New run</Link> for an ad-hoc prompt.
          </p>
        ) : (
          <ul className="border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {queued.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </section>

      {running.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm uppercase tracking-wide text-zinc-500 font-mono">
            Running <span className="text-zinc-700 dark:text-zinc-300">({running.length})</span>
          </h2>
          <ul className="border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {running.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm uppercase tracking-wide text-zinc-500 font-mono">
            Done / failed <span className="text-zinc-700 dark:text-zinc-300">({done.length})</span>
          </h2>
          <ul className="border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {done.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
