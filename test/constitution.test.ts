import { describe, expect, it } from "vitest";
import {
  RULES_V01,
  RULES_V02,
  RULES_PROPERTY,
  bookingPrecedence,
  classifyThirtyDayReturn,
  driftIsNotAutomaticFailure,
  explorationRequired,
  humanWins,
  mediaProvesMisconduct,
  nextStateIsActual,
  normalizeSkill,
  receiptRequired,
  rejectGeographyOnlyDecision,
  revenueIsNotSkill,
  unknownWarrantyNotDenied
} from "../src/rules/constitution.js";
import type { Recommendation } from "../src/core/human-authority.js";
import type { CallFitFactors } from "../src/domain/call-fit.js";

const rec: Recommendation = {
  recommendationId: "r1",
  action: "dispatch-214",
  payload: { vanId: "214" },
  confidence: {
    predictionConfidence: 0.8,
    evidenceStrength: "MEDIUM",
    sourceQuality: "HIGH",
    agreement: "MEDIUM",
    verificationStatus: "PARTIAL"
  },
  issuedAt: "2026-01-01T12:00:00Z"
};

const baseFactors: CallFitFactors = {
  quality: 1,
  competence: 1,
  technicalFit: 1,
  clientFit: 1,
  geolocation: 0.2,
  inventory: 1,
  runtime: 1,
  contribution: 1,
  margin: 1,
  scheduleImpact: 1,
  exploration: 1
};

describe("§18 freeze rules", () => {
  it("lists all fifteen constitutional rules", () => {
    expect(RULES_V01).toHaveLength(15);
    expect(RULES_V02).toHaveLength(5);
    expect(RULES_PROPERTY).toHaveLength(6);
  });

  it("human override always wins live operation", () => {
    expect(
      humanWins(rec, {
        actorId: "mgr-1",
        role: "manager",
        authorized: true,
        reason: "customer request",
        replacementAction: "dispatch-088",
        replacementPayload: { vanId: "088" },
        at: "2026-01-01T12:05:00Z"
      })
    ).toBe(true);
  });

  it("route drift rebases instead of scoring automatic failure", () => {
    expect(driftIsNotAutomaticFailure(true)).toBe(true);
    expect(() => driftIsNotAutomaticFailure(false)).toThrow(/rebase/);
  });

  it("existing bookings cannot be silently displaced", () => {
    expect(bookingPrecedence(true, false)).toBe(true);
    expect(() => bookingPrecedence(true, true)).toThrow(/silently displace/);
  });

  it("geography is never the sole final factor", () => {
    expect(() =>
      rejectGeographyOnlyDecision(baseFactors, { ...baseFactors, geolocation: 0.9 })
    ).toThrow(/geography/);
  });

  it("revenue is not skill", () => {
    expect(revenueIsNotSkill(12000, 0.4)).toBe(true);
  });

  it("skill is normalized by difficulty", () => {
    expect(normalizeSkill(150, 2)).toBe(75);
  });

  it("30-day returns are reviewed, not auto-callbacks", () => {
    expect(classifyThirtyDayReturn({
      tiedToPriorWork: false,
      previouslyDeclined: true,
      newIssue: false,
      warranty: false,
      evidenceSufficient: true
    }).kind).toBe("previously-quoted-declined");
    expect(classifyThirtyDayReturn({
      tiedToPriorWork: true,
      previouslyDeclined: false,
      newIssue: false,
      warranty: false,
      evidenceSufficient: false
    }).kind).toBe("indeterminate");
  });

  it("media alone cannot prove misconduct", () => {
    expect(mediaProvesMisconduct(true)).toBe(false);
  });

  it("unknown warranty is never not-covered", () => {
    expect(unknownWarrantyNotDenied("UNKNOWN")).toBe(true);
    expect(unknownWarrantyNotDenied("LOOKUP_FAILED")).toBe(true);
    expect(unknownWarrantyNotDenied("POSSIBLE")).toBe(true);
  });

  it("exploration is required when history would poison skill", () => {
    expect(() => explorationRequired(true, false)).toThrow(/exploration/);
    expect(explorationRequired(true, true)).toBe(true);
  });

  it("material decisions require receipts", () => {
    expect(() => receiptRequired(true, false)).toThrow(/receipts/);
  });

  it("actual state becomes the next starting point", () => {
    const actual = { van: "214", zip: "63101" };
    expect(nextStateIsActual(actual, actual)).toBe(true);
    expect(nextStateIsActual(actual, { van: "088" })).toBe(false);
  });
});
