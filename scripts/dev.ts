import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const procs = [
  {
    name: "daemon",
    cmd: "pnpm",
    args: ["--filter", "@reef/daemon", "dev"],
    color: "\x1b[36m",
  },
  {
    name: "web   ",
    cmd: "pnpm",
    args: ["--filter", "@reef/web", "dev"],
    color: "\x1b[35m",
  },
];

for (const p of procs) {
  const child = spawn(p.cmd, p.args, { cwd: root, env: process.env });
  const tag = `${p.color}[${p.name}]\x1b[0m`;
  child.stdout.on("data", (d) => process.stdout.write(prefix(tag, d)));
  child.stderr.on("data", (d) => process.stderr.write(prefix(tag, d)));
  child.on("exit", (code) => {
    console.error(`${tag} exited (${code})`);
    process.exit(code ?? 1);
  });
}

function prefix(tag: string, buf: Buffer): string {
  return buf
    .toString("utf8")
    .split("\n")
    .map((l, i, arr) => (i === arr.length - 1 && l === "" ? l : `${tag} ${l}`))
    .join("\n");
}

console.log("reef dev — daemon + web. Open http://localhost:3737");
