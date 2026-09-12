export const PLUMBING_PATTERN_CLASSES = [
  "clay-sewer-tile",
  "root-intrusion",
  "orangeburg-collapse",
  "cast-iron-deterioration",
  "galvanized-restriction",
  "polybutylene"
] as const;

export const ELECTRICAL_PATTERN_CLASSES = [
  "panel-service-issue",
  "capacity-limitation",
  "era-wiring-pattern"
] as const;

export const HVAC_PATTERN_CLASSES = [
  "duct-pattern",
  "sizing-pattern",
  "insulation-pattern",
  "condensate-pattern",
  "equipment-location-pattern",
  "equipment-family-failure"
] as const;

export type PlumbingPatternClass = (typeof PLUMBING_PATTERN_CLASSES)[number];
export type ElectricalPatternClass = (typeof ELECTRICAL_PATTERN_CLASSES)[number];
export type HvacPatternClass = (typeof HVAC_PATTERN_CLASSES)[number];
export type PatternClass = PlumbingPatternClass | ElectricalPatternClass | HvacPatternClass;

export type PatternKind = "ObservedNeighborhoodPattern" | "InferredRisk" | "VerifiedPropertyCondition";

export interface NeighborhoodPattern {
  patternId: string;
  kind: PatternKind;
  trade: "plumbing" | "electrical" | "hvac";
  patternClass: PatternClass;
  neighborhoodId: string;
  comparableCaseCount: number;
  riskLevel: "low" | "medium" | "high";
  evidenceBasis: string;
  verifiedOnSubjectProperty: boolean;
}

export interface NeighborhoodRepairRiskProfile {
  propertyId: string;
  issueClass: PatternClass;
  riskLevel: NeighborhoodPattern["riskLevel"];
  evidenceBasis: string;
  comparableCaseCount: number;
  geographicEraSimilarity: number;
  propertySpecificVerification: PatternKind;
}

export function neighborhoodPatternProvesSubjectDefect(): false {
  return false;
}

export function asDiagnosticPrior(pattern: NeighborhoodPattern): {
  diagnosticPrior: true;
  proofOfSubjectDefect: false;
  kind: PatternKind;
} {
  if (pattern.kind === "VerifiedPropertyCondition" && pattern.verifiedOnSubjectProperty) {
    return { diagnosticPrior: true, proofOfSubjectDefect: false, kind: pattern.kind };
  }
  return { diagnosticPrior: true, proofOfSubjectDefect: false, kind: pattern.kind };
}

export function assertPatternNotVerifiedDefect(pattern: NeighborhoodPattern): void {
  if (pattern.kind !== "VerifiedPropertyCondition" && pattern.verifiedOnSubjectProperty) {
    throw new Error("neighborhood pattern is a diagnostic prior, not proof of a subject-property defect");
  }
}

export function mayCallVerifiedSubjectDefect(pattern: NeighborhoodPattern): boolean {
  return pattern.kind === "VerifiedPropertyCondition" && pattern.verifiedOnSubjectProperty;
}

export function riskProfile(
  propertyId: string,
  pattern: NeighborhoodPattern,
  geographicEraSimilarity: number
): NeighborhoodRepairRiskProfile {
  return {
    propertyId,
    issueClass: pattern.patternClass,
    riskLevel: pattern.riskLevel,
    evidenceBasis: pattern.evidenceBasis,
    comparableCaseCount: pattern.comparableCaseCount,
    geographicEraSimilarity,
    propertySpecificVerification: pattern.kind
  };
}
