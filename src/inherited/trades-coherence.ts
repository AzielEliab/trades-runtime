import { isHighConfidenceUnsupported, type ConfidenceSeparation } from "../core/confidence.js";
import type { EvidencePacket } from "./evidence-packet.js";

export type CoherenceVerdict = "PASS" | "FLAG" | "HOLD" | "HUMAN_REVIEW";

export interface ReasoningPath {
  id: string;
  claim: string;
  action: string;
  confidence: ConfidenceSeparation;
  evidenceIds: string[];
  fabricated?: boolean;
}

export interface CoherenceResult {
  verdict: CoherenceVerdict;
  reasons: string[];
  primary: ReasoningPath;
  alternate: ReasoningPath;
}

export function refuseFabricatedEvidence(path: ReasoningPath): void {
  if (path.fabricated) {
    throw new Error("TradesCoherence refuses fabricated evidence");
  }
}

export function comparePaths(
  primary: ReasoningPath,
  alternate: ReasoningPath,
  packets: EvidencePacket[]
): CoherenceResult {
  refuseFabricatedEvidence(primary);
  refuseFabricatedEvidence(alternate);

  const reasons: string[] = [];
  const known = new Set(packets.map((p) => p.sourceId));
  for (const id of [...primary.evidenceIds, ...alternate.evidenceIds]) {
    if (!known.has(id)) {
      reasons.push(`unsupported evidence token: ${id}`);
    }
  }

  if (isHighConfidenceUnsupported(primary.confidence)) {
    reasons.push("confidence without evidence (primary)");
  }
  if (isHighConfidenceUnsupported(alternate.confidence)) {
    reasons.push("confidence without evidence (alternate)");
  }
  if (primary.claim !== alternate.claim || primary.action !== alternate.action) {
    reasons.push("primary and alternate paths disagree");
  }

  let verdict: CoherenceVerdict = "PASS";
  if (reasons.some((r) => r.startsWith("unsupported"))) {
    verdict = "HOLD";
  } else if (reasons.includes("primary and alternate paths disagree")) {
    verdict = "HUMAN_REVIEW";
  } else if (reasons.some((r) => r.includes("confidence without evidence"))) {
    verdict = "FLAG";
  }

  return { verdict, reasons, primary, alternate };
}
