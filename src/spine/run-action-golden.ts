import { exampleActorRegistry } from "../core/actor-registry.js";
import { admitInboundOrThrow } from "./fraggate-inbound.js";
import { runAction, type ActionRequest, type ActionResult } from "./run-action.js";

const verified = {
  predictionConfidence: 0.82,
  evidenceStrength: "HIGH" as const,
  sourceQuality: "HIGH" as const,
  agreement: "HIGH" as const,
  verificationStatus: "VERIFIED" as const
};

/** Deterministic L1 fixture — no clock, no I/O. */
export function goldenActionRequest(): ActionRequest {
  const admitted = admitInboundOrThrow({
    sourceKind: "servicetitan",
    sourceId: "st:job:golden-1",
    receivedAt: "2026-09-17T12:00:00Z",
    body: { issue: "no-cool", fixture: "l1-golden" }
  });
  return {
    actionId: "golden-1",
    action: "dispatch",
    payload: { vanId: "214" },
    packets: [admitted.packet],
    primary: {
      id: "primary",
      claim: "dispatch-van-214",
      action: "dispatch",
      confidence: verified,
      evidenceIds: [admitted.packet.sourceId]
    },
    alternate: {
      id: "alternate",
      claim: "dispatch-van-214",
      action: "dispatch",
      confidence: verified,
      evidenceIds: [admitted.packet.sourceId]
    },
    confidence: verified,
    highConsequence: true,
    defined: true,
    impactAssessed: true,
    integrityOk: true,
    accountableHuman: "mgr-1",
    knownInputs: { call: "golden-1" },
    expected: { vanId: "214" },
    override: {
      actorId: "mgr-1",
      role: "manager",
      branchId: "branch:midwest-3",
      lockHolderId: "mgr-1",
      reason: "customer requested 088",
      replacementAction: "dispatch",
      replacementPayload: { vanId: "088" },
      at: "2026-09-17T12:06:00Z"
    },
    actual: { vanId: "088" },
    at: "2026-09-17T12:05:00Z",
    settledAt: "2026-09-17T18:00:00Z",
    shadowMode: "SHADOW-SEALED",
    registry: exampleActorRegistry()
  };
}

export function runGoldenAction(): ActionResult {
  return runAction(goldenActionRequest());
}

export function goldenReceiptFingerprint(result: ActionResult): {
  evidenceLockHash: string;
  recommendationHash: string;
  overrideHash: string;
  outcomeHash: string;
  tip: string;
} {
  const byKind = Object.fromEntries(result.receipts.map((receipt) => [receipt.kind, receipt.hash]));
  return {
    evidenceLockHash: result.evidenceLockHash,
    recommendationHash: byKind.recommendation ?? "",
    overrideHash: byKind.override ?? "",
    outcomeHash: byKind.outcome ?? "",
    tip: result.ledger.receipts.at(-1)?.hash ?? ""
  };
}
