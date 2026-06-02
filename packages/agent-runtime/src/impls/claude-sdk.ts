import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  RunHandle,
  Runner,
  RunnerEvent,
  RunnerSpec,
  UsageReport,
} from "../Runner.js";

/**
 * Wraps @anthropic-ai/claude-agent-sdk's `query()` to emit our structured
 * RunnerEvent stream. The SDK itself spawns a `claude` subprocess under the
 * hood (using the user's authenticated Claude Code session, NOT a separate
 * API key), so this preserves the existing billing model.
 *
 * What we gain over `spawn("claude", ["-p", ...])`:
 *   - Real token counts and cost in dollars per run
 *   - The model that actually ran (not what we guessed)
 *   - Structured tool-use events instead of free-text parsing
 *   - Distinguishable stdout-text vs system messages
 */
export class ClaudeSDKRunner implements Runner {
  start(spec: RunnerSpec): RunHandle {
    const queue: RunnerEvent[] = [];
    const waiters: Array<(v: IteratorResult<RunnerEvent>) => void> = [];
    let closed = false;
    let finalUsage: UsageReport | null = null;
    let exitCode = 0;
    let aborted = false;

    function push(event: RunnerEvent) {
      if (closed) return;
      if (waiters.length > 0) {
        waiters.shift()!({ value: event, done: false });
      } else {
        queue.push(event);
      }
    }

    function close() {
      closed = true;
      while (waiters.length > 0) {
        waiters.shift()!({ value: undefined, done: true });
      }
    }

    const events: AsyncIterable<RunnerEvent> = {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<RunnerEvent>> {
            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift()!, done: false });
            }
            if (closed) return Promise.resolve({ value: undefined, done: true });
            return new Promise((resolve) => waiters.push(resolve));
          },
        };
      },
    };

    const abortController = new AbortController();

    const done: Promise<number> = (async () => {
      try {
        const iterator = query({
          prompt: spec.prompt,
          options: {
            cwd: spec.cwd,
            ...(spec.model ? { model: spec.model } : {}),
            abortController,
          },
        });

        for await (const message of iterator) {
          handleMessage(message, push, (usage) => (finalUsage = usage));
        }
      } catch (err) {
        if (aborted) {
          // Caller-initiated stop — not a failure.
          exitCode = 130;
        } else {
          push({
            type: "stderr",
            chunk: `\n[runner] ${err instanceof Error ? err.message : String(err)}\n`,
            ts: Date.now(),
          });
          exitCode = 1;
        }
      } finally {
        close();
      }
      return exitCode;
    })();

    return {
      events,
      done,
      getUsage: () => finalUsage,
      stop: () => {
        aborted = true;
        abortController.abort();
      },
    };
  }
}

function handleMessage(
  message: SDKMessage,
  push: (e: RunnerEvent) => void,
  setUsage: (u: UsageReport) => void,
) {
  const ts = Date.now();

  // SDK messages are a discriminated union by `type`. We translate the subset
  // we care about into RunnerEvents; everything else is silently ignored to
  // stay forward-compatible with new SDK message types.
  switch (message.type) {
    case "assistant": {
      // Assistant turn — emit each text block as a stdout chunk.
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && typeof block.text === "string") {
            push({ type: "stdout", chunk: block.text, ts });
          } else if (block.type === "tool_use") {
            push({
              type: "tool-use",
              tool: block.name,
              input: block.input,
              ts,
            });
          }
        }
      }
      break;
    }
    case "user": {
      // Tool results come back as user-role messages from the SDK.
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result") {
            push({
              type: "tool-result",
              tool: typeof block.tool_use_id === "string" ? block.tool_use_id : "?",
              isError: block.is_error === true,
              ts,
            });
          }
        }
      }
      break;
    }
    case "result": {
      // Terminal message — carries the canonical usage + cost numbers.
      // SDK keys the model name as a key in `modelUsage` rather than a top-level
      // field (a run can touch multiple models via hand-off). For our purposes,
      // record whichever model burned the most tokens.
      const usageBlock = "usage" in message ? message.usage : undefined;
      const modelUsage = "modelUsage" in message ? message.modelUsage : undefined;
      const dominantModel = pickDominantModel(modelUsage) ?? "unknown";
      const usage: UsageReport = {
        inputTokens: usageBlock?.input_tokens ?? 0,
        outputTokens: usageBlock?.output_tokens ?? 0,
        cacheCreationTokens: usageBlock?.cache_creation_input_tokens,
        cacheReadTokens: usageBlock?.cache_read_input_tokens,
        costUsd: "total_cost_usd" in message ? message.total_cost_usd : 0,
        model: dominantModel,
        durationMs: message.duration_ms,
      };
      setUsage(usage);
      push({ type: "usage", report: usage, ts });
      break;
    }
    case "system":
      // SDK init / config messages — not user-visible.
      break;
    default:
      break;
  }
}

/**
 * Multiple models can show up in a single run when the agent hands off
 * (e.g. Opus for planning, Sonnet for execution). The "dominant" model is
 * the one that consumed the most tokens — best single-string summary.
 */
function pickDominantModel(modelUsage: Record<string, { inputTokens?: number; outputTokens?: number }> | undefined): string | null {
  if (!modelUsage) return null;
  const entries = Object.entries(modelUsage);
  if (entries.length === 0) return null;
  let bestModel = entries[0]![0];
  let bestTokens = -1;
  for (const [model, u] of entries) {
    const tokens = (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
    if (tokens > bestTokens) {
      bestTokens = tokens;
      bestModel = model;
    }
  }
  return bestModel;
}
