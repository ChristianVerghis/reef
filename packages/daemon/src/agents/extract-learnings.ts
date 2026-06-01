import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Learning } from "@reef/shared";
import { runLogPath } from "../lifecycle/paths.js";
import { insertLearning } from "../state/learnings.js";

const EXTRACTOR_PROMPT = `You analyze an AI agent's run on a repo and extract durable learnings — durable facts about THIS repo that would help future agents work effectively in it.

A good learning is:
- Specific to this repo (not generic AI/code advice)
- Non-obvious from a quick read of the code
- Actionable for a future agent (encodes a constraint, convention, gotcha, or working pattern)

Skip:
- Generic best practices
- Things obvious from the file structure
- Implementation details of what was just done (the diff already records that)
- Anything you're <30% confident about

Output STRICTLY a JSON array, nothing else. Each object: {"topic": "<kebab-case-slug>", "content": "<1-3 sentence learning>", "confidence": <0.0-1.0>}

If no durable learnings emerged, output []. Do not include explanatory text outside the JSON array.`;

const MAX_OUTPUT_BYTES = 8 * 1024;

interface ExtractedLearning {
  topic: string;
  content: string;
  confidence: number;
}

/**
 * Auto-extraction is OFF by default — it fires an extra `claude -p` call per
 * successful run, which counts against the user's plan allowance on top of
 * the run itself. Opt in with REEF_EXTRACT_LEARNINGS=true (or "1") when you
 * want the substrate to grow automatically.
 */
export function isExtractionEnabled(): boolean {
  const v = process.env.REEF_EXTRACT_LEARNINGS;
  return v === "true" || v === "1";
}

/**
 * Fire-and-forget post-run extraction. Reads the run log, asks claude to mine
 * learnings, deposits them as topsoil. Failures are logged but never propagate.
 */
export async function extractLearningsFromRun(opts: {
  runId: string;
  repoPath: string;
  prompt: string;
}): Promise<void> {
  const { runId, repoPath, prompt } = opts;

  let output = "";
  try {
    const full = await readFile(runLogPath(runId), "utf8");
    output =
      full.length > MAX_OUTPUT_BYTES
        ? "[...truncated...]\n" + full.slice(full.length - MAX_OUTPUT_BYTES)
        : full;
  } catch (err) {
    console.warn(`[extract] could not read run log for ${runId}:`, err);
    return;
  }

  const extractionPrompt =
    `${EXTRACTOR_PROMPT}\n\n` +
    `Repo: ${repoPath}\n` +
    `Original prompt:\n${prompt}\n\n` +
    `Agent output (last ${MAX_OUTPUT_BYTES} bytes):\n${output}`;

  let response: string;
  try {
    response = await runClaude(extractionPrompt);
  } catch (err) {
    console.warn(`[extract] claude call failed for ${runId}:`, err);
    return;
  }

  const parsed = parseJsonArray(response);
  if (!parsed || parsed.length === 0) return;

  for (const item of parsed) {
    if (!isValidExtraction(item)) continue;
    const learning: Learning = {
      id: randomUUID().slice(0, 8),
      content: item.content,
      topic: item.topic,
      layer: "topsoil",
      sourceRunId: runId,
      repoPath,
      confidence: clamp01(item.confidence),
      referencesCount: 0,
      createdAt: Date.now(),
    };
    try {
      insertLearning(learning);
    } catch (err) {
      console.warn(`[extract] insert failed:`, err);
    }
  }
  console.log(
    `[extract] deposited ${parsed.length} topsoil learning(s) from run ${runId}`,
  );
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // /tmp as cwd so claude doesn't accidentally load CLAUDE.md context from any
    // particular repo — this is a pure synthesis call, not a repo-touching agent.
    const child = spawn("claude", ["-p", prompt], {
      cwd: "/tmp",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", () => {
      /* discard */
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function parseJsonArray(raw: string): ExtractedLearning[] | null {
  // Claude sometimes wraps JSON in prose or markdown fences despite instructions.
  // Try strict parse first, then fall back to extracting the first [...] block.
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // continue
  }
  const fenced = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced[1]!);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      // continue
    }
  }
  const bracket = raw.match(/\[\s*[\s\S]*?\]/);
  if (bracket) {
    try {
      const parsed = JSON.parse(bracket[0]);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isValidExtraction(x: unknown): x is ExtractedLearning {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as Record<string, unknown>;
  return (
    typeof obj.topic === "string" &&
    obj.topic.length > 0 &&
    typeof obj.content === "string" &&
    obj.content.length > 0 &&
    typeof obj.confidence === "number"
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
