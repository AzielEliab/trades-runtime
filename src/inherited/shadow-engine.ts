import { sha256 } from "../core/hash.js";
import type { ConfidenceSeparation, EvidenceBand, VerificationStatus } from "../core/confidence.js";
import type { HumanOverride } from "../core/human-authority.js";
import { type ShadowMode } from "../core/shadow-modes.js";

export interface SealedCounterfactual {
  sealedAt: string;
  evidenceLockHash: string;
  action: string;
  expected: Record<string, unknown>;
  confidence: ConfidenceSeparation;
  knownInputs: Record<string, unknown>;
}

export interface ShadowSettlement {
  sealed: SealedCounterfactual;
  actual: Record<string, unknown>;
  deltas: Record<string, { expected: unknown; actual: unknown }>;
  hindsightLeak: false;
  mode: ShadowMode;
  plannedAction: string;
  contemporaneousEvidenceHash: string;
  prediction_confidence: number;
  evidence_strength: EvidenceBand;
  source_quality: EvidenceBand;
  cross_source_agreement: EvidenceBand;
  verification_status: VerificationStatus;
  humanOverride: HumanOverride | null;
  actualOutcome: Record<string, unknown>;
  timeToSettleMs: number;
  sealedRecommendationHash: string;
}

export function sealCounterfactual(input: {
  knownInputs: Record<string, unknown>;
  action: string;
  expected: Record<string, unknown>;
  confidence: ConfidenceSeparation;
  sealedAt: string;
}): SealedCounterfactual {
  return {
    sealedAt: input.sealedAt,
    evidenceLockHash: sha256(input.knownInputs),
    action: input.action,
    expected: input.expected,
    confidence: input.confidence,
    knownInputs: input.knownInputs
  };
}

export function sealedRecommendationHash(sealed: SealedCounterfactual): string {
  return sha256({
    sealedAt: sealed.sealedAt,
    evidenceLockHash: sealed.evidenceLockHash,
    action: sealed.action,
    expected: sealed.expected,
    confidence: sealed.confidence
  });
}

export function settleShadow(
  sealed: SealedCounterfactual,
  actual: Record<string, unknown>,
  lateInformation?: Record<string, unknown>,
  extras?: {
    settledAt?: string;
    mode?: ShadowMode;
    override?: HumanOverride | null;
  }
): ShadowSettlement {
  if (lateInformation && Object.keys(lateInformation).length > 0) {
    const leaked = sha256({ ...sealed.knownInputs, ...lateInformation }) !== sealed.evidenceLockHash;
    if (leaked) {
      throw new Error("hindsight leakage: late information cannot mutate a sealed counterfactual");
    }
  }
  const deltas: ShadowSettlement["deltas"] = {};
  const keys = new Set([...Object.keys(sealed.expected), ...Object.keys(actual)]);
  for (const key of keys) {
    if (sealed.expected[key] !== actual[key]) {
      deltas[key] = { expected: sealed.expected[key], actual: actual[key] };
    }
  }
  const settledAt = extras?.settledAt ?? sealed.sealedAt;
  const timeToSettleMs = Math.max(0, Date.parse(settledAt) - Date.parse(sealed.sealedAt));
  return {
    sealed,
    actual,
    deltas,
    hindsightLeak: false,
    mode: extras?.mode ?? "SHADOW-SEALED",
    plannedAction: sealed.action,
    contemporaneousEvidenceHash: sealed.evidenceLockHash,
    prediction_confidence: sealed.confidence.predictionConfidence,
    evidence_strength: sealed.confidence.evidenceStrength,
    source_quality: sealed.confidence.sourceQuality,
    cross_source_agreement: sealed.confidence.agreement,
    verification_status: sealed.confidence.verificationStatus,
    humanOverride: extras?.override ?? null,
    actualOutcome: actual,
    timeToSettleMs: Number.isFinite(timeToSettleMs) ? timeToSettleMs : 0,
    sealedRecommendationHash: sealedRecommendationHash(sealed)
  };
}
