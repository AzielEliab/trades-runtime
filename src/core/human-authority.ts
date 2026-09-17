import type { ConfidenceSeparation } from "./confidence.js";
import {
  grantAuthority,
  normalizeAuthorityRole,
  type ActorRegistry,
  type AuthorityAction,
  type AuthorityGrant
} from "./actor-registry.js";

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
  branchId: string;
  lockHolderId: string;
  reason: string;
  replacementAction: string;
  replacementPayload: Record<string, unknown>;
  at: string;
  /**
   * @deprecated TR-CUT-2026-09-17 #6
   * Authority is a registry grant (role + branch + lock-holder), not this flag.
   */
  authorized?: boolean;
}

export interface LiveDecision {
  winner: "human" | "trades";
  liveAction: string;
  livePayload: Record<string, unknown>;
  originalRecommendation: Recommendation;
  override?: HumanOverride;
  grant?: AuthorityGrant;
  disagreementPreserved: boolean;
}

export function applyHumanOverride(
  recommendation: Recommendation,
  override: HumanOverride,
  registry: ActorRegistry,
  action: AuthorityAction = "OVERRIDE"
): LiveDecision {
  const grant = grantAuthority(registry, {
    actorId: override.actorId,
    action,
    branchId: override.branchId,
    lockHolderId: override.lockHolderId,
    at: override.at
  });
  if (normalizeAuthorityRole(override.role) !== grant.role && override.role !== "dispatch") {
    throw new Error("override role does not match registered actor");
  }
  return {
    winner: "human",
    liveAction: override.replacementAction,
    livePayload: override.replacementPayload,
    originalRecommendation: recommendation,
    override,
    grant,
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
