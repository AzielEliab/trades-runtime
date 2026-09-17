import { sha256 } from "../core/hash.js";
import { exampleActorRegistry, type ActorRegistry } from "../core/actor-registry.js";
import { type ShadowMode } from "../core/shadow-modes.js";
import {
  applyHumanOverride,
  liveWithoutOverride,
  type HumanOverride,
  type LiveDecision,
  type Recommendation
} from "../core/human-authority.js";
import type { ConfidenceSeparation } from "../core/confidence.js";
import type { EvidencePacket } from "../inherited/evidence-packet.js";
import {
  comparePaths,
  type CoherenceResult,
  type ReasoningPath
} from "../inherited/trades-coherence.js";
import { evaluateDecisionGate, type DecisionGateResult } from "../inherited/decision-gate.js";
import {
  appendReceipt,
  createLedger,
  verifyLedger,
  type LedgerReceipt,
  type ReceiptLedger
} from "../inherited/receipt-ledger.js";
import { sealCounterfactual, settleShadow, type ShadowSettlement } from "../inherited/shadow-engine.js";
import { DurableReceiptStore } from "./durable-receipts.js";

export interface ActionRequest {
  actionId: string;
  action: string;
  payload: Record<string, unknown>;
  packets: EvidencePacket[];
  primary: ReasoningPath;
  alternate: ReasoningPath;
  confidence: ConfidenceSeparation;
  highConsequence: boolean;
  defined: boolean;
  impactAssessed: boolean;
  integrityOk: boolean;
  accountableHuman?: string;
  knownInputs: Record<string, unknown>;
  expected: Record<string, unknown>;
  override?: HumanOverride;
  actual?: Record<string, unknown>;
  at: string;
  settledAt?: string;
  shadowMode?: ShadowMode;
  registry?: ActorRegistry;
  persist?: DurableReceiptStore;
}

export interface ActionResult {
  packets: EvidencePacket[];
  evidenceLockHash: string;
  primary: ReasoningPath;
  alternate: ReasoningPath;
  coherence: CoherenceResult;
  gate: DecisionGateResult | null;
  gateRequired: boolean;
  recommendation: Recommendation;
  live: LiveDecision;
  executed: boolean;
  receipts: LedgerReceipt[];
  ledger: ReceiptLedger;
  settlement: ShadowSettlement | null;
  disagreementPreserved: boolean;
}

export function lockEvidence(packets: EvidencePacket[]): string {
  return sha256(
    packets
      .map((packet) => ({ sourceId: packet.sourceId, contentHash: packet.contentHash }))
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
  );
}

function persist(
  ledger: ReceiptLedger,
  store: DurableReceiptStore | undefined,
  input: Omit<LedgerReceipt, "prevHash" | "hash">
): { ledger: ReceiptLedger; receipt: LedgerReceipt } {
  if (store) {
    const receipt = store.append(input);
    return { ledger: store.load(), receipt };
  }
  const next = appendReceipt(ledger, input);
  const receipt = next.receipts.at(-1);
  if (!receipt) throw new Error("runAction: receipt append failed");
  return { ledger: next, receipt };
}

/**
 * Single action runner:
 * packet → lock → primary → alternate → coherence → gate → receipt → human override → shadow settle
 *
 * High-consequence path must hit DecisionGate. Human override still wins; disagreement is preserved.
 */
