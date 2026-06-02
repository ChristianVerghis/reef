import { findLiveDaemon } from "../lib/pidfile.js";

/**
 * Gracefully stop the running daemon via SIGTERM through the pidfile.
 * Does NOT touch the web dev process — if you started both via `reef start`,
 * Ctrl-C is still the right way to stop the foreground pair.
 *
 * This command exists mainly for the case where the daemon is detached
 * (started in another shell, or by a launchd agent later) and there's no
 * obvious way to find its pid manually.
 */
export async function shutdown(_args: string[]): Promise<void> {
  const live = findLiveDaemon();
  if (!live) {
    console.log("no reef daemon running.");
    return;
  }
  try {
    process.kill(live.pid, "SIGTERM");
  } catch (err) {
    console.error(`failed to signal pid ${live.pid}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // Poll briefly for graceful shutdown so we can give the user clear feedback.
  for (let i = 0; i < 30; i++) {
    await sleep(100);
    if (!findLiveDaemon()) {
      console.log(`stopped reef daemon (pid ${live.pid}).`);
      return;
    }
  }
  console.warn(`sent SIGTERM to pid ${live.pid} but it's still alive after 3s.`);
  console.warn(`if it's truly stuck: kill -9 ${live.pid}`);
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
