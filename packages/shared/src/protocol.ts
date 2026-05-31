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
});
export type AgentRun = z.infer<typeof AgentRun>;

export const ListRunsResponse = z.object({
  runs: z.array(AgentRun),
});
export type ListRunsResponse = z.infer<typeof ListRunsResponse>;
