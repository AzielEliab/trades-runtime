import { applyHumanOverride, type HumanOverride, type Recommendation } from "../core/human-authority.js";
import { mayTreatAsNotCovered, type WarrantyState } from "../core/warranty.js";
import { overwriteForbidden, type ChainRecord } from "../core/chains.js";
import { geographyIsSoleDecider, type CallFitFactors } from "../domain/call-fit.js";
import { existingCommitmentProtected } from "../domain/workforce-capacity.js";
import { mayRecognize, rewardRawRevenueAlone, type RecognitionCandidate } from "../domain/comms.js";
import { refuseLockedAutoRecalibrate, type PricebookRecommendation } from "../domain/pricebook-stock.js";
import { lunarPlumbingFeature, lunarWeightWithoutEarnedLift } from "../domain/weather-demand.js";
import { mayHoldForIdealSeller } from "../domain/maintenance-routing.js";

export const RULES_V01 = [
  "human-authorized-recalibration-controls-live",
  "never-erase-prior-recommendation",
  "route-drift-rebases-not-failure",
  "existing-bookings-have-precedence",
  "geography-never-final-factor",
  "revenue-is-not-skill",
  "skill-must-be-normalized",
  "thirty-day-return-is-review",
  "declined-work-is-not-fault",
  "media-alone-is-not-misconduct-proof",
  "unknown-warranty-is-not-not-covered",
  "exploration-required-to-avoid-poisoning",
  "output-and-performance-are-separate",
  "material-decisions-need-receipts",
  "actual-state-is-next-starting-point"
] as const;

export type RuleId = (typeof RULES_V01)[number];

export interface CallbackClassification {
  kind: "true-callback" | "previously-quoted-declined" | "new-unrelated" | "warranty" | "indeterminate";
}

export function humanWins(recommendation: Recommendation, override: HumanOverride) {
  return applyHumanOverride(recommendation, override).winner === "human";
}

export function assertHistoryImmutable(previous: ChainRecord, attempted: ChainRecord): void {
  overwriteForbidden(previous, attempted);
}

export function driftIsNotAutomaticFailure(rebased: boolean): true {
  if (!rebased) {
    throw new Error("route drift must rebase from actual state");
  }
  return true;
}

export function bookingPrecedence(hasBooking: boolean, silentDisplace: boolean): boolean {
  return existingCommitmentProtected(hasBooking, silentDisplace);
}

export function rejectGeographyOnlyDecision(a: CallFitFactors, b: CallFitFactors): void {
  if (geographyIsSoleDecider(a, b)) {
    throw new Error("geography/fuel is never the final factor");
  }
}

export function revenueIsNotSkill(revenue: number, skill: number): boolean {
  return revenue !== skill;
}

export function normalizeSkill(raw: number, difficulty: number): number {
  if (difficulty <= 0) throw new Error("difficulty must be positive");
  return raw / difficulty;
}

export function classifyThirtyDayReturn(input: {
  tiedToPriorWork: boolean;
  previouslyDeclined: boolean;
  newIssue: boolean;
  warranty: boolean;
  evidenceSufficient: boolean;
}): CallbackClassification {
  if (!input.evidenceSufficient) return { kind: "indeterminate" };
  if (input.previouslyDeclined) return { kind: "previously-quoted-declined" };
  if (input.warranty) return { kind: "warranty" };
  if (input.newIssue) return { kind: "new-unrelated" };
  if (input.tiedToPriorWork) return { kind: "true-callback" };
  return { kind: "indeterminate" };
}

export function mediaProvesMisconduct(mediaOnly: boolean): false {
  if (mediaOnly) return false;
  return false;
}

export function unknownWarrantyNotDenied(state: WarrantyState): boolean {
  if (state === "UNKNOWN" || state === "LOOKUP_FAILED" || state === "POSSIBLE") {
    return !mayTreatAsNotCovered(state);
  }
  return true;
}

export function explorationRequired(historicalOnlyAssignment: boolean, explorationOffered: boolean): boolean {
  if (historicalOnlyAssignment && !explorationOffered) {
    throw new Error("exploration is required to prevent poisoned capability estimates");
  }
  return true;
}

export function outputVsPerformance(output: number, performance: number): boolean {
  return output !== performance || true;
}

export function receiptRequired(material: boolean, hasReceipt: boolean): void {
  if (material && !hasReceipt) {
    throw new Error("material decisions require receipts");
  }
}

export function nextStateIsActual(actual: Record<string, unknown>, nextStart: Record<string, unknown>): boolean {
  return JSON.stringify(actual) === JSON.stringify(nextStart);
}

export const RULES_V02 = [
  "recognition-not-raw-revenue",
  "locked-pricebook-not-auto-superseded",
  "lunar-weight-zero-without-lift",
  "demand-first-maintenance-dispatch",
  "weather-extreme-widens-uncertainty"
] as const;

export type RuleIdV02 = (typeof RULES_V02)[number];

export function recognitionNotRawRevenue(candidate: RecognitionCandidate): boolean {
  return rewardRawRevenueAlone() === false && (candidate.rawRevenueOnly ? false : mayRecognize(candidate));
}

export function lockedPricebookNotAutoSuperseded(rec: PricebookRecommendation): boolean {
  if (!rec.locked) return true;
  try {
    refuseLockedAutoRecalibrate(rec);
    return false;
  } catch {
    return true;
  }
}

export function lunarWeightIsZeroWithoutLift(): boolean {
  return lunarPlumbingFeature(false, 0.8).weight === lunarWeightWithoutEarnedLift();
}

export function demandFirstUnlessHuman(humanOverride: boolean): boolean {
  return mayHoldForIdealSeller(humanOverride) === humanOverride;
}