export function runAction(request: ActionRequest): ActionResult {
  const packets = request.packets;
  const evidenceLockHash = lockEvidence(packets);
  const primary = request.primary;
  const alternate = request.alternate;
  const coherence = comparePaths(primary, alternate, packets);

  const gateRequired = request.highConsequence;
  const gate = evaluateDecisionGate({
    action: request.action,
    highConsequence: request.highConsequence,
    defined: request.defined,
    confidence: request.confidence,
    impactAssessed: request.impactAssessed,
    integrityOk: request.integrityOk,
    accountableHuman: request.accountableHuman
  });

  if (gateRequired && !gate) {
    throw new Error("high-consequence path must hit DecisionGate");
  }

  const recommendation: Recommendation = {
    recommendationId: request.actionId,
    action: request.action,
    payload: request.payload,
    confidence: request.confidence,
    issuedAt: request.at
  };

  let ledger = request.persist?.load() ?? createLedger();
  const receipts: LedgerReceipt[] = [];

  const evidenceFreeze = persist(ledger, request.persist, {
    receiptId: `${request.actionId}:evidence`,
    kind: "evidence",
    at: request.at,
    body: {
      evidenceLockHash,
      packetIds: packets.map((p) => p.sourceId),
      packetHashes: packets.map((p) => p.contentHash)
    }
  });
  ledger = evidenceFreeze.ledger;
  receipts.push(evidenceFreeze.receipt);

  const recFreeze = persist(ledger, request.persist, {
    receiptId: `${request.actionId}:recommendation`,
    kind: "recommendation",
    at: request.at,
    body: {
      action: request.action,
      payload: request.payload,
      primary: primary.id,
      alternate: alternate.id,
      coherence: coherence.verdict,
      gate: gate.outcome,
      highConsequence: request.highConsequence,
      evidenceLockHash
    },
    confidence: request.confidence
  });
  ledger = recFreeze.ledger;
  receipts.push(recFreeze.receipt);

  const blocked = request.highConsequence && gate.outcome === "BLOCK" && !request.override;
  let live: LiveDecision;
  if (request.override) {
    live = applyHumanOverride(
      recommendation,
      request.override,
      request.registry ?? exampleActorRegistry()
    );
    const ov = persist(ledger, request.persist, {
      receiptId: `${request.actionId}:override`,
      kind: "override",
      at: request.override.at,
      body: {
        actorId: request.override.actorId,
        role: request.override.role,
        branchId: request.override.branchId,
        lockHolderId: request.override.lockHolderId,
        reason: request.override.reason,
        originalAction: recommendation.action,
        replacementAction: request.override.replacementAction,
        replacementPayload: request.override.replacementPayload,
        gate: gate.outcome,
        coherence: coherence.verdict
      }
    });
    ledger = ov.ledger;
    receipts.push(ov.receipt);
  } else {
    live = liveWithoutOverride(recommendation);
  }

  const sealed = sealCounterfactual({
    knownInputs: { ...request.knownInputs, evidenceLockHash },
    action: live.liveAction,
    expected: request.expected,
    confidence: request.confidence,
    sealedAt: request.at
  });

  let settlement: ShadowSettlement | null = null;
  if (request.actual) {
    settlement = settleShadow(sealed, request.actual, undefined, {
      settledAt: request.settledAt ?? request.at,
      mode: request.shadowMode ?? "SHADOW-SEALED",
      override: request.override ?? null
    });
    const out = persist(ledger, request.persist, {
      receiptId: `${request.actionId}:outcome`,
      kind: "outcome",
      at: request.settledAt ?? request.at,
      body: {
        plannedAction: settlement.plannedAction,
        contemporaneousEvidenceHash: settlement.contemporaneousEvidenceHash,
        prediction_confidence: settlement.prediction_confidence,
        evidence_strength: settlement.evidence_strength,
        source_quality: settlement.source_quality,
        cross_source_agreement: settlement.cross_source_agreement,
        verification_status: settlement.verification_status,
        humanOverride: settlement.humanOverride,
        actualOutcome: settlement.actualOutcome,
        timeToSettleMs: settlement.timeToSettleMs,
        sealedRecommendationHash: settlement.sealedRecommendationHash,
        deltas: settlement.deltas,
        hindsightLeak: settlement.hindsightLeak,
        evidenceLockHash
      }
    });
    ledger = out.ledger;
    receipts.push(out.receipt);
  } else {
    const cf = persist(ledger, request.persist, {
      receiptId: `${request.actionId}:counterfactual`,
      kind: "counterfactual",
      at: request.at,
      body: {
        sealedAt: sealed.sealedAt,
        evidenceLockHash: sealed.evidenceLockHash,
        action: sealed.action,
        expected: sealed.expected
      }
    });
    ledger = cf.ledger;
    receipts.push(cf.receipt);
  }

  if (!verifyLedger(ledger)) {
    throw new Error("runAction: ledger hash-chain broken");
  }

  return {
    packets,
    evidenceLockHash,
    primary,
    alternate,
    coherence,
    gate,
    gateRequired,
    recommendation,
    live,
    executed: !blocked,
    receipts,
    ledger,
    settlement,
    disagreementPreserved: live.disagreementPreserved
  };
}
