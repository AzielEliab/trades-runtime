import { applyHumanOverride, type HumanOverride, type Recommendation } from "../core/human-authority.js";
import { exampleActorRegistry, type ActorRegistry, type AuthorityAction } from "../core/actor-registry.js";
import { appendRecord, emptyChain, type OverrideRecord } from "../core/chains.js";
import { appendReceipt, createLedger, type ReceiptLedger } from "../inherited/receipt-ledger.js";
import { marketAdaptationWeight, type PatternEvidence } from "./regional-recalibration.js";

export type ManagerDecision = "ACCEPT" | "OVERRIDE" | "LOCK" | "RELEASE";

export interface PricebookInputs {
  repairFrequency: number;
  predictedDemand: number;
  alreadyOnAssignedVan: boolean;
  currentCost: number;
  lastCost: number;
  averageCost: number;
  expectedContribution: number;
  premiumMarginTarget: number;
  availabilityDays: number;
  leadTimeDays: number;
  freightCost: number;
  freightDelayDays: number;
  procurementBurden: number;
  laborHours: number;
  jobDifficulty: number;
  accessDifficulty: number;
  expectedRuntime: number;
  oemPart: string;
  approvedSubstitute?: string;
  vendorSku: string;
  compatibilityEvidence: boolean;
  historicalReturns: number;
  firstTripEffect: number;
  realizedMargin: number;
}

export interface PricebookRecommendation {
  recommendationId: string;
  sku: string;
  oemPart: string;
  proposedPrice: number;
  locked: boolean;
  lockHolder?: string;
  shadowBaseline?: true;
  source?: "servicetitan-shadow";
  /** Current / last / adapted cost. A signal, not a live price write. */
  costSignal?: AdaptedPartCost;
}

