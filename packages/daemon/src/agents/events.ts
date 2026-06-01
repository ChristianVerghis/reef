import { EventEmitter } from "node:events";
import type { RunEvent } from "@reef/shared";
import { persistEvent, replayEvents, maxEventId } from "../state/events.js";

const bus = new EventEmitter();
bus.setMaxListeners(0);

interface IdentifiedEvent {
  id: number;
  event: RunEvent;
}

export function emit(event: RunEvent): void {
  const id = persistEvent(event);
  bus.emit(event.runId, { id, event } satisfies IdentifiedEvent);
}

/**
 * Replays persisted events for `runId`, then forwards new ones live. Returns
 * an unsubscribe function. Caller-visible listener receives just RunEvent —
 * the id is used internally to dedupe replay vs live during the attach window.
 */
export function subscribe(runId: string, listener: (event: RunEvent) => void): () => void {
  // Snapshot the max event id BEFORE attaching the live listener, so we know
  // exactly which events come from replay vs the live bus.
  const replayCutoff = maxEventId(runId);

  // Live listener: only forward events strictly after the cutoff. This guards
  // against the race where an event lands between the SELECT and the bus.on.
  const liveListener = (payload: IdentifiedEvent) => {
    if (payload.id <= replayCutoff) return;
    listener(payload.event);
  };
  bus.on(runId, liveListener);

  // Replay history.
  for (const { event } of replayEvents(runId)) {
    listener(event);
  }

  return () => bus.off(runId, liveListener);
}
