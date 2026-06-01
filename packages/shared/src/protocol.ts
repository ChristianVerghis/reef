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
  taskId: z.string().optional(),
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
  taskId: z.string().nullable().optional(),
});
export type AgentRun = z.infer<typeof AgentRun>;

export const TaskStatus = z.enum([
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const Task = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  repoPath: z.string(),
  status: TaskStatus,
  // 1 = low, 2 = medium (default), 3 = high.
  priority: z.number().int().min(1).max(3),
  pinned: z.boolean(),
  currentRunId: z.string().nullable().optional(),
  createdAt: z.number(),
  startedAt: z.number().nullable().optional(),
  endedAt: z.number().nullable().optional(),
});
export type Task = z.infer<typeof Task>;

export const CreateTaskRequest = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  repoPath: z.string().min(1),
  priority: z.number().int().min(1).max(3).default(2),
  pinned: z.boolean().default(false),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskRequest>;

export const ListTasksResponse = z.object({ tasks: z.array(Task) });
export type ListTasksResponse = z.infer<typeof ListTasksResponse>;

export const StartTaskResponse = z.object({
  task: Task,
  run: AgentRun,
});
export type StartTaskResponse = z.infer<typeof StartTaskResponse>;

export const RunDiffResponse = z.object({
  diff: z.string(),
  truncated: z.boolean(),
});
export type RunDiffResponse = z.infer<typeof RunDiffResponse>;

export const ListRunsResponse = z.object({
  runs: z.array(AgentRun),
});
export type ListRunsResponse = z.infer<typeof ListRunsResponse>;

export const Layer = z.enum(["topsoil", "loam", "bedrock", "fossil"]);
export type Layer = z.infer<typeof Layer>;

export const Learning = z.object({
  id: z.string(),
  content: z.string(),
  topic: z.string(),
  layer: Layer,
  sourceRunId: z.string().nullable().optional(),
  repoPath: z.string(),
  confidence: z.number().min(0).max(1),
  referencesCount: z.number().int(),
  createdAt: z.number(),
  lastReferencedAt: z.number().nullable().optional(),
  promotedAt: z.number().nullable().optional(),
});
export type Learning = z.infer<typeof Learning>;

export const ListLearningsResponse = z.object({ learnings: z.array(Learning) });
export type ListLearningsResponse = z.infer<typeof ListLearningsResponse>;

export const CreateLearningRequest = z.object({
  content: z.string().min(1),
  topic: z.string().min(1),
  repoPath: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
  sourceRunId: z.string().optional(),
});
export type CreateLearningRequest = z.infer<typeof CreateLearningRequest>;
