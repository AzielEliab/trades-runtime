import type { ConfidenceSeparation } from "./confidence.js";

export interface Recommendation {
  recommendationId: string;
  action: string;
  payload: Record<string, unknown>;
  confidence: ConfidenceSeparation;
  issuedAt: string;
}

export interface HumanOverride {
  actorId: string;
  role: string;
  authorized: boolean;
  reason: string;
  replacementAction: string;
  replacementPayload: Record<string, unknown>;
  at: string;
}

export interface LiveDecision {
  winner: "human" | "trades";
  liveAction: string;
  livePayload: Record<string, unknown>;
  originalRecommendation: Recommendation;
  override?: HumanOverride;
  disagreementPreserved: boolean;
}

export function applyHumanOverride(recommendation: Recommendation, override: HumanOverride): LiveDecision {
  if (!override.authorized) {
    throw new Error("unauthorized human cannot override live operation");
  }
  return {
    winner: "human",
    liveAction: override.replacementAction,
    livePayload: override.replacementPayload,
    originalRecommendation: recommendation,
    override,
    disagreementPreserved: true
  };
}

export function liveWithoutOverride(recommendation: Recommendation): LiveDecision {
  return {
    winner: "trades",
    liveAction: recommendation.action,
    livePayload: recommendation.payload,
    originalRecommendation: recommendation,
    disagreementPreserved: false
  };
}
