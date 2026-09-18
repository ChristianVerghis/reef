# Reef

**A local-first cockpit for running coding agents across many git repos, with a per-repo memory of what those agents learned.**

## What it is

Reef is a long-lived daemon plus a thin web UI and CLI that let you launch, watch, and stop Claude Code agent runs against any repo on your machine. Every run is a local subprocess with the same access you have: your checkouts, `gh` auth, SSH keys, and environment. Nothing leaves the machine except the model calls the agent itself makes.

Three pieces, one process tree:

- **Daemon** (`packages/daemon`) is the source of truth. It owns a SQLite database at `~/.reef/state.db`, spawns agents, captures their output, and exposes a JSON/SSE HTTP API on `127.0.0.1:3738`.
- **Web** (`packages/web`) is a Next.js App Router UI on `localhost:3737` that reads from the daemon: runs, live output streams, diffs, a task queue, usage/cost totals, and the learnings strata.
- **CLI** (`reef`) starts and stops the daemon and web, queues work, and queries learnings from the terminal.

What the daemon records per run:

- Git baseline SHA at start, then a `--numstat` summary and a full diff (tracked and untracked, capped at 1 MB) at completion.
- Token counts, dollar cost, and the model that actually ran, taken from the Claude Agent SDK's terminal `result` message. Summaries by day/week/month/all are exposed at `/api/usage/summary` and in `reef usage`.
- An append-only log at `~/.reef/runs/<id>.log` for replay.

**Learnings ("strata").** Each learning is one durable, repo-specific fact (a constraint, convention, or gotcha) with a topic slug and confidence. Learnings move through layers modelled on sediment:

- `topsoil` — fresh, low trust. Where new learnings land.
- `loam` — settled. Auto-promoted from topsoil on daemon start once a learning has been referenced at least 3 times and is at least 7 days old.
- `bedrock` — codified truth. Promoted manually with `reef petrify`.
- `fossil` — outdated but preserved. Set manually with `reef fossilize`; excluded from retrieval.

When a run starts, the daemon selects learnings for that repo (bedrock first, then loam, then topsoil; ranked by confidence and recency; capped at 20 items / 8 KB) and prepends them to the prompt. Each priming is recorded in a `run_primings` table and bumps the learning's reference count, which is what drives topsoil-to-loam promotion. `reef brief` previews exactly what a run on a given repo would be primed with.

`reef dig` is read-only: looking a learning up does not count as a reference, only being primed into a run does. Learnings can be added by hand via `POST /api/learnings`, or mined automatically from successful runs by a second `claude -p` call. Auto-extraction is **off by default** because it costs an extra model call per run; enable it with `REEF_EXTRACT_LEARNINGS=true` in the daemon's environment.

**Tasks.** A queue of `{title, body, repoPath, priority 1-3, pinned}` items. `reef next` (or the UI) starts the highest-priority queued task as a run; the task's status mirrors the run's outcome.

**Agent runtime.** `packages/agent-runtime` defines a provider-agnostic `Runner` interface (structured `stdout`/`stderr`/`tool-use`/`tool-result`/`usage` events, a `done` promise, and `stop()`). The only implementation today wraps `@anthropic-ai/claude-agent-sdk`'s `query()`, which shells out to the user's authenticated `claude` install. There is no separate API key or billing relationship; runs count against whatever plan `claude login` is signed into.

## Why I built it

I was running Claude Code across a dozen personal repos and kept losing two things: a single view of what was running where and what it cost, and the small repo-specific facts each session rediscovered (which package manager, which port, which files never to touch). Reef is the tool I wanted for that: a daemon that owns the run history and cost data, and a memory layer that lets facts earn trust over time by actually being used in later runs instead of being pasted into every prompt by hand.

## Status

As of 2026-09-18. Version 0.0.0. Development resumed 2026-09-18 after a pause at milestone M4 (June 2026).

Works:

