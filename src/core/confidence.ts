export type EvidenceBand = "LOW" | "MEDIUM" | "HIGH";
export type VerificationStatus = "UNVERIFIED" | "PARTIAL" | "VERIFIED" | "CONFLICTED";

/** Confidence is not truth. These fields must stay separate. */
export interface ConfidenceSeparation {
  predictionConfidence: number;
  evidenceStrength: EvidenceBand;
  sourceQuality: EvidenceBand;
  agreement: EvidenceBand;
  verificationStatus: VerificationStatus;
}

export function assertConfidenceRange(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("predictionConfidence must be between 0 and 1");
  }
  return value;
}

export function normalizeConfidence(input: ConfidenceSeparation): ConfidenceSeparation {
  return {
    ...input,
    predictionConfidence: assertConfidenceRange(input.predictionConfidence)
  };
}

export function isHighConfidenceUnsupported(input: ConfidenceSeparation): boolean {
  const c = normalizeConfidence(input);
  return c.predictionConfidence >= 0.9 && (c.evidenceStrength === "LOW" || c.verificationStatus === "UNVERIFIED");
}

/** High model confidence never converts an unsupported claim into a verified fact. */
export function mayAutonomousHighConsequence(input: ConfidenceSeparation): boolean {
  const c = normalizeConfidence(input);
  if (isHighConfidenceUnsupported(c)) return false;
  return (
    c.verificationStatus === "VERIFIED" &&
    c.evidenceStrength !== "LOW" &&
    c.sourceQuality !== "LOW"
  );
}

export function describeConfidence(input: ConfidenceSeparation): string {
  const c = normalizeConfidence(input);
  return `${Math.round(c.predictionConfidence * 100)}% prediction confidence / ${c.evidenceStrength} evidence / ${c.verificationStatus}`;
}
