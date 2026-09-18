import type { HumanOverride } from "./human-authority.js";
import { sha256 } from "./hash.js";
import type { EvidenceBand, VerificationStatus } from "./confidence.js";
import {
  sealedRecommendationHash,
  settleShadow,
  type SealedCounterfactual,
  type ShadowSettlement
} from "../inherited/shadow-engine.js";

/** Required settlement receipt fields (TR-BOT §6 / TR-CUT). Override may be null. */
export const SETTLEMENT_REQUIRED_FIELDS = [
  "plannedAction",
  "contemporaneousEvidenceHash",
  "prediction_confidence",
  "evidence_strength",
  "source_quality",
  "cross_source_agreement",
  "verification_status",
  "humanOverride",
  "actualOutcome",
  "timeToSettleMs"
] as const;

export type SettlementRequiredField = (typeof SETTLEMENT_REQUIRED_FIELDS)[number];

export interface SettlementReceiptFields {
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
}

export function missingSettlementFields(receipt: Partial<SettlementReceiptFields>): SettlementRequiredField[] {
  return SETTLEMENT_REQUIRED_FIELDS.filter((field) => {
    const value = receipt[field];
    if (field === "humanOverride") return !("humanOverride" in receipt);
    if (value === undefined || value === null) return true;
    if (field === "plannedAction" || field === "contemporaneousEvidenceHash") {
      return typeof value !== "string" || value.trim() === "";
    }
    if (field === "prediction_confidence" || field === "timeToSettleMs") {
      return typeof value !== "number" || !Number.isFinite(value);
    }
    if (field === "actualOutcome") {
      return typeof value !== "object";
    }
    return false;
  });
}

export function requireSettlementFields(
  receipt: Partial<SettlementReceiptFields>
): SettlementReceiptFields {
  const missing = missingSettlementFields(receipt);
  if (missing.length > 0) {
    throw new Error(`settlement receipt missing required fields: ${missing.join(", ")}`);
  }
  return {
    plannedAction: receipt.plannedAction as string,
    contemporaneousEvidenceHash: receipt.contemporaneousEvidenceHash as string,
    prediction_confidence: receipt.prediction_confidence as number,
    evidence_strength: receipt.evidence_strength as EvidenceBand,
    source_quality: receipt.source_quality as EvidenceBand,
    cross_source_agreement: receipt.cross_source_agreement as EvidenceBand,
    verification_status: receipt.verification_status as VerificationStatus,
    humanOverride: receipt.humanOverride ?? null,
    actualOutcome: receipt.actualOutcome as Record<string, unknown>,
    timeToSettleMs: receipt.timeToSettleMs as number
  };
}

/** Outcome must not rewrite the sealed recommendation. */
export function assertSealedRecommendationUnchanged(
  original: SealedCounterfactual,
  settlement: Pick<ShadowSettlement, "plannedAction" | "sealedRecommendationHash" | "sealed">
): void {
  const originalHash = sealedRecommendationHash(original);
  if (settlement.sealedRecommendationHash !== originalHash) {
    throw new Error("hindsight must not rewrite a sealed recommendation");
  }
  if (settlement.plannedAction !== original.action) {
    throw new Error("hindsight must not rewrite a sealed recommendation");
  }
  if (sealedRecommendationHash(settlement.sealed) !== originalHash) {
    throw new Error("hindsight must not rewrite a sealed recommendation");
  }
}

export function settlementHash(fields: SettlementReceiptFields): string {
  return sha256(fields);
}

export function settleRequired(
  sealed: SealedCounterfactual,
  actual: Record<string, unknown>,
  extras?: Parameters<typeof settleShadow>[3]
): SettlementReceiptFields & { sealedRecommendationHash: string; hindsightLeak: false; settlementHash: string } {
  const settlement = settleShadow(sealed, actual, undefined, extras);
  const fields = requireSettlementFields(settlement);
  assertSealedRecommendationUnchanged(sealed, settlement);
  return {
    ...fields,
    sealedRecommendationHash: settlement.sealedRecommendationHash,
    hindsightLeak: false,
    settlementHash: settlementHash(fields)
  };
}
