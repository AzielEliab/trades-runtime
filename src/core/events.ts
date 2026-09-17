import { sha256 } from "./hash.js";

export type EventProcessState = "received" | "normalized" | "applied" | "rejected" | "duplicate";

export interface CanonicalEvent {
  eventId: string;
  source: string;
  sourceSequence?: string;
  occurredAt: string;
  receivedAt: string;
  kind: string;
  payload: Record<string, unknown>;
  processState: EventProcessState;
  payloadHash: string;
}

export function makeEvent(input: Omit<CanonicalEvent, "payloadHash" | "processState"> & { processState?: EventProcessState }): CanonicalEvent {
  if (!input.eventId.trim()) {
    throw new Error("eventId is required");
  }
  return {
    ...input,
    processState: input.processState ?? "received",
    payloadHash: sha256(input.payload)
  };
}

export function isDuplicate(existing: CanonicalEvent, incoming: CanonicalEvent): boolean {
  return existing.eventId === incoming.eventId || (
    existing.source === incoming.source &&
    existing.sourceSequence != null &&
    existing.sourceSequence === incoming.sourceSequence
  );
}
