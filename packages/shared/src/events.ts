import { z } from "zod";
import { RunStatus } from "./protocol";

export const RunEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stdout"),
    runId: z.string(),
    chunk: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("stderr"),
    runId: z.string(),
    chunk: z.string(),
    ts: z.number(),
  }),
  z.object({
    type: z.literal("status"),
    runId: z.string(),
    status: RunStatus,
    exitCode: z.number().optional(),
    ts: z.number(),
  }),
]);
export type RunEvent = z.infer<typeof RunEvent>;
