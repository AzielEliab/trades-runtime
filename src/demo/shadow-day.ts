import { entityId } from "../core/ids.js";
import { exampleActorRegistry } from "../core/actor-registry.js";
import { applyHumanOverride } from "../core/human-authority.js";
import { describeShadowMode, type ShadowMode } from "../core/shadow-modes.js";
import { wrapEvidence } from "../inherited/evidence-packet.js";
import { comparePaths } from "../inherited/trades-coherence.js";
import { appendReceipt, createLedger, verifyLedger, tipHash } from "../inherited/receipt-ledger.js";
import { sealCounterfactual, settleShadow } from "../inherited/shadow-engine.js";
import { closeDay, openMorningPlan, rebaseFromActual } from "../inherited/trajectory-engine.js";
import { rankVans } from "../domain/call-fit.js";
import type { CallFitFactors } from "../domain/call-fit.js";

const even: CallFitFactors = {
  quality: 0.8,
  competence: 0.8,
  technicalFit: 0.9,
  clientFit: 0.7,
  geolocation: 0.4,
  inventory: 0.8,
  runtime: 0.7,
  contribution: 0.6,
  margin: 0.6,
  scheduleImpact: 0.7,
  exploration: 0.2
};

export type ShadowDayKind = "hvac" | "plumbing-overflow";

export interface ShadowDayRecording {
  kind: ShadowDayKind;
  mode: ShadowMode;
  branch: string;
  scoresTechnicians: false;
  planned: Record<string, unknown>;
  actual: Record<string, unknown>;
  counterfactual: Record<string, unknown>;
  reconstructable: {
    planned: Record<string, unknown>;
    actual: Record<string, unknown>;
    counterfactual: Record<string, unknown>;
  };
  settlement: {
    plannedAction: string;
    contemporaneousEvidenceHash: string;
    prediction_confidence: number;
    evidence_strength: string;
    source_quality: string;
    cross_source_agreement: string;
    verification_status: string;
    timeToSettleMs: number;
    sealedRecommendationHash: string;
    hindsightLeak: false;
  };
  liveWinner: "human" | "trades";
  disagreementPreserved: boolean;
  ledgerValid: boolean;
  ledgerTip: string;
  receiptCount: number;
  trajectoryRecords: number;
  viewers: string;
}

function daySpec(kind: ShadowDayKind) {
  if (kind === "plumbing-overflow") {
    return {
      day: "2026-07-15",
      callLocal: "backup-2201",
      issue: "main-line-backup",
      mode: "SHADOW-VISIBLE" as const,
      vanPreferred: "088"
    };
  }
  return {
    day: "2026-07-14",
    callLocal: "no-cool-1042",
    issue: "no-cool",
    mode: "SHADOW-SEALED" as const,
    vanPreferred: "214"
  };
}

