import type { RunEvent } from "@roost/shared";
import { db } from "./db.js";

interface EventRow {
  id: number;
  type: string;
  payload_json: string;
  ts: number;
}

/**
 * Persist an event and return the assigned row id. Caller tags the in-memory
 * event with this id so SSE replay can dedupe against the bus.
 */
export function persistEvent(event: RunEvent): number {
  const payload = JSON.stringify(stripIdentity(event));
  const result = db()
    .prepare(
      `INSERT INTO run_events (run_id, type, payload_json, ts) VALUES (?, ?, ?, ?)`,
    )
    .run(event.runId, event.type, payload, event.ts);
  return result.lastInsertRowid as number;
}

/**
 * Replay all persisted events for a run, in insertion order, optionally
 * starting after a given event id (for client resume).
 */
export function replayEvents(runId: string, sinceId = 0): Array<{ id: number; event: RunEvent }> {
  const rows = db()
    .prepare<[string, number], EventRow>(
      `SELECT id, type, payload_json, ts
       FROM run_events
       WHERE run_id = ? AND id > ?
       ORDER BY id ASC`,
    )
    .all(runId, sinceId);

  return rows.map((row) => ({
    id: row.id,
    event: rehydrate(runId, row),
  }));
}

export function maxEventId(runId: string): number {
  const row = db()
    .prepare<[string], { max: number | null }>(
      `SELECT MAX(id) AS max FROM run_events WHERE run_id = ?`,
    )
    .get(runId);
  return row?.max ?? 0;
}

function stripIdentity(event: RunEvent): unknown {
  // runId and ts are stored in dedicated columns; payload just holds the variant.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { runId, ts, ...rest } = event;
  return rest;
}

function rehydrate(runId: string, row: EventRow): RunEvent {
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  return { ...payload, runId, ts: row.ts } as RunEvent;
}
