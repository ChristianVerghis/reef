import type { UsageSummary, UsageWindow } from "@reef/shared";
import { db } from "./db.js";

interface UsageTotalRow {
  total_runs: number | null;
  total_in: number | null;
  total_out: number | null;
  total_cost: number | null;
}

interface UsageByModelRow {
  model: string;
  runs: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}

const WINDOW_MS: Record<UsageWindow, number | null> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  all: null,
};

/**
 * Aggregate usage across the requested window. The window is rolling against
 * `started_at` — "day" means the last 24 hours, not "since midnight today."
 * Runs without telemetry (pre-M4 or interrupted) are excluded.
 */
export function summarizeUsage(window: UsageWindow): UsageSummary {
  const span = WINDOW_MS[window];
  const since = span ? Date.now() - span : 0;

  const totals = db()
    .prepare<[number], UsageTotalRow>(
      `SELECT
         COUNT(*) AS total_runs,
         COALESCE(SUM(tokens_in), 0) AS total_in,
         COALESCE(SUM(tokens_out), 0) AS total_out,
         COALESCE(SUM(cost_usd), 0) AS total_cost
       FROM runs
       WHERE tokens_in IS NOT NULL AND started_at >= ?`,
    )
    .get(since);

  const byModel = db()
    .prepare<[number], UsageByModelRow>(
      `SELECT
         COALESCE(model, 'unknown') AS model,
         COUNT(*) AS runs,
         SUM(tokens_in) AS tokens_in,
         SUM(tokens_out) AS tokens_out,
         SUM(cost_usd) AS cost_usd
       FROM runs
       WHERE tokens_in IS NOT NULL AND started_at >= ?
       GROUP BY model
       ORDER BY cost_usd DESC`,
    )
    .all(since);

  return {
    window,
    runCount: totals?.total_runs ?? 0,
    tokensIn: totals?.total_in ?? 0,
    tokensOut: totals?.total_out ?? 0,
    costUsd: totals?.total_cost ?? 0,
    byModel: byModel.map((r) => ({
      model: r.model,
      runs: r.runs,
      tokensIn: r.tokens_in,
      tokensOut: r.tokens_out,
      costUsd: r.cost_usd,
    })),
  };
}
