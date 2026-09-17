import { normalizeConfidence, type ConfidenceSeparation } from "../core/confidence.js";
import { valueRange, type ValueRange } from "./property-value-engine.js";

export const IMPROVEMENT_CATEGORIES = [
  "ValueAdded",
  "ValuePreserved",
  "RiskRemoved",
  "OperatingCostReduction",
  "MarketabilityImprovement",
  "SafetyCodeImprovement"
] as const;

export type ImprovementCategory = (typeof IMPROVEMENT_CATEGORIES)[number];

export interface ImprovementEntry {
  date: string;
  trade: "hvac" | "plumbing" | "electrical" | "sewer" | "cross-trades";
  work: string;
  cost: number;
  asset: string;
  remainingLifeChangeYears: number;
  warranty?: string;
  permit?: string;
  evidenceIds: string[];
  category: ImprovementCategory;
  estimatedValueEffect: ValueRange;
  confidence: ConfidenceSeparation;
  laterRealized?: ValueRange;
}

export function repairCostEqualsResaleUplift(): false {
  return false;
}

export function estimatedEffectFromWork(
  cost: number,
  category: ImprovementCategory,
  quality = 0.7
): ValueRange {
  if (cost < 0) throw new Error("repair cost cannot be negative");
  const factor =
    category === "ValueAdded" ? 0.35 :
    category === "ValuePreserved" ? 0.18 :
    category === "MarketabilityImprovement" ? 0.12 :
    category === "OperatingCostReduction" ? 0.1 :
    category === "SafetyCodeImprovement" ? 0.08 :
    0.06;
  const mid = cost * factor * quality;
  if (mid === cost) {
    throw new Error("repair cost must never equal assumed resale-value increase");
  }
  return valueRange(Math.max(0, mid * 0.5), mid, mid * 1.5);
}

export function recordImprovement(
  input: Omit<ImprovementEntry, "estimatedValueEffect"> & { estimatedValueEffect?: ValueRange }
): ImprovementEntry {
  const estimatedValueEffect = input.estimatedValueEffect ?? estimatedEffectFromWork(input.cost, input.category);
  if (estimatedValueEffect.mid === input.cost) {
    throw new Error("repair cost must never equal assumed resale-value increase");
  }
  return {
    ...input,
    estimatedValueEffect,
    confidence: normalizeConfidence(input.confidence)
  };
}

export function settleImprovement(entry: ImprovementEntry, laterRealized: ValueRange): ImprovementEntry {
  return { ...entry, laterRealized };
}
