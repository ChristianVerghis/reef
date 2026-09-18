
## 2026-09-18 — resumed: first test suite, dig is read-only

- Added Vitest (workspace root) and `packages/daemon/test/learnings.test.ts`: 13 tests covering topsoil→loam promotion thresholds and the human-only moves, priming order (bedrock > loam > topsoil, confidence, recency), fossil/other-repo exclusion, count and byte caps (documents that the byte cap breaks rather than skips), provenance rows and reference bumps, dig, and the preamble. `initDb(":memory:")` + new `closeDb()` give each test a fresh database.
- `digByTopic` no longer bumps `references_count`. Retrieval is not use; only `recordPrimings` feeds promotion, which is what the README always claimed.
- Next: 60-second demo GIF for the portfolio page; priming experiment (same task, three repos, with/without priming; tokens, cost, completion); tool-use events in the UI.
