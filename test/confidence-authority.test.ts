import { describe, expect, it } from "vitest";
import {
  describeConfidence,
  isHighConfidenceUnsupported,
  mayAutonomousHighConsequence
} from "../src/core/confidence.js";
import { applyHumanOverride, liveWithoutOverride } from "../src/core/human-authority.js";
import { exampleActorRegistry } from "../src/core/actor-registry.js";

const unsupported = {
  predictionConfidence: 0.97,
  evidenceStrength: "LOW" as const,
  sourceQuality: "LOW" as const,
  agreement: "LOW" as const,
  verificationStatus: "UNVERIFIED" as const
};

const verified = {
  predictionConfidence: 0.7,
  evidenceStrength: "HIGH" as const,
  sourceQuality: "HIGH" as const,
  agreement: "HIGH" as const,
  verificationStatus: "VERIFIED" as const
};

describe("confidence ≠ truth", () => {
  it("keeps 97% confidence / LOW evidence / UNVERIFIED from becoming a fact", () => {
    expect(isHighConfidenceUnsupported(unsupported)).toBe(true);
    expect(mayAutonomousHighConsequence(unsupported)).toBe(false);
    expect(describeConfidence(unsupported)).toContain("UNVERIFIED");
  });

  it("allows verified high-consequence action only with evidence", () => {
    expect(mayAutonomousHighConsequence(verified)).toBe(true);
  });
});

describe("human authority", () => {
  const rec = {
    recommendationId: "rec",
    action: "hold",
    payload: { vanId: "214" },
    confidence: verified,
    issuedAt: "2026-01-01T00:00:00Z"
  };

  it("preserves the original recommendation when a human wins", () => {
    const live = applyHumanOverride(rec, {
      actorId: "lee",
      role: "dispatcher",
      branchId: "branch:midwest-3",
      lockHolderId: "lee",
      reason: "window",
      replacementAction: "dispatch-088",
      replacementPayload: { vanId: "088" },
      at: "2026-01-01T00:01:00Z"
    }, exampleActorRegistry());
    expect(live.winner).toBe("human");
    expect(live.disagreementPreserved).toBe(true);
    expect(live.originalRecommendation.action).toBe("hold");
    expect(live.liveAction).toBe("dispatch-088");
  });

  it("rejects unauthorized overrides", () => {
    expect(() =>
      applyHumanOverride(rec, {
        actorId: "intern",
        role: "technician",
        branchId: "branch:midwest-3",
        lockHolderId: "intern",
        reason: "guess",
        replacementAction: "dispatch",
        replacementPayload: {},
        at: "2026-01-01T00:01:00Z"
      }, exampleActorRegistry())
    ).toThrow(/unauthorized/);
  });

  it("uses the trades action when no override exists", () => {
    expect(liveWithoutOverride(rec).winner).toBe("trades");
  });
});
