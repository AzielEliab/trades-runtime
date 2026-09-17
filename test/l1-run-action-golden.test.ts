import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { goldenReceiptFingerprint, runGoldenAction } from "../src/spine/run-action-golden.js";
import { evaluateDecisionGate } from "../src/inherited/decision-gate.js";

describe("L1 runAction golden fixtures", () => {
  it("same input produces the same receipt hashes and matches the fixture pack", () => {
    const a = runGoldenAction();
    const b = runGoldenAction();
    const fa = goldenReceiptFingerprint(a);
    const fb = goldenReceiptFingerprint(b);
    expect(fa).toEqual(fb);

    const fixture = JSON.parse(readFileSync("test/fixtures/run-action-golden.json", "utf8")) as typeof fa;
    expect(fa).toEqual(fixture);

    expect(a.live.originalRecommendation.action).toBe("dispatch");
    expect(a.live.livePayload.vanId).toBe("088");
    expect(a.disagreementPreserved).toBe(true);
  });

  it("BLOCKs unverified high-consequence without treating wrap as proof", () => {
    const gate = evaluateDecisionGate({
      action: "warranty-deny",
      highConsequence: true,
      defined: true,
      confidence: {
        predictionConfidence: 0.99,
        evidenceStrength: "LOW",
        sourceQuality: "LOW",
        agreement: "LOW",
        verificationStatus: "UNVERIFIED"
      },
      impactAssessed: true,
      integrityOk: true,
      accountableHuman: "mgr-1"
    });
    expect(gate.outcome).toBe("BLOCK");
  });
});
