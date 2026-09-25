import type { EngagementDecision } from "../core/engagement-rules.js";
import type { LedgerReceipt } from "../inherited/receipt-ledger.js";
import type { DurableReceiptStore } from "./durable-receipts.js";

export interface EngagementDropReceiptBody {
  event: "engagement-drop";
  branchId: string;
  from: "SHADOW-VISIBLE";
  mode: "SHADOW-SEALED";
  droppedToSealed: true;
  reason: string;
  notice: string;
  pilot_started: false;
  field_launch: false;
  writes: false;
  live_backends: false;
  auto_promote: false;
  claim: "Engagement drop recorded. Pilot not started.";
}

/**
 * Persist a SHADOW-VISIBLE → SHADOW-SEALED engagement drop on the isolate ledger.
 * Refuses to record a promotion, a non-drop, or a started pilot.
 */
export function recordEngagementDrop(options: {
  store: DurableReceiptStore;
  branchId: string;
  decision: EngagementDecision;
  at: string;
  receiptId: string;
}): LedgerReceipt {
  const branchId = options.branchId.trim();
  if (!branchId) {
    throw new Error("engagement receipt requires a named branchId");
  }
  if (!options.decision.droppedToSealed || options.decision.mode !== "SHADOW-SEALED") {
    throw new Error("engagement receipt records a drop to SHADOW-SEALED only");
  }
  const reason = options.decision.reason ?? "engagement-violation";
  const body: EngagementDropReceiptBody = {
    event: "engagement-drop",
    branchId,
    from: "SHADOW-VISIBLE",
    mode: "SHADOW-SEALED",
    droppedToSealed: true,
    reason,
    notice: options.decision.notice,
    pilot_started: false,
    field_launch: false,
    writes: false,
    live_backends: false,
    auto_promote: false,
    claim: "Engagement drop recorded. Pilot not started."
  };
  return options.store.appendKind("lifecycle", options.receiptId, options.at, { ...body });
}
