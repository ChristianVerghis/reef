import type { IncomingMessage, ServerResponse } from "node:http";
import { createRun, listRuns, getRun, stopRun, getRunDiff, BadRequestError } from "../agents/registry.js";
import { subscribe } from "../agents/events.js";
import { CreateRunRequest, CreateTaskRequest } from "@roost/shared";
import { randomUUID } from "node:crypto";
import {
  deleteTask,
  findNextQueuedTask,
  findTask,
  insertTask,
  listAllTasks,
  makeTask,
  updateTaskStatus,
} from "../state/tasks.js";

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // GET /api/health
  if (method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, { ok: true });
  }

  // GET /api/runs
  if (method === "GET" && url.pathname === "/api/runs") {
    return json(res, 200, { runs: listRuns() });
  }

  // POST /api/runs
  if (method === "POST" && url.pathname === "/api/runs") {
    const body = await readJson(req);
    const parsed = CreateRunRequest.safeParse(body);
    if (!parsed.success) {
      return json(res, 400, { error: "invalid request", details: parsed.error.flatten() });
    }
    try {
      const run = await createRun(parsed.data);
      return json(res, 201, { run });
    } catch (err) {
      if (err instanceof BadRequestError) {
        return json(res, 400, { error: err.message });
      }
      throw err;
    }
  }

  // GET /api/runs/:id
  const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (method === "GET" && runMatch) {
    const run = getRun(runMatch[1]!);
    if (!run) return json(res, 404, { error: "not found" });
    return json(res, 200, { run });
  }

  // DELETE /api/runs/:id  → stop
  if (method === "DELETE" && runMatch) {
    const ok = stopRun(runMatch[1]!);
    return json(res, ok ? 200 : 404, { ok });
  }

  // GET /api/runs/:id/stream  → SSE
  const streamMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/stream$/);
  if (method === "GET" && streamMatch) {
    return streamRun(req, res, streamMatch[1]!);
  }

  // GET /api/runs/:id/diff
  const diffMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/diff$/);
  if (method === "GET" && diffMatch) {
    const result = await getRunDiff(diffMatch[1]!);
    if (!result) return json(res, 404, { error: "run not found" });
    return json(res, 200, result);
  }

  // GET /api/tasks
  if (method === "GET" && url.pathname === "/api/tasks") {
    return json(res, 200, { tasks: listAllTasks() });
  }

  // GET /api/tasks/next
  if (method === "GET" && url.pathname === "/api/tasks/next") {
    const next = findNextQueuedTask();
    return json(res, 200, { task: next });
  }

  // POST /api/tasks
  if (method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJson(req);
    const parsed = CreateTaskRequest.safeParse(body);
    if (!parsed.success) {
      return json(res, 400, { error: "invalid request", details: parsed.error.flatten() });
    }
    const task = makeTask(parsed.data, randomUUID().slice(0, 8));
    insertTask(task);
    return json(res, 201, { task });
  }

  // POST /api/tasks/:id/start  → transitions task to running and creates a run
  const startTaskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/start$/);
  if (method === "POST" && startTaskMatch) {
    const taskId = startTaskMatch[1]!;
    const task = findTask(taskId);
    if (!task) return json(res, 404, { error: "task not found" });
    if (task.status !== "queued") {
      return json(res, 409, { error: `task is ${task.status}, not queued` });
    }
    try {
      const run = await createRun({
        repoPath: task.repoPath,
        prompt: composePromptFromTask(task.title, task.body),
        taskId: task.id,
      });
      updateTaskStatus(task.id, "running", {
        currentRunId: run.id,
        startedAt: Date.now(),
      });
      const updated = findTask(task.id);
      return json(res, 201, { task: updated, run });
    } catch (err) {
      if (err instanceof BadRequestError) {
        return json(res, 400, { error: err.message });
      }
      throw err;
    }
  }

  // DELETE /api/tasks/:id
  const taskIdMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (method === "DELETE" && taskIdMatch) {
    const ok = deleteTask(taskIdMatch[1]!);
    return json(res, ok ? 200 : 404, { ok });
  }

  // GET /api/tasks/:id
  if (method === "GET" && taskIdMatch) {
    const task = findTask(taskIdMatch[1]!);
    if (!task) return json(res, 404, { error: "task not found" });
    return json(res, 200, { task });
  }

  json(res, 404, { error: "not found" });
}

function composePromptFromTask(title: string, body: string): string {
  return body.trim() ? `${title}\n\n${body}` : title;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid JSON body");
  }
}

function streamRun(req: IncomingMessage, res: ServerResponse, runId: string) {
  const run = getRun(runId);
  if (!run) return json(res, 404, { error: "run not found" });

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    ...CORS_HEADERS,
  });
  res.write(`retry: 1000\n\n`);

  const unsubscribe = subscribe(runId, (event) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
