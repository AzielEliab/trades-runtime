import { entityId } from "../core/ids.js";
import { applyHumanOverride } from "../core/human-authority.js";
import { wrapEvidence } from "../inherited/evidence-packet.js";
import { comparePaths } from "../inherited/trades-coherence.js";
import { appendReceipt, createLedger, verifyLedger } from "../inherited/receipt-ledger.js";
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

export function runShadowDayDemo() {
  const branch = entityId("branch", "midwest-3");
  const call = entityId("call", "no-cool-1042");
  const vanA = entityId("van", "214");
  const vanB = entityId("van", "088");

  const evidence = wrapEvidence({
    sourceId: "st:job:1042",
    sourceType: "servicetitan",
    receivedAt: "2026-07-14T12:00:00Z",
    trust: "HIGH",
    tags: ["booking"],
    claims: ["no-cool"],
    body: { call, issue: "no-cool" }
  });

  const ranked = rankVans([
    { vanId: vanA, qualifiedForPrimary: true, factors: { ...even, geolocation: 0.4, technicalFit: 0.95 } },
    { vanId: vanB, qualifiedForPrimary: true, factors: { ...even, geolocation: 0.9, technicalFit: 0.7 } }
  ]);

  const recommendation = {
    recommendationId: "rec-1042",
    action: "dispatch",
    payload: { vanId: ranked[0]?.vanId, call },
    confidence: {
      predictionConfidence: 0.72,
      evidenceStrength: "MEDIUM" as const,
      sourceQuality: "HIGH" as const,
      agreement: "MEDIUM" as const,
      verificationStatus: "PARTIAL" as const
    },
    issuedAt: "2026-07-14T12:05:00Z"
  };

  const coherence = comparePaths(
    {
      id: "primary",
      claim: "dispatch-van-214",
      action: "dispatch",
      confidence: recommendation.confidence,
      evidenceIds: [evidence.sourceId]
    },
    {
      id: "alternate",
      claim: "dispatch-van-214",
      action: "dispatch",
      confidence: recommendation.confidence,
      evidenceIds: [evidence.sourceId]
    },
    [evidence]
  );

  const sealed = sealCounterfactual({
    knownInputs: { call, ranked: ranked.map((v) => v.vanId) },
    action: recommendation.action,
    expected: { vanId: ranked[0]?.vanId, firstTrip: true },
    confidence: recommendation.confidence,
    sealedAt: recommendation.issuedAt
  });

  const live = applyHumanOverride(recommendation, {
    actorId: "dispatcher-lee",
    role: "dispatch",
    authorized: true,
    reason: "customer requested prior tech",
    replacementAction: "dispatch",
    replacementPayload: { vanId: vanB, call },
    at: "2026-07-14T12:08:00Z"
  });

  let ledger = createLedger();
  ledger = appendReceipt(ledger, {
    receiptId: "r1",
    kind: "recommendation",
    at: recommendation.issuedAt,
    body: { recommendation, coherence },
    confidence: recommendation.confidence
  });
  ledger = appendReceipt(ledger, {
    receiptId: "r2",
    kind: "override",
    at: live.override?.at ?? "",
    body: { live }
  });

  let traj = openMorningPlan("2026-07-14", { vans: [vanA, vanB], branch }, "2026-07-14T07:00:00Z");
  traj = rebaseFromActual(traj, { vans: [vanA, vanB], lastEvent: "override" }, "2026-07-14T12:08:00Z");
  traj = closeDay(traj, "2026-07-14T18:00:00Z");

  const settlement = settleShadow(sealed, { vanId: vanB, firstTrip: false });

  ledger = appendReceipt(ledger, {
    receiptId: "r3",
    kind: "counterfactual",
    at: "2026-07-14T18:05:00Z",
    body: { settlement }
  });

  return {
    branch,
    ranked: ranked.map((v) => ({ vanId: v.vanId, finalScore: Number(v.finalScore.toFixed(3)) })),
    coherence: coherence.verdict,
    liveWinner: live.winner,
    disagreementPreserved: live.disagreementPreserved,
    ledgerValid: verifyLedger(ledger),
    receiptCount: ledger.receipts.length,
    trajectoryRecords: traj.chain.records.length,
    settlementDeltas: settlement.deltas
  };
}
