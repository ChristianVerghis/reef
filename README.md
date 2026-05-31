# Roost

Local-first AI cockpit for orchestrating coding agents across many git repos.

Runs as a long-lived daemon on your machine. Agents spawn as local subprocesses with full access to your repos, `gh` auth, SSH keys, and env. Nothing leaves the machine.

## Status

v0.0.0 — M1 (vertical slice).

## Dev

```bash
pnpm install
pnpm dev
```

Then open the URL the CLI prints.

## Architecture

See [AGENTS.md](./AGENTS.md).
