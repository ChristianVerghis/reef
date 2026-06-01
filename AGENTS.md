# Reef — agent notes

## This is NOT the Next.js you know

`packages/web` runs Next.js 16.2.6. Breaking changes from prior versions affect APIs, conventions, and file structure. **Before writing any code that touches `packages/web`**, read the relevant guide in `node_modules/next/dist/docs/`. Heed deprecation notices.

## Architecture

- **Daemon is the source of truth.** All state lives in SQLite (`~/.reef/state.db`). Never have the web app or CLI touch the DB or spawn subprocesses directly — go through the daemon's HTTP API.
- **Three processes, one binary.** `reef start` (CLI) forks the daemon and the web dev/prod server. Daemon owns state + agent subprocesses; web is a thin view.
- **macOS + Linux only** in v1 (unix-socket IPC for CLI ↔ daemon).

## Status colors (semantic)

- emerald = running / success
- amber = needs-attention
- rose = failed
- sky = paused
- violet = handed-off
- zinc-500 = queued / idle

## Stack discipline

- Tailwind 4 via `@tailwindcss/postcss`. Theme tokens in `app/globals.css` under `@theme inline`.
- Geist Sans + Geist Mono via `next/font/google`.
- shadcn/ui with `zinc` base color (added in M2).
- Recharts 3.8.1 for metrics (M4).
- No state management library; React state + SWR-style fetching from daemon API.

## What lives where

- `packages/cli` — clipanion CLI entrypoint (`reef`).
- `packages/daemon` — long-lived Node HTTP server, agent runner, SQLite state.
- `packages/web` — Next.js App Router UI.
- `packages/shared` — types, zod schemas, IPC protocol shared by all three.
- `packages/agent-runtime` — `Runner` interface + Claude Agent SDK impl.

## Conventions

- Imperative file names: `start.ts`, not `starter.ts`.
- No default exports except for Next route components.
- Errors propagate; the daemon's top-level handler logs + responds 5xx.
- All run output is also written to `~/.reef/runs/<id>.log` for replay.

## Billing-aware defaults

- Every `claude` subprocess Reef spawns uses the user's Claude Code plan allowance.
  There is no separate billing relationship — Reef just shells out to whichever
  account `claude login` is authenticated against.
- **Auto-extraction of learnings is OFF by default.** It fires an extra
  `claude -p` call per successful run. Opt in with `REEF_EXTRACT_LEARNINGS=true`
  in the daemon's environment. Future: workspace-level UI toggle.
- The only AI calls Reef makes today: (1) the agent runs you trigger explicitly,
  (2) auto-extraction *when enabled*. Nothing else hits a cloud model.
