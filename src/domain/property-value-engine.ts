import {
  isHighConfidenceUnsupported,
  normalizeConfidence,
  type ConfidenceSeparation
} from "../core/confidence.js";

export interface ValueRange {
  low: number;
  mid: number;
  high: number;
  guarantee: false;
}

export interface DualValue {
  nominal: ValueRange;
  inflationAdjusted: ValueRange;
}

export type ValueDirection = "rising" | "falling" | "flat";

export interface ValueContributor {
  name: string;
  effect: number;
  estimated: true;
}

export interface ValueTrajectory {
  previous: DualValue;
  current: DualValue;
  direction: ValueDirection;
  contributors: ValueContributor[];
  confidence: ConfidenceSeparation;
  attributionEstimated: true;
}

export function valueRange(low: number, mid: number, high: number): ValueRange {
  if (!(low <= mid && mid <= high)) {
    throw new Error("value range must satisfy low <= mid <= high");
  }
  return { low, mid, high, guarantee: false };
}

export function propertyValueIsGuarantee(): false {
  return false;
}

export function dualValue(nominal: ValueRange, inflationFactor: number): DualValue {
  const real = valueRange(
    nominal.low / inflationFactor,
    nominal.mid / inflationFactor,
    nominal.high / inflationFactor
  );
  return { nominal, inflationAdjusted: real };
}

export interface MortgagePressure {
  ratePct: number;
  purchasingPowerIndex: number;
  demandPressure: number;
  appliedAsValueHaircut: false;
}

/** Mortgage rates affect purchasing power / demand pressure, not a fixed % haircut. */
export function mortgageDemandPressure(ratePct: number, baselineDemand = 1): MortgagePressure {
  const purchasingPowerIndex = 1 / (1 + Math.max(0, ratePct - 3) * 0.08);
  return {
    ratePct,
    purchasingPowerIndex,
    demandPressure: baselineDemand * purchasingPowerIndex,
    appliedAsValueHaircut: false
  };
}

export function refuseMortgageHaircut(): never {
  throw new Error("mortgage rates are not a simplistic fixed percentage deduction from property value");
}

export function applyMortgageToRange(range: ValueRange, mortgage: MortgagePressure): ValueRange {
  if (mortgage.appliedAsValueHaircut) {
    refuseMortgageHaircut();
  }
  const widen = mortgage.demandPressure < 0.75 ? 0.04 : 0.015;
  return valueRange(range.low * (1 - widen), range.mid, range.high * (1 + widen));
}

export function projectTrajectory(input: {
  previousNominal: ValueRange;
  inflationFactor: number;
  marketMovement: number;
  neighborhoodMovement: number;
  conditionMovement: number;
  completedWorkEffect: number;
  depreciation: number;
  confidence: ConfidenceSeparation;
  mortgage?: MortgagePressure;
}): ValueTrajectory {
  const confidence = normalizeConfidence(input.confidence);
  const contributors: ValueContributor[] = [
    { name: "market-movement", effect: input.marketMovement, estimated: true },
    { name: "neighborhood-movement", effect: input.neighborhoodMovement, estimated: true },
    { name: "property-condition-movement", effect: input.conditionMovement, estimated: true },
    { name: "completed-work-effect", effect: input.completedWorkEffect, estimated: true },
    { name: "depreciation-aging", effect: -Math.abs(input.depreciation), estimated: true }
  ];
  const net = contributors.reduce((sum, c) => sum + c.effect, 0);
  const mid = Math.max(0, input.previousNominal.mid + net);
  const spread = Math.max(input.previousNominal.high - input.previousNominal.low, Math.max(mid * 0.08, 1));
  let currentNominal = valueRange(mid - spread / 2, mid, mid + spread / 2);
  if (input.mortgage) {
    currentNominal = applyMortgageToRange(currentNominal, input.mortgage);
  }
  const previous = dualValue(input.previousNominal, input.inflationFactor);
  const current = dualValue(currentNominal, input.inflationFactor);
  const delta = current.nominal.mid - previous.nominal.mid;
  const direction: ValueDirection = delta > 50 ? "rising" : delta < -50 ? "falling" : "flat";
  return {
    previous,
    current,
    direction,
    contributors,
    confidence,
    attributionEstimated: true
  };
}

export function settleAgainstSale(
  estimate: ValueRange,
  realizedSale: number
): { error: number; estimateWasGuarantee: false; highConfidenceStillNotTruth: boolean } {
  return {
    error: realizedSale - estimate.mid,
    estimateWasGuarantee: false,
    highConfidenceStillNotTruth: true
  };
}

export function rangeIsNotFalsePrecision(range: ValueRange): boolean {
  return range.high > range.low && range.guarantee === false;
}

export function unsupportedHighConfidenceBlocksGuarantee(confidence: ConfidenceSeparation): boolean {
  return isHighConfidenceUnsupported(normalizeConfidence(confidence));
}
