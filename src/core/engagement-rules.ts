import { dropVisibleToSealed, type ShadowMode } from "./shadow-modes.js";

/** Written rule for SHADOW-VISIBLE. Display only. Not a ticket or order. */
export const NOT_AN_ORDER_NOTICE =
  "This is not an order. SHADOW-VISIBLE is display-only. Do not treat a recommendation as a ticket, booking, or dispatch write.";

export const ENGAGEMENT_VIOLATIONS = [
  "treated-as-order",
  "treated-as-ticket",
  "complaint-as-order",
  "booking-write-attempted",
  "dispatch-write-attempted"
] as const;

export type EngagementViolation = (typeof ENGAGEMENT_VIOLATIONS)[number];

export interface EngagementSignal {
  treatedAsOrder?: boolean;
  treatedAsTicket?: boolean;
  complaintAsOrder?: boolean;
  bookingWriteAttempted?: boolean;
  dispatchWriteAttempted?: boolean;
  violation?: EngagementViolation;
}

export interface EngagementDecision {
  mode: ShadowMode;
  droppedToSealed: boolean;
  notice: typeof NOT_AN_ORDER_NOTICE;
  reason?: EngagementViolation | "engagement-violation";
}

export function engagementNotice(): typeof NOT_AN_ORDER_NOTICE {
  return NOT_AN_ORDER_NOTICE;
}

export function classifyEngagementViolation(signal: EngagementSignal): EngagementViolation | undefined {
  if (signal.violation && (ENGAGEMENT_VIOLATIONS as readonly string[]).includes(signal.violation)) {
    return signal.violation;
  }
  if (signal.treatedAsOrder) return "treated-as-order";
  if (signal.treatedAsTicket) return "treated-as-ticket";
  if (signal.complaintAsOrder) return "complaint-as-order";
  if (signal.bookingWriteAttempted) return "booking-write-attempted";
  if (signal.dispatchWriteAttempted) return "dispatch-write-attempted";
  return undefined;
}

export function isEngagementViolation(signal: EngagementSignal): boolean {
  return classifyEngagementViolation(signal) !== undefined;
}

/**
 * SHADOW-VISIBLE drops to SHADOW-SEALED when treated as a ticket/order.
 * Never promotes. Never writes.
 */
export function applyEngagement(mode: ShadowMode, signal: EngagementSignal = {}): EngagementDecision {
  const violation = classifyEngagementViolation(signal);
  if (mode === "SHADOW-VISIBLE" && violation) {
    return {
      mode: dropVisibleToSealed(mode),
      droppedToSealed: true,
      notice: NOT_AN_ORDER_NOTICE,
      reason: violation
    };
  }
  return {
    mode,
    droppedToSealed: false,
    notice: NOT_AN_ORDER_NOTICE
  };
}