export function runShadowDayDemo(kind: ShadowDayKind = "hvac"): ShadowDayRecording {
  const spec = daySpec(kind);
  const registry = exampleActorRegistry();
  const branch = entityId("branch", "midwest-3");
  const call = entityId("call", spec.callLocal);
  const vanA = entityId("van", "214");
  const vanB = entityId("van", "088");
  const modeState = describeShadowMode(spec.mode, branch);

  const evidence = wrapEvidence({
    sourceId: `st:job:${spec.callLocal}`,
    sourceType: "servicetitan",
    receivedAt: `${spec.day}T12:00:00Z`,
    trust: "HIGH",
    tags: ["booking", spec.issue],
    claims: [spec.issue],
    body: { call, issue: spec.issue, kind }
  });

  const ranked = rankVans([
    { vanId: vanA, qualifiedForPrimary: true, factors: { ...even, geolocation: 0.4, technicalFit: 0.95 } },
    { vanId: vanB, qualifiedForPrimary: true, factors: { ...even, geolocation: 0.9, technicalFit: 0.7 } }
  ]);

  const plannedVan = ranked[0]?.vanId ?? vanA;
  const recommendation = {
    recommendationId: `rec:${spec.callLocal}`,
    action: "dispatch",
    payload: { vanId: plannedVan, call },
    confidence: {
      predictionConfidence: 0.72,
      evidenceStrength: "MEDIUM" as const,
      sourceQuality: "HIGH" as const,
      agreement: "MEDIUM" as const,
      verificationStatus: "PARTIAL" as const
    },
    issuedAt: `${spec.day}T12:05:00Z`
  };

  const coherence = comparePaths(
    {
      id: "primary",
      claim: `dispatch-${plannedVan}`,
      action: "dispatch",
      confidence: recommendation.confidence,
      evidenceIds: [evidence.sourceId]
    },
    {
      id: "alternate",
      claim: `dispatch-${plannedVan}`,
      action: "dispatch",
      confidence: recommendation.confidence,
      evidenceIds: [evidence.sourceId]
    },
    [evidence]
  );

  const sealed = sealCounterfactual({
    knownInputs: { call, issue: spec.issue, evidenceHash: evidence.contentHash },
    action: recommendation.action,
    expected: { vanId: plannedVan, firstTrip: true },
    confidence: recommendation.confidence,
    sealedAt: recommendation.issuedAt
  });

  const live = applyHumanOverride(
    recommendation,
    {
      actorId: "dispatcher-lee",
      role: "dispatcher",
      branchId: branch,
      lockHolderId: "dispatcher-lee",
      reason: kind === "plumbing-overflow" ? "overflow board: keep 088 on laterals" : "customer requested prior tech",
      replacementAction: "dispatch",
      replacementPayload: { vanId: vanB, call },
      at: `${spec.day}T12:08:00Z`
    },
    registry
  );

  let ledger = createLedger();
  ledger = appendReceipt(ledger, {
    receiptId: `${kind}:r1`,
    kind: "recommendation",
    at: recommendation.issuedAt,
    body: { recommendation, coherence },
    confidence: recommendation.confidence
  });
  ledger = appendReceipt(ledger, {
    receiptId: `${kind}:r2`,
    kind: "override",
    at: live.override?.at ?? "",
    body: { live, lockHolderId: "dispatcher-lee", branchId: branch }
  });

  let traj = openMorningPlan(spec.day, { vans: [vanA, vanB], branch }, `${spec.day}T07:00:00Z`);
  traj = rebaseFromActual(traj, { vans: [vanA, vanB], lastEvent: "override" }, `${spec.day}T12:08:00Z`);
  traj = closeDay(traj, `${spec.day}T18:00:00Z`);

  const actual = { vanId: vanB, firstTrip: false };
  const settlement = settleShadow(sealed, actual, undefined, {
    settledAt: `${spec.day}T18:05:00Z`,
    mode: spec.mode,
    override: live.override ?? null
  });

  ledger = appendReceipt(ledger, {
    receiptId: `${kind}:r3`,
    kind: "outcome",
    at: `${spec.day}T18:05:00Z`,
    body: {
      plannedAction: settlement.plannedAction,
      contemporaneousEvidenceHash: settlement.contemporaneousEvidenceHash,
      prediction_confidence: settlement.prediction_confidence,
      evidence_strength: settlement.evidence_strength,
      source_quality: settlement.source_quality,
      cross_source_agreement: settlement.cross_source_agreement,
      verification_status: settlement.verification_status,
      actualOutcome: settlement.actualOutcome,
      timeToSettleMs: settlement.timeToSettleMs,
      sealedRecommendationHash: settlement.sealedRecommendationHash,
      hindsightLeak: settlement.hindsightLeak
    }
  });

  const planned = {
    action: recommendation.action,
    payload: recommendation.payload,
    morning: { vans: [vanA, vanB], branch }
  };
  const counterfactual = {
    action: sealed.action,
    expected: sealed.expected,
    evidenceLockHash: sealed.evidenceLockHash
  };

  return {
    kind,
    mode: spec.mode,
    branch,
    scoresTechnicians: false,
    planned,
    actual,
    counterfactual,
    reconstructable: { planned, actual, counterfactual },
    settlement: {
      plannedAction: settlement.plannedAction,
      contemporaneousEvidenceHash: settlement.contemporaneousEvidenceHash,
      prediction_confidence: settlement.prediction_confidence,
      evidence_strength: settlement.evidence_strength,
      source_quality: settlement.source_quality,
      cross_source_agreement: settlement.cross_source_agreement,
      verification_status: settlement.verification_status,
      timeToSettleMs: settlement.timeToSettleMs,
      sealedRecommendationHash: settlement.sealedRecommendationHash,
      hindsightLeak: false
    },
    liveWinner: live.winner,
    disagreementPreserved: live.disagreementPreserved,
    ledgerValid: verifyLedger(ledger),
    ledgerTip: tipHash(ledger),
    receiptCount: ledger.receipts.length,
    trajectoryRecords: traj.chain.records.length,
    viewers: modeState.viewers
  };
}

export function runRecordedShadowDays(): { hvac: ShadowDayRecording; plumbingOverflow: ShadowDayRecording } {
  return {
    hvac: runShadowDayDemo("hvac"),
    plumbingOverflow: runShadowDayDemo("plumbing-overflow")
  };
}
