import { z } from "zod";

export const DAEMON_DEFAULT_PORT = 3738;
export const WEB_DEFAULT_PORT = 3737;

export const RunStatus = z.enum([
  "queued",
  "running",
  "paused",
  "done",
  "failed",
  "handed-off",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const CreateRunRequest = z.object({
  repoPath: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().optional(),
});
export type CreateRunRequest = z.infer<typeof CreateRunRequest>;

export const AgentRun = z.object({
  id: z.string(),
  repoPath: z.string(),
  prompt: z.string(),
  model: z.string().optional(),
  status: RunStatus,
  startedAt: z.number(),
  endedAt: z.number().optional(),
  exitCode: z.number().optional(),
  // Git state at the moment the run started; null if the repo isn't a git repo.
  gitBeforeSha: z.string().nullable().optional(),
  // Aggregate change summary computed at completion. null if not applicable.
  changes: z
    .object({
      filesChanged: z.number(),
      insertions: z.number(),
      deletions: z.number(),
      filesList: z.array(z.string()),
    })
    .nullable()
    .optional(),
});
export type AgentRun = z.infer<typeof AgentRun>;

export const RunDiffResponse = z.object({
  diff: z.string(),
  truncated: z.boolean(),
});
export type RunDiffResponse = z.infer<typeof RunDiffResponse>;

export const ListRunsResponse = z.object({
  runs: z.array(AgentRun),
});
export type ListRunsResponse = z.infer<typeof ListRunsResponse>;
