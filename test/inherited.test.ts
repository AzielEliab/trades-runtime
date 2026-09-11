import { describe, expect, it } from "vitest";
import { wrapEvidence } from "../src/inherited/evidence-packet.js";
import { comparePaths, refuseFabricatedEvidence } from "../src/inherited/trades-coherence.js";
import { evaluateDecisionGate } from "../src/inherited/decision-gate.js";
import { appendReceipt, createLedger, verifyLedger } from "../src/inherited/receipt-ledger.js";
import { sealCounterfactual, settleShadow } from "../src/inherited/shadow-engine.js";
import { openMorningPlan, rebaseFromActual } from "../src/inherited/trajectory-engine.js";
import { appendRecord, emptyChain } from "../src/core/chains.js";

const mid = {
  predictionConfidence: 0.7,
  evidenceStrength: "MEDIUM" as const,
  sourceQuality: "HIGH" as const,
  agreement: "MEDIUM" as const,
  verificationStatus: "PARTIAL" as const
};

describe("inherited engines", () => {
  it("EvidencePacket hashes content and treats trust as metadata", () => {
    const packet = wrapEvidence({
      sourceId: "st:1",
      sourceType: "servicetitan",
      receivedAt: "2026-01-01T00:00:00Z",
      trust: "HIGH",
      tags: [],
      claims: ["serial"],
      body: { serial: "ABC" }
    });
    expect(packet.contentHash).toHaveLength(64);
  });

  it("TradesCoherence refuses fabricated evidence", () => {
    expect(() =>
      refuseFabricatedEvidence({
        id: "p",
        claim: "covered",
        action: "warranty-confirm",
        confidence: mid,
        evidenceIds: [],
        fabricated: true
      })
    ).toThrow(/fabricated/);
  });

  it("TradesCoherence HOLDs unsupported evidence tokens", () => {
    const result = comparePaths(
      { id: "p", claim: "a", action: "a", confidence: mid, evidenceIds: ["missing"] },
      { id: "q", claim: "a", action: "a", confidence: mid, evidenceIds: ["missing"] },
      []
    );
    expect(result.verdict).toBe("HOLD");
  });

  it("DecisionGate BLOCKs high-consequence action with unverified evidence", () => {
    const gate = evaluateDecisionGate({
      action: "warranty-deny",
      highConsequence: true,
      defined: true,
      confidence: {
        predictionConfidence: 0.97,
        evidenceStrength: "LOW",
        sourceQuality: "LOW",
        agreement: "LOW",
        verificationStatus: "UNVERIFIED"
      },
      impactAssessed: true,
      integrityOk: true,
      accountableHuman: "mgr"
    });
    expect(gate.outcome).toBe("BLOCK");
  });

  it("ReceiptLedger hash-chains and verifies", () => {
    let ledger = createLedger();
    ledger = appendReceipt(ledger, {
      receiptId: "1",
      kind: "recommendation",
      at: "t",
      body: { ok: true }
    });
    ledger = appendReceipt(ledger, {
      receiptId: "2",
      kind: "outcome",
      at: "t2",
      body: { ok: false }
    });
    expect(verifyLedger(ledger)).toBe(true);
  });

  it("ShadowEngine seals counterfactuals and rejects hindsight leakage", () => {
    const sealed = sealCounterfactual({
      knownInputs: { zip: "63101" },
      action: "dispatch",
      expected: { van: "214" },
      confidence: mid,
      sealedAt: "t"
    });
    const settled = settleShadow(sealed, { van: "088" });
    expect(settled.deltas.van?.actual).toBe("088");
    expect(() => settleShadow(sealed, { van: "088" }, { later: true })).toThrow(/hindsight/);
  });

  it("TrajectoryEngine rebases from actual state", () => {
    let day = openMorningPlan("d1", { stop: 1 }, "07:00");
    day = rebaseFromActual(day, { stop: 2 }, "10:00");
    expect(day.current).toEqual({ stop: 2 });
    expect(day.chain.records.map((r) => r.kind)).toEqual(["morning-plan", "rebase"]);
  });

  it("never overwrites a chain record in place", () => {
    const chain = emptyChain("C");
    const first = appendRecord(chain, {
      chain: "C",
      recordId: "c1",
      at: "t",
      recommendationId: "r",
      actorId: "h",
      role: "manager",
      reason: "x",
      originalAction: "a",
      replacementAction: "b"
    });
    expect(first.records).toHaveLength(1);
    expect(() =>
      appendRecord(first, {
        chain: "C",
        recordId: "c2",
        prevRecordId: "wrong-tip",
        at: "t2",
        recommendationId: "r",
        actorId: "h",
        role: "manager",
        reason: "x",
        originalAction: "a",
        replacementAction: "c"
      })
    ).toThrow(/tip/);
  });
});
