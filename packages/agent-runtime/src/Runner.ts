/**
 * Provider-agnostic interface for spawning and observing an agent run.
 *
 * The point of this layer is to give Reef structured visibility into a run —
 * text deltas, tool use, usage telemetry — rather than parsing opaque stdout.
 * Today's implementation wraps the Claude Agent SDK; future runners (local
 * model via Ollama, OpenAI Codex, custom shell scripts) implement the same
 * interface so swapping is a config change rather than a refactor.
 */

export interface RunnerSpec {
  /** The (already-primed) prompt to send to the agent. */
  prompt: string;
  /** Working directory the agent should operate in. */
  cwd: string;
  /** Optional model override; runners pick a sensible default if absent. */
  model?: string;
  /** Environment variables to inherit. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

export interface UsageReport {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  costUsd: number;
  model: string;
  durationMs?: number;
}

/** Discriminated union of events a runner emits during a run. */
export type RunnerEvent =
  | { type: "stdout"; chunk: string; ts: number }
  | { type: "stderr"; chunk: string; ts: number }
  | { type: "tool-use"; tool: string; input: unknown; ts: number }
  | { type: "tool-result"; tool: string; isError: boolean; ts: number }
  | { type: "usage"; report: UsageReport; ts: number };

export interface RunHandle {
  /** Async iterator of events emitted by the run. Completes when the run ends. */
  events: AsyncIterable<RunnerEvent>;
  /** Resolves with the final exit code (0 success, non-zero failure). */
  done: Promise<number>;
  /** Final usage report — populated when the run ends, null while running. */
  getUsage(): UsageReport | null;
  /** Request a graceful stop (SIGTERM-equivalent). */
  stop(): void;
}

export interface Runner {
  /** Start a run. Returns a handle that the caller iterates and observes. */
  start(spec: RunnerSpec): RunHandle;
}
