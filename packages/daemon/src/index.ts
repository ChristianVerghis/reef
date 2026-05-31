import { createServer } from "node:http";
import { DAEMON_DEFAULT_PORT } from "@roost/shared";
import { handleRequest } from "./http/router.js";
import { ensureRoostDir } from "./lifecycle/paths.js";
import { initDb } from "./state/db.js";
import { reconcileOrphanedRuns } from "./state/runs.js";

const port = Number(process.env.ROOST_DAEMON_PORT ?? DAEMON_DEFAULT_PORT);

await ensureRoostDir();
initDb();
const reconciled = reconcileOrphanedRuns();
if (reconciled > 0) {
  console.log(`[daemon] reconciled ${reconciled} orphaned run(s) → failed`);
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
  console.log(`[daemon] listening on http://127.0.0.1:${port}`);
});

const shutdown = (signal: string) => {
  console.log(`[daemon] ${signal} — shutting down`);
  // Force-close SSE clients (long-lived keep-alive sockets would otherwise stall
  // server.close() and block tsx-watch from rebinding the port on hot reload).
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 300).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