export interface AdaptedPartCost {
  currentCost: number;
  lastCost: number;
  averageCost: number;
  /** currentCost − lastCost. Positive means the part got more expensive. */
  costMove: number;
  /** 0–1 pull of current cost toward the broader average. */
  marketWeight: number;
  weakened: boolean;
  adaptedCost: number;
  subordinateToHuman: true;
  autoApplied: false;
  note: string;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Current cost is the observation. Last cost is the previous observation.
 * The broader average is a market prior and may pull current cost only as far as
 * regional evidence allows. Thin evidence barely moves it.
 */
export function adaptPartCost(
  inputs: Pick<PricebookInputs, "currentCost" | "lastCost" | "averageCost">,
  evidence?: PatternEvidence
): AdaptedPartCost {
  const currentCost = inputs.currentCost;
  const lastCost = inputs.lastCost;
  const averageCost = inputs.averageCost;
  const { weight, weakened } = marketAdaptationWeight(evidence);
  const adaptedCost = roundMoney(currentCost + (averageCost - currentCost) * weight);
  const note = weakened
    ? "Market adaptation weakened. Thin, stale, conflicted, or missing regional evidence keeps the signal near current cost. Last cost stays visible. This is not a locked price."
    : "Regional evidence supports a partial blend of current cost toward the broader average. Last cost stays visible. The live price remains a human decision.";
  return {
    currentCost,
    lastCost,
    averageCost,
    costMove: roundMoney(currentCost - lastCost),
    marketWeight: weight,
    weakened,
    adaptedCost,
    subordinateToHuman: true,
    autoApplied: false,
    note
  };
}

/** ServiceTitan pricebook is a shadow baseline. Recommendations stay subordinate to humans. */
export function recommendFromShadowBaseline(
  recommendationId: string,
  stBaselinePrice: number,
  inputs: PricebookInputs,
  evidence?: PatternEvidence
): PricebookRecommendation {
  if (!inputs.compatibilityEvidence) {
    throw new Error("pricebook recommendation requires OEM/SKU compatibility evidence");
  }
  const costSignal = adaptPartCost(inputs, evidence);
  let proposed = stBaselinePrice;
  if (inputs.alreadyOnAssignedVan) {
    proposed = stBaselinePrice;
  }
  if (inputs.realizedMargin + 0.02 < inputs.premiumMarginTarget && inputs.predictedDemand > 0) {
    const denominator = Math.max(1 - inputs.premiumMarginTarget, 0.05);
    proposed = Math.round((stBaselinePrice + costSignal.adaptedCost / denominator) / 2);
    if (costSignal.costMove !== 0) {
      const pressure = costSignal.weakened ? 0.25 : Math.min(1, costSignal.marketWeight);
      proposed = Math.round(proposed + costSignal.costMove * pressure);
    }
  }
  if (inputs.historicalReturns > 0.2) {
    proposed = stBaselinePrice;
  }
  return {
    recommendationId,
    sku: inputs.vendorSku,
    oemPart: inputs.oemPart,
    proposedPrice: proposed,
    locked: false,
    shadowBaseline: true,
    source: "servicetitan-shadow",
    costSignal
  };
}

/**
 * Attach a fresh cost signal to an unlocked shadow recommendation.
 * A lock still refuses. This does not write a vendor pricebook.
 */
export function applyMarketAdaptation(
  rec: PricebookRecommendation,
  inputs: Pick<PricebookInputs, "currentCost" | "lastCost" | "averageCost">,
  evidence?: PatternEvidence
): PricebookRecommendation {
  refuseLockedAutoRecalibrate(rec);
  const costSignal = adaptPartCost(inputs, evidence);
  const nudge = costSignal.weakened ? 0 : Math.round(costSignal.costMove * costSignal.marketWeight);
  return { ...rec, proposedPrice: rec.proposedPrice + nudge, costSignal };
}

/** A lock cannot be auto-superseded. Evidence may still be collected. */
export function applyShadowBaseline(
  rec: PricebookRecommendation,
  newSuggestedPrice: number
): PricebookRecommendation {
  refuseLockedAutoRecalibrate(rec);
  return { ...rec, proposedPrice: newSuggestedPrice };
}

export function refuseLockedAutoRecalibrate(rec: PricebookRecommendation): void {
  if (rec.locked) {
    throw new Error("locked pricebook recommendation cannot be auto-recalibrated");
  }
}

export function collectEvidenceWhileLocked(
  rec: PricebookRecommendation,
  evidenceNote: string
): { live: PricebookRecommendation; superseded: false; evidenceNote: string } {
  return { live: rec, superseded: false, evidenceNote };
}

export function applyManagerDecision(
  rec: PricebookRecommendation,
  decision: ManagerDecision,
  override: HumanOverride,
  registry: ActorRegistry = exampleActorRegistry()
): {
  live: PricebookRecommendation;
  chain: ReturnType<typeof emptyChain<OverrideRecord>>;
  ledger: ReceiptLedger;
} {
  if (!override.lockHolderId?.trim()) {
    throw new Error("ACCEPT / OVERRIDE / LOCK requires a lock-holder id");
  }
  if (!override.branchId?.trim()) {
    throw new Error("authority grant requires branch scope");
  }
  if (rec.locked && decision === "ACCEPT") {
    throw new Error("locked pricebook recommendation cannot be auto-recalibrated");
  }
  if (rec.locked && decision === "RELEASE" && override.actorId !== rec.lockHolder) {
    throw new Error("only an authorized human can release a lock");
  }
  const liveDecision = applyHumanOverride(
    {
      recommendationId: rec.recommendationId,
      action: `pricebook:${rec.sku}`,
      payload: { proposedPrice: rec.proposedPrice },
      confidence: {
        predictionConfidence: 0.5,
        evidenceStrength: "MEDIUM",
        sourceQuality: "MEDIUM",
        agreement: "MEDIUM",
        verificationStatus: "PARTIAL"
      },
      issuedAt: override.at
    } satisfies Recommendation,
    override,
    registry,
    decision as AuthorityAction
  );
  const lockHolderId =
    decision === "LOCK" ? override.actorId : decision === "RELEASE" ? undefined : override.lockHolderId || rec.lockHolder;
  const next: PricebookRecommendation = {
    ...rec,
    locked: decision === "LOCK" || (rec.locked && decision !== "RELEASE"),
    lockHolder: lockHolderId,
    proposedPrice:
      decision === "OVERRIDE" ? Number(override.replacementPayload.proposedPrice ?? rec.proposedPrice) : rec.proposedPrice
  };
  const chain = appendRecord(emptyChain<OverrideRecord>("C"), {
    chain: "C",
    recordId: `c:${rec.recommendationId}:${decision}`,
    at: override.at,
    recommendationId: rec.recommendationId,
    actorId: override.actorId,
    role: override.role,
    reason: `${decision}: ${override.reason}`,
    originalAction: liveDecision.originalRecommendation.action,
    replacementAction: liveDecision.liveAction
  });
  const ledger = appendReceipt(createLedger(), {
    receiptId: `rcpt:${rec.recommendationId}:${decision}`,
    kind: "override",
    at: override.at,
    body: {
      decision,
      actorId: override.actorId,
      lockHolderId: next.lockHolder ?? override.lockHolderId,
      branchId: override.branchId,
      priorPrice: rec.proposedPrice,
      livePrice: next.proposedPrice,
      locked: next.locked,
      currentCost: rec.costSignal?.currentCost,
      lastCost: rec.costSignal?.lastCost,
      adaptedCost: rec.costSignal?.adaptedCost,
      marketWeight: rec.costSignal?.marketWeight,
      marketWeakened: rec.costSignal?.weakened,
      subordinateToHuman: true
    }
  });
  return { live: next, chain, ledger };
}
