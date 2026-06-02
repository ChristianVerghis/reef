import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DAEMON_DEFAULT_PORT, WEB_DEFAULT_PORT } from "@reef/shared";
import { findLiveDaemon } from "../lib/pidfile.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..", "..");

export async function start(args: string[]): Promise<void> {
  const force = args.includes("--force");

  // Don't double-fork — if a daemon is already running, just open the browser
  // and exit cleanly. This is the most common cause of the EADDRINUSE pain.
  const live = findLiveDaemon();
  if (live && !force) {
    const webUrl = `http://localhost:${WEB_DEFAULT_PORT}`;
    const ageMin = Math.floor((Date.now() - live.startedAt) / 60_000);
    console.log(
      `reef daemon already running (pid ${live.pid}, port ${live.port}, up ${ageMin}m).\n` +
        `opening ${webUrl} — use 'reef shutdown' to stop the daemon, or pass --force to override.`,
    );
    openBrowser(webUrl);
    return;
  }

  const procs: { name: string; color: string; child: ChildProcess }[] = [];

  procs.push(launch("daemon", "\x1b[36m", ["--filter", "@reef/daemon", "dev"]));
  procs.push(launch("web   ", "\x1b[35m", ["--filter", "@reef/web", "dev"]));

  const webUrl = `http://localhost:${WEB_DEFAULT_PORT}`;
  const daemonUrl = `http://127.0.0.1:${DAEMON_DEFAULT_PORT}`;

  // Wait for the web server to respond before opening the browser.
  void waitFor(webUrl).then(() => openBrowser(webUrl));

  console.log(`reef ready
  web:    ${webUrl}
  daemon: ${daemonUrl}
  ctrl-c to quit
`);

  const shutdown = () => {
    for (const p of procs) p.child.kill("SIGTERM");
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Block the event loop on child exits.
  await new Promise<void>((resolve) => {
    let alive = procs.length;
    for (const p of procs) {
      p.child.on("exit", (code) => {
        console.error(`[${p.name.trim()}] exited (${code})`);
        if (--alive === 0) resolve();
      });
    }
  });
}

function launch(name: string, color: string, args: string[]) {
  const child = spawn("pnpm", args, { cwd: repoRoot, env: process.env });
  const tag = `${color}[${name}]\x1b[0m`;
  child.stdout?.on("data", (d) => process.stdout.write(prefix(tag, d)));
  child.stderr?.on("data", (d) => process.stderr.write(prefix(tag, d)));
  return { name, color, child };
}

function prefix(tag: string, buf: Buffer): string {
  const lines = buf.toString("utf8").split("\n");
  return lines
    .map((l, i) => (i === lines.length - 1 && l === "" ? l : `${tag} ${l}`))
    .join("\n");
}

async function waitFor(url: string, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok || res.status === 404) return;
    } catch {
      // not up yet
    }
    await sleep(300);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function openBrowser(url: string) {
  const platform = process.platform;
  const opener =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
}
