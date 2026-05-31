import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const MAX_DIFF_BYTES = 1_000_000; // 1MB cap; anything larger gets truncated.

export interface GitSnapshot {
  isRepo: boolean;
  sha: string | null;
}

export interface GitChanges {
  filesChanged: number;
  insertions: number;
  deletions: number;
  filesList: string[];
}

export async function snapshot(cwd: string): Promise<GitSnapshot> {
  const sha = await runGit(["rev-parse", "HEAD"], cwd);
  if (sha.exitCode !== 0) return { isRepo: false, sha: null };
  return { isRepo: true, sha: sha.stdout.trim() };
}

/**
 * Net working-tree change vs baseline. Includes tracked edits and untracked files,
 * which is the only way to capture the full impact of an agent that creates new files.
 */
export async function changesSince(
  cwd: string,
  baselineSha: string | null,
): Promise<GitChanges | null> {
  if (!baselineSha) return null;

  const filesList = new Set<string>();
  let insertions = 0;
  let deletions = 0;

  // Tracked file changes (committed since baseline + unstaged edits, all rolled into one).
  const numstat = await runGit(["diff", "--numstat", baselineSha], cwd);
  for (const line of numstat.stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const insStr = parts[0]!;
    const delStr = parts[1]!;
    const file = parts.slice(2).join("\t");
    filesList.add(file);
    if (insStr !== "-") insertions += Number(insStr);
    if (delStr !== "-") deletions += Number(delStr);
  }

  // Untracked files.
  const untracked = await runGit(["ls-files", "--others", "--exclude-standard"], cwd);
  for (const raw of untracked.stdout.split("\n")) {
    const file = raw.trim();
    if (!file) continue;
    filesList.add(file);
    insertions += await countLines(path.join(cwd, file));
  }

  return {
    filesChanged: filesList.size,
    insertions,
    deletions,
    filesList: [...filesList].sort(),
  };
}

export async function diffSince(
  cwd: string,
  baselineSha: string | null,
): Promise<{ diff: string; truncated: boolean }> {
  if (!baselineSha) return { diff: "", truncated: false };

  // Tracked diff.
  const tracked = await runGit(["diff", baselineSha], cwd, MAX_DIFF_BYTES);
  let diff = tracked.stdout;
  let truncated = tracked.truncated;
  let remaining = MAX_DIFF_BYTES - Buffer.byteLength(diff, "utf8");

  if (remaining > 0) {
    const untracked = await runGit(["ls-files", "--others", "--exclude-standard"], cwd);
    for (const raw of untracked.stdout.split("\n")) {
      const file = raw.trim();
      if (!file) continue;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const synthetic = await synthesizeUntrackedDiff(cwd, file);
      const bytes = Buffer.byteLength(synthetic, "utf8");
      if (bytes > remaining) {
        diff += synthetic.slice(0, remaining);
        remaining = 0;
        truncated = true;
        break;
      }
      diff += synthetic;
      remaining -= bytes;
    }
  }

  return { diff, truncated };
}

async function synthesizeUntrackedDiff(cwd: string, file: string): Promise<string> {
  let content: string;
  try {
    content = await readFile(path.join(cwd, file), "utf8");
  } catch {
    return `diff --git a/${file} b/${file}\nnew file (binary or unreadable)\n`;
  }
  const lines = content.split("\n");
  const trailingNewline = lines[lines.length - 1] === "";
  if (trailingNewline) lines.pop();
  const header =
    `diff --git a/${file} b/${file}\n` +
    `new file mode 100644\n` +
    `--- /dev/null\n` +
    `+++ b/${file}\n` +
    `@@ -0,0 +1,${lines.length} @@\n`;
  const body = lines.map((l) => `+${l}`).join("\n");
  return header + body + (trailingNewline ? "\n" : "\n\\ No newline at end of file\n");
}

async function countLines(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n");
    return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  } catch {
    return 1; // binary or unreadable
  }
}

async function runGit(
  args: string[],
  cwd: string,
  maxBytes = 256 * 1024,
): Promise<{ stdout: string; exitCode: number; truncated: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd, env: process.env });
    const chunks: Buffer[] = [];
    let total = 0;
    let truncated = false;

    child.stdout.on("data", (chunk: Buffer) => {
      if (total >= maxBytes) {
        truncated = true;
        return;
      }
      const remaining = maxBytes - total;
      if (chunk.length > remaining) {
        chunks.push(chunk.subarray(0, remaining));
        total = maxBytes;
        truncated = true;
      } else {
        chunks.push(chunk);
        total += chunk.length;
      }
    });

    child.stderr.on("data", () => {
      // discard
    });

    child.on("error", () => resolve({ stdout: "", exitCode: -1, truncated: false }));
    child.on("close", (code) =>
      resolve({
        stdout: Buffer.concat(chunks).toString("utf8"),
        exitCode: code ?? -1,
        truncated,
      }),
    );
  });
}
