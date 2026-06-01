import Link from "next/link";
import { listLearnings } from "@/lib/daemon";
import { LearningRow } from "./learning-row";
import type { Learning } from "@reef/shared";

export const dynamic = "force-dynamic";

export default async function ReefPage() {
  let learnings: Learning[] = [];
  let daemonError: string | null = null;
  try {
    learnings = (await listLearnings()).learnings;
  } catch (err) {
    daemonError = err instanceof Error ? err.message : String(err);
  }

  const byLayer: Record<string, Learning[]> = {
    bedrock: [],
    loam: [],
    topsoil: [],
    fossil: [],
  };
  for (const l of learnings) {
    byLayer[l.layer]?.push(l);
  }

  return (
    <main className="mx-auto max-w-5xl w-full px-6 py-10 flex-1 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="uppercase tracking-wide text-xs text-zinc-500 font-mono">
          substrate
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">Reef</h1>
        <p className="text-zinc-600 dark:text-zinc-400 max-w-prose">
          The strata of accumulated knowledge across your repos. Fresh learnings
          start as <em>topsoil</em> and settle into <em>loam</em> after they get
          referenced and aged. Petrify a learning to make it <em>bedrock</em> —
          load-bearing truth that outranks everything else in future agent runs.
        </p>
      </header>

      {daemonError && (
        <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
          <span className="font-mono">daemon unreachable.</span> {daemonError}
        </div>
      )}

      {!daemonError && learnings.length === 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-10 text-center">
          <p className="text-zinc-500">
            No learnings yet. Successful agent runs deposit topsoil automatically;
            you can also use the CLI to seed bedrock manually.
          </p>
        </div>
      )}

      {(["bedrock", "loam", "topsoil", "fossil"] as const).map((layer) => {
        const rows = byLayer[layer]!;
        if (rows.length === 0) return null;
        const meta = LAYER_META[layer]!;
        return (
          <section key={layer} className="flex flex-col gap-3">
            <h2 className="flex items-center gap-3 text-sm uppercase tracking-wide font-mono">
              <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              <span className={meta.text}>{meta.label}</span>
              <span className="text-zinc-500">({rows.length})</span>
              <span className="text-xs normal-case text-zinc-500 ml-3 font-sans">
                {meta.description}
              </span>
            </h2>
            <ul className="border border-zinc-200 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
              {rows.map((l) => (
                <LearningRow key={l.id} learning={l} />
              ))}
            </ul>
          </section>
        );
      })}

      <footer className="text-xs text-zinc-500 mt-8">
        Try <code className="font-mono">reef dig &lt;topic&gt;</code> in the terminal to query strata from the CLI, or{" "}
        <Link href="/" className="underline underline-offset-4">see runs</Link>.
      </footer>
    </main>
  );
}

const LAYER_META: Record<string, { label: string; dot: string; text: string; description: string }> = {
  bedrock: {
    label: "Bedrock",
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    description: "Load-bearing — codified by humans, outranks everything in retrieval.",
  },
  loam: {
    label: "Loam",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    description: "Settled — confirmed by repeated reference + age.",
  },
  topsoil: {
    label: "Topsoil",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    description: "Fresh — deposited from recent runs, not yet confirmed.",
  },
  fossil: {
    label: "Fossil",
    dot: "bg-zinc-500",
    text: "text-zinc-500",
    description: "Outdated — preserved for historical context, excluded from default digs.",
  },
};
