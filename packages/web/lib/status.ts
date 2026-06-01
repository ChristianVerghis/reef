import type { RunStatus } from "@reef/shared";

export const STATUS_COLORS: Record<RunStatus, { dot: string; text: string; label: string }> = {
  queued: { dot: "bg-zinc-400", text: "text-zinc-500", label: "Queued" },
  running: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "Running" },
  paused: { dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-400", label: "Paused" },
  done: { dot: "bg-emerald-600", text: "text-emerald-700 dark:text-emerald-300", label: "Done" },
  failed: { dot: "bg-rose-500", text: "text-rose-600 dark:text-rose-400", label: "Failed" },
  "handed-off": { dot: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", label: "Handed off" },
};
