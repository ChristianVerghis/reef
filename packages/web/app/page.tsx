import Link from "next/link";
import { listRuns, usageSummary } from "@/lib/daemon";
import { STATUS_COLORS } from "@/lib/status";
import type { UsageSummary } from "@reef/shared";

export const dynamic = "force-dynamic";

export default async function Home() {
  let runs: Awaited<ReturnType<typeof listRuns>>["runs"] = [];
  let day: UsageSummary | null = null;
  let week: UsageSummary | null = null;
  let daemonError: string | null = null;
  try {
    [runs, day, week] = await Promise.all([
      listRuns().then((r) => r.runs),
      usageSummary("day"),
      usageSummary("week"),
    ]);
  } catch (err) {
    daemonError = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="mx-auto max-w-5xl w-full px-6 py-10 flex-1 flex flex-col gap-8">
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="uppercase tracking-wide text-xs text-zinc-500 font-mono">
            cockpit
          </span>
          <h1 className="text-4xl font-semibold tracking-tight">Runs</h1>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-prose">
            Every agent run on this machine. Spawn one from{" "}
            <Link href="/new" className="underline underline-offset-4">
              New run
            </Link>
            .
          </p>
        </div>
        {(day || week) && (
          <div className="flex flex-col gap-1 text-right text-xs font-mono text-zinc-500 shrink-0">
            {day && (
              <div>
                <span className="text-zinc-400">today</span>{" "}
                <span className="text-zinc-700 dark:text-zinc-300">
                  {day.runCount} run{day.runCount === 1 ? "" : "s"} · ${day.costUsd.toFixed(2)}
                </span>
              </div>
            )}
            {week && (
              <div>
                <span className="text-zinc-400">7d</span>{" "}
                <span className="text-zinc-700 dark:text-zinc-300">
                  {week.runCount} run{week.runCount === 1 ? "" : "s"} · ${week.costUsd.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </header>

      {daemonError && (
        <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
          <span className="font-mono">daemon unreachable.</span> {daemonError}
        </div>
      )}

      {!daemonError && runs.length === 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-10 text-center">
          <p className="text-zinc-500">No runs yet.</p>
          <Link
            href="/new"
            className="inline-block mt-4 px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 text-sm font-medium"
          >
            Start your first run
          </Link>
        </div>
      )}

      {runs.length > 0 && (
        <ul className="border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
          {runs.map((run) => {
            const c = STATUS_COLORS[run.status];
            return (
              <li key={run.id}>
                <Link
                  href={`/agents/${run.id}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${c.dot} shrink-0`}
                    aria-label={c.label}
                  />
                  <span className="font-mono text-xs text-zinc-500 shrink-0">
                    {run.id}
                  </span>
                  <span className="flex-1 truncate text-sm">{run.prompt}</span>
                  <span className="font-mono text-xs text-zinc-500 shrink-0 hidden sm:inline">
                    {run.repoPath.split("/").slice(-2).join("/")}
                  </span>
                  <span className={`text-xs font-medium shrink-0 ${c.text}`}>
                    {c.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
