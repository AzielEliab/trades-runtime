import { applyHumanOverride, type HumanOverride, type Recommendation } from "../core/human-authority.js";
import { appendRecord, emptyChain, type OverrideRecord } from "../core/chains.js";
import { appendReceipt, createLedger, type ReceiptLedger } from "../inherited/receipt-ledger.js";

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
}

/** ServiceTitan pricebook is a shadow baseline. Recommendations stay subordinate to humans. */
export function recommendFromShadowBaseline(
  recommendationId: string,
  stBaselinePrice: number,
  inputs: PricebookInputs
): PricebookRecommendation {
  if (!inputs.compatibilityEvidence) {
    throw new Error("pricebook recommendation requires OEM/SKU compatibility evidence");
  }
  let proposed = stBaselinePrice;
  if (inputs.alreadyOnAssignedVan) {
    proposed = stBaselinePrice;
  }
  if (inputs.realizedMargin + 0.02 < inputs.premiumMarginTarget && inputs.predictedDemand > 0) {
    proposed = Math.round((stBaselinePrice + inputs.averageCost / Math.max(1 - inputs.premiumMarginTarget, 0.05)) / 2);
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
    source: "servicetitan-shadow"
  };
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
  override: HumanOverride
): {
  live: PricebookRecommendation;
  chain: ReturnType<typeof emptyChain<OverrideRecord>>;
  ledger: ReceiptLedger;
} {
  if (rec.locked && decision === "ACCEPT") {
    throw new Error("locked pricebook recommendation cannot be auto-recalibrated");
  }
  if (rec.locked && decision === "RELEASE" && override.actorId !== rec.lockHolder && !override.authorized) {
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
    override
  );
  const next: PricebookRecommendation = {
    ...rec,
    locked: decision === "LOCK" || (rec.locked && decision !== "RELEASE"),
    lockHolder: decision === "LOCK" ? override.actorId : decision === "RELEASE" ? undefined : rec.lockHolder,
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
      priorPrice: rec.proposedPrice,
      livePrice: next.proposedPrice,
      locked: next.locked
    }
  });
  return { live: next, chain, ledger };
}
