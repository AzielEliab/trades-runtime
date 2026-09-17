import { entityId } from "../core/ids.js";
import { makeEvent, type CanonicalEvent } from "../core/events.js";
import {
  FULFILLMENT_STEPS,
  type FulfillmentStep,
  type StockRequest
} from "./truck-stock.js";

export { FULFILLMENT_STEPS, type FulfillmentStep };

export interface FulfillmentStream {
  events: CanonicalEvent[];
}

export function emptyFulfillmentStream(): FulfillmentStream {
  return { events: [] };
}

export function nextFulfillmentStep(step: FulfillmentStep): FulfillmentStep | null {
  const i = FULFILLMENT_STEPS.indexOf(step);
  if (i < 0 || i === FULFILLMENT_STEPS.length - 1) return null;
  return FULFILLMENT_STEPS[i + 1]!;
}

export function emitFulfillmentEvent(
  request: StockRequest,
  from: FulfillmentStep,
  to: FulfillmentStep,
  at: string
): CanonicalEvent {
  return makeEvent({
    eventId: entityId("event", `${request.requestId}:${to}:${at}`),
    source: "trades-runtime:fulfillment",
    occurredAt: at,
    receivedAt: at,
    kind: `fulfillment:${to}`,
    payload: {
      requestId: request.requestId,
      callId: request.callId,
      vanId: request.vanId,
      partNumber: request.partNumber,
      from,
      to,
      step: to
    }
  });
}

/** Advance one legal step and append to the canonical event stream. */
export function transitionFulfillment(
  request: StockRequest,
  stream: FulfillmentStream,
  at: string
): { request: StockRequest; stream: FulfillmentStream; event: CanonicalEvent } {
  const to = nextFulfillmentStep(request.step);
  if (!to) {
    throw new Error(`fulfillment already terminal at ${request.step}`);
  }
  const next = { ...request, step: to };
  const event = emitFulfillmentEvent(next, request.step, to, at);
  return { request: next, stream: { events: [...stream.events, event] }, event };
}

/** Run REQUESTED → … → target (inclusive) on the event stream. */
export function runFulfillmentTo(
  request: StockRequest,
  target: FulfillmentStep,
  stream: FulfillmentStream,
  at: string
): { request: StockRequest; stream: FulfillmentStream } {
  const targetIndex = FULFILLMENT_STEPS.indexOf(target);
  if (targetIndex < 0) throw new Error(`unknown fulfillment step: ${target}`);
  let current = request;
  let events = stream;
  while (FULFILLMENT_STEPS.indexOf(current.step) < targetIndex) {
    const stepped = transitionFulfillment(current, events, at);
    current = stepped.request;
    events = stepped.stream;
  }
  return { request: current, stream: events };
}

export function fulfillmentTrail(stream: FulfillmentStream): FulfillmentStep[] {
  return stream.events
    .map((event) => event.payload.to)
    .filter((step): step is FulfillmentStep =>
      typeof step === "string" && (FULFILLMENT_STEPS as readonly string[]).includes(step)
    );
}
