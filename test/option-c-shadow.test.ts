import { describe, expect, it } from "vitest";
import { applyEngagement, engagementNotice, isEngagementViolation } from "../src/core/engagement-rules.js";
import { exampleActorRegistry } from "../src/core/actor-registry.js";
import { createOneBranchShadowConfig, requestShadowModeChange } from "../src/core/shadow-branch.js";
import {
  assertSealedRecommendationUnchanged,
  requireSettlementFields,
  settleRequired
} from "../src/core/settlement-harness.js";
import { sealCounterfactual, sealedRecommendationHash } from "../src/inherited/shadow-engine.js";
import { runSealedShadowDemo } from "../src/demo/shadow-sealed.js";
import { mayWriteProBooks, refuseProBooksWrite } from "../src/spine/probooks-shadow.js";
import { mayWriteServiceTitan, refuseServiceTitanWrite } from "../src/spine/servicetitan-shadow.js";
import type { ConfidenceSeparation } from "../src/core/confidence.js";

const confidence: ConfidenceSeparation = {
  predictionConfidence: 0.7,
  evidenceStrength: "MEDIUM",
  sourceQuality: "HIGH",
  agreement: "MEDIUM",
  verificationStatus: "PARTIAL"
};

describe("Option C one-branch shadow scaffolding", () => {
  it("never auto-promotes SHADOW-SEALED to SHADOW-VISIBLE", () => {
    const config = createOneBranchShadowConfig({ branchId: "tr:branch:midwest-3" });
    expect(config.mode).toBe("SHADOW-SEALED");
    expect(config.autoPromote).toBe(false);
    expect(config.pilotStarted).toBe(false);
    expect(config.optionC).toBe("code-ready-pilot-not-started");
    expect(config.optionD).toBe("not-started");
    expect(() => requestShadowModeChange(config, "SHADOW-VISIBLE", { kind: "auto" })).toThrow(
      /never auto-promote SHADOW-SEALED to SHADOW-VISIBLE/
    );
    const explicit = requestShadowModeChange(config, "SHADOW-VISIBLE", { kind: "explicit" });
    expect(explicit.mode).toBe("SHADOW-VISIBLE");
    expect(explicit.autoPromote).toBe(false);
    expect(explicit.pilotStarted).toBe(false);
    expect(explicit.fieldLaunch).toBe(false);
  });

  it("drops SHADOW-VISIBLE to SHADOW-SEALED on engagement violation", () => {
    expect(engagementNotice()).toMatch(/This is not an order/);
    expect(isEngagementViolation({ treatedAsTicket: true })).toBe(true);
    expect(applyEngagement("SHADOW-VISIBLE", { treatedAsOrder: true }).mode).toBe("SHADOW-SEALED");
    expect(applyEngagement("SHADOW-VISIBLE", { treatedAsTicket: true }).droppedToSealed).toBe(true);
    expect(applyEngagement("SHADOW-VISIBLE", { complaintAsOrder: true }).mode).toBe("SHADOW-SEALED");
    expect(applyEngagement("SHADOW-SEALED", { treatedAsOrder: true }).mode).toBe("SHADOW-SEALED");
    expect(applyEngagement("SHADOW-VISIBLE", {}).droppedToSealed).toBe(false);

    const visible = requestShadowModeChange(
      createOneBranchShadowConfig({ branchId: "tr:branch:midwest-3", mode: "SHADOW-VISIBLE" }),
      "SHADOW-VISIBLE",
      { kind: "explicit", engagement: { treatedAsTicket: true } }
    );
    expect(visible.mode).toBe("SHADOW-SEALED");
  });

  it("keeps ADVISE-LOCKED gated on the actor registry", () => {
    const config = createOneBranchShadowConfig({ branchId: "tr:branch:midwest-3" });
    expect(() =>
      requestShadowModeChange(config, "ADVISE-LOCKED", { kind: "explicit" })
    ).toThrow(/named lock-holder in the actor registry/);
    expect(() =>
      requestShadowModeChange(config, "ADVISE-LOCKED", {
        kind: "explicit",
        registry: exampleActorRegistry(),
        actorId: "unknown-actor",
        lockHolderId: "unknown-actor",
        at: "2026-09-18T00:00:00Z"
      })
    ).toThrow(/unauthorized/);
    const locked = requestShadowModeChange(config, "ADVISE-LOCKED", {
      kind: "explicit",
      registry: exampleActorRegistry(),
      actorId: "mgr-1",
      lockHolderId: "mgr-1",
      at: "2026-09-18T00:00:00Z"
    });
    expect(locked.mode).toBe("ADVISE-LOCKED");
    expect(locked.pilotStarted).toBe(false);
  });

  it("requires settlement fields and refuses hindsight rewrite", () => {
    expect(() => requireSettlementFields({})).toThrow(/settlement receipt missing required fields/);
    expect(() =>
      requireSettlementFields({
        plannedAction: "dispatch",
        contemporaneousEvidenceHash: "abc",
        prediction_confidence: 0.7,
        evidence_strength: "MEDIUM",
        source_quality: "HIGH",
        cross_source_agreement: "MEDIUM",
        verification_status: "PARTIAL",
        actualOutcome: { ok: true },
        timeToSettleMs: 10
      })
    ).toThrow(/humanOverride/);

    const sealed = sealCounterfactual({
      knownInputs: { call: "synthetic-1" },
      action: "dispatch",
      expected: { vanId: "tr:van:214" },
      confidence,
      sealedAt: "2026-09-14T12:00:00Z"
    });
    const settled = settleRequired(sealed, { vanId: "tr:van:088" }, { settledAt: "2026-09-14T18:00:00Z" });
    expect(settled.plannedAction).toBe("dispatch");
    expect(settled.contemporaneousEvidenceHash).toHaveLength(64);
    expect(settled.prediction_confidence).toBe(0.7);
    expect(settled.evidence_strength).toBe("MEDIUM");
    expect(settled.source_quality).toBe("HIGH");
    expect(settled.cross_source_agreement).toBe("MEDIUM");
    expect(settled.verification_status).toBe("PARTIAL");
    expect(settled.humanOverride).toBeNull();
    expect(settled.actualOutcome).toEqual({ vanId: "tr:van:088" });
    expect(settled.timeToSettleMs).toBe(6 * 60 * 60 * 1000);
    expect(settled.sealedRecommendationHash).toBe(sealedRecommendationHash(sealed));

    const rewritten = {
      ...sealed,
      action: "cancel"
    };
    expect(() =>
      assertSealedRecommendationUnchanged(sealed, {
        plannedAction: "cancel",
        sealedRecommendationHash: sealedRecommendationHash(rewritten),
        sealed: rewritten
      })
    ).toThrow(/hindsight must not rewrite a sealed recommendation/);
  });

  it("runs N synthetic sealed days and still throws on writes", () => {
    const proof = runSealedShadowDemo();
    expect(proof.synthetic).toBe(true);
    expect(proof.customerData).toBe(false);
    expect(proof.pilotStarted).toBe(false);
    expect(proof.fieldLaunch).toBe(false);
    expect(proof.optionC).toBe("code-ready-pilot-not-started");
    expect(proof.optionD).toBe("not-started");
    expect(proof.mode).toBe("SHADOW-SEALED");
    expect(proof.autoPromote).toBe(false);
    expect(proof.autoPromoteRefused).toBe(true);
    expect(proof.days).toBe(3);
    expect(proof.settlementHashes).toHaveLength(3);
    expect(proof.writesThrew).toBe(true);
    expect(proof.mayWriteServiceTitan).toBe(false);
    expect(proof.mayWriteProBooks).toBe(false);

    for (const row of proof.settlements) {
      expect(row.mode).toBe("SHADOW-SEALED");
      expect(row.plannedAction.length).toBeGreaterThan(0);
      expect(row.contemporaneousEvidenceHash).toHaveLength(64);
      expect(row.sealedRecommendationHash).toHaveLength(64);
      expect(row.settlementHash).toHaveLength(64);
      expect(row.hindsightLeak).toBe(false);
      expect(typeof row.prediction_confidence).toBe("number");
      expect(row.evidence_strength).toBeTruthy();
      expect(row.source_quality).toBeTruthy();
      expect(row.cross_source_agreement).toBeTruthy();
      expect(row.verification_status).toBeTruthy();
      expect("humanOverride" in row).toBe(true);
      expect(row.actualOutcome).toBeTruthy();
      expect(typeof row.timeToSettleMs).toBe("number");
    }

    expect(mayWriteServiceTitan()).toBe(false);
    expect(mayWriteProBooks()).toBe(false);
    expect(() => refuseServiceTitanWrite("job.update")).toThrow(/refused/);
    expect(() => refuseProBooksWrite("item.update")).toThrow(/refused/);
  });
});
