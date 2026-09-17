export const GEO_LEVELS = [
  "company",
  "region",
  "branch",
  "zip",
  "neighborhood",
  "cohort",
  "property"
] as const;

export type GeoLevel = (typeof GEO_LEVELS)[number];

export const PATTERN_LADDER = [
  "OBSERVED",
  "CANDIDATE",
  "REGIONALLY_SUPPORTED",
  "VERIFIED",
  "ACTIVE_PRIOR",
  "MONITORED_FOR_DRIFT",
  "RETIRED"
] as const;

export type PatternLadder = (typeof PATTERN_LADDER)[number];

export interface PatternEvidence {
  sampleSize: number;
  geographicConcentration: number;
  constructionSimilarity: number;
  materialSimilarity: number;
  technicianConfirmations: number;
  outcomeConfirmations: number;
  recencyDays: number;
  crossBranchAgreement: number;
  conflicting: boolean;
  stale: boolean;
  cohortDissimilar: boolean;
  stoppedRecurring: boolean;
}

export interface RegionalPattern {
  patternId: string;
  level: GeoLevel;
  ladder: PatternLadder;
  weight: number;
}

export function evidenceWeight(evidence: PatternEvidence): number {
  if (evidence.sampleSize < 3 || evidence.stale || evidence.conflicting || evidence.cohortDissimilar || evidence.stoppedRecurring) {
    return Math.min(0.15, evidence.sampleSize / 40);
  }
  const recency = evidence.recencyDays > 365 ? 0.4 : 1;
  return Math.min(
    1,
    (Math.log10(evidence.sampleSize + 1) / 2) *
      ((evidence.geographicConcentration +
        evidence.constructionSimilarity +
        evidence.materialSimilarity +
        evidence.crossBranchAgreement) /
        4) *
      recency *
      ((evidence.technicianConfirmations + evidence.outcomeConfirmations) > 0 ? 1 : 0.5)
  );
}

export function weakenOnThinEvidence(evidence: PatternEvidence): boolean {
  return evidence.sampleSize < 5 || evidence.stale || evidence.conflicting || evidence.cohortDissimilar || evidence.stoppedRecurring;
}

export function promotePattern(current: PatternLadder, evidence: PatternEvidence): PatternLadder {
  const weight = evidenceWeight(evidence);
  if (evidence.stoppedRecurring || (evidence.stale && evidence.sampleSize < 8)) {
    return current === "OBSERVED" ? "OBSERVED" : "MONITORED_FOR_DRIFT";
  }
  if (evidence.conflicting) return "CANDIDATE";
  if (weight < 0.2) return current === "OBSERVED" ? "OBSERVED" : "CANDIDATE";
  if (weight < 0.4) return "CANDIDATE";
  if (weight < 0.6) return "REGIONALLY_SUPPORTED";
  if (weight < 0.8) return "VERIFIED";
  return "ACTIVE_PRIOR";
}

export function moreSpecificOutweighsBroader(
  specific: { level: GeoLevel; weight: number },
  broader: { level: GeoLevel; weight: number }
): boolean {
  const specificIdx = GEO_LEVELS.indexOf(specific.level);
  const broaderIdx = GEO_LEVELS.indexOf(broader.level);
  if (specificIdx <= broaderIdx) return false;
  return specific.weight >= 0.35;
}

export function supportDistinction(input: {
  regionalSupport: boolean;
  neighborhoodSupport: boolean;
  propertyVerified: boolean;
}): { regionalSupport: boolean; neighborhoodSupport: boolean; propertyVerified: boolean } {
  return { ...input };
}

export function retirePattern(pattern: RegionalPattern): RegionalPattern {
  return { ...pattern, ladder: "RETIRED", weight: Math.min(pattern.weight, 0.05) };
}
