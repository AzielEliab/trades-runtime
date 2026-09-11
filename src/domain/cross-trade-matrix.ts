import type { ScoredVan } from "./call-fit.js";

export type Trade = "hvac" | "plumbing" | "electrical" | "sewer";

export interface CrossTradeSignal {
  origin: Trade;
  receiving: Trade;
  evidenceSupported: boolean;
  weight: number;
}

export const CROSS_TRADE_WEIGHT_CAP = 0.15;

export function applyCrossTradeWeight(
  primaryPool: ScoredVan[],
  signal: CrossTradeSignal | null
): ScoredVan[] {
  if (!signal) {
    return primaryPool.map((van) => ({ ...van, crossTradeAdjustment: 0, finalScore: van.baseScore }));
  }
  if (!signal.evidenceSupported) {
    return primaryPool.map((van) => ({ ...van, crossTradeAdjustment: 0, finalScore: van.baseScore }));
  }
  const bounded = Math.min(Math.max(signal.weight, 0), CROSS_TRADE_WEIGHT_CAP);
  return primaryPool
    .map((van) => ({
      ...van,
      crossTradeAdjustment: bounded,
      finalScore: van.baseScore + bounded
    }))
    .sort((a, b) => b.finalScore - a.finalScore);
}

/** Constitutional routing: secondary signal may never manufacture the candidate pool. */
export function assertSecondaryOnly(allVans: ScoredVan[], pool: ScoredVan[], signal: CrossTradeSignal): void {
  const poolIds = new Set(pool.map((v) => v.vanId));
  for (const van of allVans) {
    if (!van.qualifiedForPrimary && poolIds.has(van.vanId)) {
      throw new Error("cross-trade signal manufactured an unqualified candidate");
    }
  }
  if (!signal.evidenceSupported && pool.some((v) => v.crossTradeAdjustment > 0)) {
    throw new Error("unevidenced cross-trade weight is forbidden");
  }
}

export function buildPrimaryPool(vans: ScoredVan[]): ScoredVan[] {
  return vans.filter((van) => van.qualifiedForPrimary);
}
