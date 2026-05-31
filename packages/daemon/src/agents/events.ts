import { EventEmitter } from "node:events";
import type { RunEvent } from "@roost/shared";

const bus = new EventEmitter();
bus.setMaxListeners(0);

// Replay buffer per run so late subscribers see history (capped).
const REPLAY_CAP = 2000;
const replay = new Map<string, RunEvent[]>();

export function emit(event: RunEvent): void {
  const buf = replay.get(event.runId) ?? [];
  buf.push(event);
  if (buf.length > REPLAY_CAP) buf.splice(0, buf.length - REPLAY_CAP);
  replay.set(event.runId, buf);
  bus.emit(event.runId, event);
}

export function subscribe(runId: string, listener: (e: RunEvent) => void): () => void {
  // Replay first
  for (const e of replay.get(runId) ?? []) listener(e);
  bus.on(runId, listener);
  return () => bus.off(runId, listener);
}
