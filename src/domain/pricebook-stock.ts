import { applyHumanOverride, type HumanOverride, type Recommendation } from "../core/human-authority.js";
import { appendRecord, emptyChain, type OverrideRecord } from "../core/chains.js";

export const STOCK_LOCATIONS = [
  "ON_VAN",
  "NEARBY_VAN",
  "BRANCH_STOCK",
  "CENTRAL_WAREHOUSE",
  "LOCAL_DISTRIBUTOR",
  "SHIPPED",
  "BACKORDERED"
] as const;

export type StockLocation = (typeof STOCK_LOCATIONS)[number];

export const FULFILLMENT_STEPS = [
  "REQUESTED",
  "CLAIMED",
  "PICKING",
  "READY",
  "TRANSFER",
  "DELIVERED",
  "INSTALLED",
  "RECONCILED"
] as const;

export type FulfillmentStep = (typeof FULFILLMENT_STEPS)[number];

export type ManagerDecision = "ACCEPT" | "OVERRIDE" | "LOCK" | "RELEASE";

export interface PricebookRecommendation {
  recommendationId: string;
  sku: string;
  oemPart: string;
  proposedPrice: number;
  locked: boolean;
  lockHolder?: string;
}

export interface StockRequest {
  requestId: string;
  callId: string;
  vanId: string;
  partNumber: string;
  quantity: number;
  location: StockLocation;
  step: FulfillmentStep;
  urgency?: "routine" | "same-day" | "emergency";
  replenishAfter?: boolean;
}

/** ServiceTitan pricebook is a shadow baseline. A lock cannot be auto-superseded. */
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

export function firstTripProbability(location: StockLocation): number {
  switch (location) {
    case "ON_VAN":
      return 0.92;
    case "NEARBY_VAN":
      return 0.78;
    case "BRANCH_STOCK":
      return 0.7;
    case "CENTRAL_WAREHOUSE":
      return 0.55;
    case "LOCAL_DISTRIBUTOR":
      return 0.45;
    case "SHIPPED":
      return 0.25;
    case "BACKORDERED":
      return 0.05;
  }
}

export function applyManagerDecision(
  rec: PricebookRecommendation,
  decision: ManagerDecision,
  override: HumanOverride
): { live: PricebookRecommendation; chain: ReturnType<typeof emptyChain<OverrideRecord>> } {
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
  return { live: next, chain };
}

export function advanceFulfillment(request: StockRequest): StockRequest {
  const i = FULFILLMENT_STEPS.indexOf(request.step);
  if (i < 0 || i === FULFILLMENT_STEPS.length - 1) return request;
  return { ...request, step: FULFILLMENT_STEPS[i + 1]! };
}

export function purchasingRequiresHuman(delegated = false): boolean {
  return !delegated;
}

export type StockAction = "add" | "increase" | "reduce" | "eliminate" | "hold-min";

export function recommendVanStock(input: {
  consumption: number;
  firstTripRate: number;
  carryingCost: number;
  explorationNeed: boolean;
}): StockAction {
  if (input.consumption === 0 && input.carryingCost > 0.5) return "eliminate";
  if (input.firstTripRate < 0.6) return "increase";
  if (input.explorationNeed && input.consumption < 1) return "hold-min";
  if (input.consumption > 3) return "add";
  return "reduce";
}
