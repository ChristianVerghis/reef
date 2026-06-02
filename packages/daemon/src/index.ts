import { createServer } from "node:http";
import { DAEMON_DEFAULT_PORT } from "@reef/shared";
import { handleRequest } from "./http/router.js";
import { ensureReefDir } from "./lifecycle/paths.js";
import { initDb } from "./state/db.js";
import { reconcileOrphanedRuns } from "./state/runs.js";
import { promoteEligibleLearnings } from "./state/learnings.js";
import { clearPidfile, findLiveDaemon, writePidfile } from "./lifecycle/pidfile.js";

const port = Number(process.env.REEF_DAEMON_PORT ?? DAEMON_DEFAULT_PORT);

await ensureReefDir();

// Refuse to start if another daemon is already running. This is the fix for
// the zombie-process pain — instead of two daemons racing on the same port,
// the second one bows out with a clear message.
const live = findLiveDaemon();
if (live) {
  console.error(
    `[daemon] refusing to start — another reef daemon is already running (pid ${live.pid}, port ${live.port}).\n` +
      `         use 'reef shutdown' to stop it, or 'reef status' to inspect.`,
  );
  process.exit(1);
}

initDb();
const reconciled = reconcileOrphanedRuns();
if (reconciled > 0) {
  console.log(`[daemon] reconciled ${reconciled} orphaned run(s) → failed`);
}
const promoted = promoteEligibleLearnings();
if (promoted > 0) {
  console.log(`[daemon] promoted ${promoted} learning(s): topsoil → loam`);
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error("[daemon] unhandled error", err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    } else {
      res.end();
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  writePidfile(port);
  console.log(`[daemon] listening on http://127.0.0.1:${port} (pid ${process.pid})`);
});

const shutdown = (signal: string) => {
  console.log(`[daemon] ${signal} — shutting down`);
  clearPidfile();
  // Force-close SSE clients (long-lived keep-alive sockets would otherwise stall
  // server.close() and block tsx-watch from rebinding the port on hot reload).
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 300).unref();
};

// Catch unexpected exits too (uncaught error, parent crash) — without this
// path the pidfile would persist and block the next daemon from starting.
process.on("exit", () => clearPidfile());
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
