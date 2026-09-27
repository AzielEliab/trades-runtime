import type { ScoredVan } from "./call-fit.js";
import { flagHandoffBehavior, type DepartmentBehaviorFlag, type HandoffInput } from "./chain-d.js";

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

/**
 * Cross-trade collaboration is a positive flag when the handoff is clean and the signal is evidenced.
 * A broken handoff or an unevidenced weight is a negative coordination flag.
 * The last person is not blamed by default.
 */
export function flagCrossTradeBehavior(input: {
  signal: CrossTradeSignal;
  handoff?: HandoffInput;
  flagId?: string;
}): DepartmentBehaviorFlag {
  if (input.handoff) {
    const base = flagHandoffBehavior(input.handoff);
    if (base.polarity === "negative") {
      return {
        ...base,
        flagId: input.flagId ?? `x:${input.signal.origin}:${input.signal.receiving}:negative`,
        source: "cross-trade",
        summary: `Cross-trade ${input.signal.origin} to ${input.signal.receiving}: ${base.summary}`
      };
    }
  }
  if (!input.signal.evidenceSupported) {
    return {
      flagId: input.flagId ?? `x:${input.signal.origin}:${input.signal.receiving}:unevidenced`,
      polarity: "negative",
      source: "cross-trade",
      fromRole: input.signal.origin,
      toRole: input.signal.receiving,
      kind: "unevidenced-cross-trade",
      summary: `Cross-trade weight from ${input.signal.origin} to ${input.signal.receiving} has no evidence. The signal stays at zero. Nobody is blamed for the missing evidence.`,
      attribution: "system",
      lastPersonBlamed: false,
      systemBeforeBlame: true
    };
  }
  return {
    flagId: input.flagId ?? `x:${input.signal.origin}:${input.signal.receiving}:assist`,
    polarity: "positive",
    source: "cross-trade",
    fromRole: input.signal.origin,
    toRole: input.signal.receiving,
    kind: "cross-trade-assist",
    summary: `Evidence-supported assist from ${input.signal.origin} to ${input.signal.receiving}. Secondary routing signal only. Not a skill score and not a blame flag.`,
    attribution: "unknown",
    lastPersonBlamed: false,
    systemBeforeBlame: true
  };
}