- Daemon with SQLite persistence (WAL mode), pidfile-based single-instance guard, graceful shutdown, and reconciliation of orphaned runs to `failed` on restart.
- Spawning runs against any local path, live SSE output stream, stop, diff view, and per-run priming list in the UI.
- Task queue with priority and pinning; `reef next` and the `/tasks` page.
- Learnings CRUD, topic search (`reef dig`), manual promotion (`petrify`/`fossilize`), automatic topsoil-to-loam promotion, and prompt priming with recorded provenance.
- Token/cost telemetry per run and aggregated usage windows.
- `pnpm typecheck` and `pnpm lint` pass; `pnpm test` runs the daemon's Vitest suite (13 tests on the learnings module: promotion rules, priming selection and caps, provenance, dig, preamble).

Rough or missing:

- Tests cover only the learnings module so far; runs, tasks, the HTTP API and the web UI are untested.
- Tool-use events from the SDK are written to the run log but not yet shown in the UI.
- Topic search is SQL `LIKE` on topic and content; no semantic retrieval.
- `paused` and `handed-off` run statuses are defined in the schema but no code path produces them.
- Loopback HTTP only; no auth on the daemon API (it binds to `127.0.0.1` and sets permissive CORS).
- Developed and tested on macOS; expected to work on Linux; Windows untested.
- The web package runs `next dev` under `reef start`; there is no packaged production build or installer.

## Stack

- TypeScript throughout, run with `tsx` (no build step for the daemon/CLI).
- pnpm workspaces.
- Daemon: Node `http`, `better-sqlite3`, `zod`.
- Web: Next.js 16.2 (App Router, Server Components), React 19.2, Tailwind CSS 4 via `@tailwindcss/postcss`, ESLint 9.
- Agent runtime: `@anthropic-ai/claude-agent-sdk`.
- CLI: plain Node argv dispatch, no framework.
- Requires Node >= 20 and a working `claude` CLI login.

## Run it

```bash
pnpm install
pnpm dev                 # daemon (:3738) + web (:3737), both in watch mode
```

Or through the CLI, which also opens the browser and refuses to double-start:

```bash
node packages/cli/bin.js start        # or `pnpm reef start`
node packages/cli/bin.js status
node packages/cli/bin.js shutdown
```

CLI commands (`reef help`):

```
reef start [--force]    start the daemon + web (or just open the UI if already up)
reef shutdown           stop the running daemon gracefully
reef status             daemon health + list of runs
reef stop <id>          stop a running agent
reef next               start the highest-priority queued task

reef brief [<repo>]     preview the learnings that would prime an agent run
reef dig <topic>        show learnings on a topic (bedrock -> loam -> topsoil)
                        flags: --repo <path>
reef show <id>          show one learning in full
reef petrify <id>       promote a learning to bedrock
reef fossilize <id>     mark a learning as outdated

reef usage              token / cost summary; --window day|week|month|all
```

Other scripts:

```bash
pnpm typecheck
pnpm lint
pnpm test                # daemon unit tests (Vitest)
pnpm build               # next build for the web package
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `REEF_HOME` | `~/.reef` | Where `state.db`, `daemon.pid`, and `runs/*.log` live |
| `REEF_DAEMON_PORT` | `3738` | Daemon HTTP port |
| `NEXT_PUBLIC_DAEMON_URL` | `http://127.0.0.1:3738` | Daemon URL the web app talks to |
| `REEF_EXTRACT_LEARNINGS` | unset (off) | `true`/`1` enables post-run learning extraction |

## Layout

- `packages/shared` — zod schemas and TypeScript types for runs, tasks, learnings, usage; default ports.
- `packages/daemon` — HTTP router, SQLite schema and state modules, agent registry, git snapshot/diff, learning extraction, pidfile lifecycle.
- `packages/agent-runtime` — `Runner` interface and the Claude Agent SDK implementation.
- `packages/cli` — `reef` entrypoint and one file per command.
- `packages/web` — Next.js UI: `/` runs + usage, `/new`, `/agents/[id]` live stream, `/tasks`, `/reef` strata.
- `scripts/dev.ts` — runs daemon and web together for `pnpm dev`.
- `AGENTS.md` / `CLAUDE.md` — conventions for agents working on this repo.
- `project.yml` — manifest consumed by a separate local project dashboard; not needed to run Reef.

## License

MIT. See [LICENSE](./LICENSE).
