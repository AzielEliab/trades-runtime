import type { DepartmentBehaviorFlag } from "./chain-d.js";

export type RecognitionKind =
  | "successful-repair"
  | "turnover-closed"
  | "difficult-job"
  | "high-value-quality"
  | "duration-adjusted-quality";

export interface RecognitionCandidate {
  kind: RecognitionKind;
  revenue: number;
  qualityOk: boolean;
  callbackAcceptable: boolean;
  firstTrip?: boolean;
  difficultyNormalized?: boolean;
  /** If true, the only proposed signal is revenue. Always refused. */
  rawRevenueOnly?: boolean;
}

export interface RecognitionEvent {
  kind: RecognitionKind;
  revenue: number;
  fired: true;
  at: string;
}

export interface TurnoverAttribution {
  originatingVanId: string;
  closingComfortAdvisorId: string;
}

/** Constitutional: recognition must not reward raw revenue alone. */
export function rewardRawRevenueAlone(): false {
  return false;
}

/** Recognition is context-aware and must not reward raw revenue alone. */
export function mayRecognize(candidate: RecognitionCandidate): boolean {
  if (candidate.rawRevenueOnly) return false;
  if (!candidate.qualityOk || !candidate.callbackAcceptable) return false;
  if (candidate.kind === "difficult-job" && !candidate.difficultyNormalized) return false;
  if (candidate.kind === "duration-adjusted-quality" && !candidate.firstTrip && !candidate.difficultyNormalized) {
    return false;
  }
  return true;
}

export function fireRecognition(candidate: RecognitionCandidate, at: string): RecognitionEvent {
  if (candidate.rawRevenueOnly || (!candidate.qualityOk && candidate.revenue > 0)) {
    throw new Error("recognition cannot fire on raw revenue alone");
  }
  if (!mayRecognize(candidate)) {
    throw new Error("recognition refused: quality gates not satisfied");
  }
  return { kind: candidate.kind, revenue: candidate.revenue, fired: true, at };
}

/**
 * Quality-gated collaboration flag. Raw revenue does not produce a flag.
 * A quality miss is negative only when the caller marks a coordination miss.
 * The last person is not blamed.
 */
export function flagRecognitionBehavior(input: {
  flagId: string;
  candidate: RecognitionCandidate;
  fromRole: string;
  toRole: string;
  coordinationMiss?: boolean;
}): DepartmentBehaviorFlag | undefined {
  if (input.candidate.rawRevenueOnly) return undefined;
  if (mayRecognize(input.candidate)) {
    const shared = input.candidate.kind === "turnover-closed" || input.candidate.kind === "high-value-quality";
    return {
      flagId: input.flagId,
      polarity: "positive",
      source: "recognition",
      fromRole: input.fromRole,
      toRole: input.toRole,
      kind: shared ? "shared-diagnosis" : "clean-handoff",
      summary: `Quality gates passed for ${input.candidate.kind} between ${input.fromRole} and ${input.toRole}. Revenue alone did not fire this flag.`,
      attribution: "unknown",
      lastPersonBlamed: false,
      systemBeforeBlame: true
    };
  }
  if (!input.coordinationMiss) return undefined;
  return {
    flagId: input.flagId,
    polarity: "negative",
    source: "recognition",
    fromRole: input.fromRole,
    toRole: input.toRole,
    kind: "quality-gate-miss",
    summary: `Quality gates did not pass between ${input.fromRole} and ${input.toRole}. This is not a revenue miss. The last person is not the cause by default.`,
    attribution: "system",
    lastPersonBlamed: false,
    systemBeforeBlame: true
  };
}

/** Replacement turnovers preserve both the originating Van and the closing Comfort Advisor. */
export function turnoverAttribution(input: TurnoverAttribution): TurnoverAttribution {
  if (!input.originatingVanId || !input.closingComfortAdvisorId) {
    throw new Error("turnover recognition requires originating Van and closing Comfort Advisor");
  }
  return { ...input };
}
