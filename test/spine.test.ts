import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  admitInbound,
  admitInboundOrThrow,
  wrapperIsVerification
} from "../src/spine/fraggate-inbound.js";
import { DurableReceiptStore } from "../src/spine/durable-receipts.js";
import { runAction } from "../src/spine/run-action.js";
import {
  ingestServiceTitanShadow,
  mayWriteServiceTitan,
  refuseServiceTitanWrite
} from "../src/spine/servicetitan-shadow.js";
import { verifyLedger } from "../src/inherited/receipt-ledger.js";
import type { ConfidenceSeparation } from "../src/core/confidence.js";
import type { ReasoningPath } from "../src/inherited/trades-coherence.js";

const mid: ConfidenceSeparation = {
  predictionConfidence: 0.7,
  evidenceStrength: "MEDIUM",
  sourceQuality: "HIGH",
  agreement: "MEDIUM",
  verificationStatus: "PARTIAL"
};

function pathFor(id: string, packetId: string, action = "dispatch"): ReasoningPath {
  return {
    id,
    claim: "dispatch-van-214",
    action,
    confidence: mid,
    evidenceIds: [packetId]
  };
}

describe("4a FragGate inbound", () => {
  it("admits authorized inbound only after validation and does not treat wrap as verification", () => {
    const admitted = admitInbound({
      sourceKind: "servicetitan",
      sourceId: "st:job:1",
      receivedAt: "2026-09-17T00:00:00Z",
      body: { jobId: 1 },
      treatAsVerified: true
    });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) throw new Error("expected admit");
    expect(admitted.packet.contentHash).toHaveLength(64);
    expect(admitted.packet.body.jobId).toBe(1);
    expect(admitted.verificationStatus).toBe("UNVERIFIED");
    expect(admitted.wrapperIsVerification).toBe(false);
    expect(admitted.treatAsVerified).toBe(false);
    expect(wrapperIsVerification(admitted.packet)).toBe(false);
  });

  it("refuses scrape and unauthorized source kinds", () => {
    for (const sourceKind of ["unauthorized-scrape", "scrape", "listing-scrape"] as const) {
      const refused = admitInbound({
        sourceKind,
        sourceId: "x",
        receivedAt: "t",
        body: { url: "https://example.invalid" }
      });
      expect(refused.ok).toBe(false);
      if (refused.ok) throw new Error("expected refuse");
      expect(refused.code).toBe("FG-REFUSE-SCRAPE");
      expect(refused.reason).toMatch(/scraping/);
    }
    expect(() =>
      admitInboundOrThrow({
        sourceKind: "unauthorized",
        sourceId: "x",
        receivedAt: "t",
        body: {}
      })
    ).toThrow(/FG-REFUSE-UNAUTHORIZED|scraping|unauthorized/);
  });

  it("refuses unknown kinds and empty identity", () => {
    expect(admitInbound({ sourceKind: "dark-web-dump", sourceId: "x", receivedAt: "t", body: {} }).ok).toBe(false);
    expect(admitInbound({ sourceKind: "servicetitan", sourceId: "", receivedAt: "t", body: {} }).ok).toBe(false);
  });

  it("admits approved property sources as authorized-property packets", () => {
    const admitted = admitInboundOrThrow({
      sourceKind: "county-assessor",
      sourceId: "parcel:1",
      receivedAt: "2026-09-17T00:00:00Z",
      body: { assessedValue: 180000 }
    });
    expect(admitted.packet.sourceType).toBe("authorized-property");
    expect(admitted.verificationStatus).toBe("UNVERIFIED");
  });
});

describe("4b durable receipts", () => {
  it("survives process restart and keeps hash-chain continuity", () => {
    const dir = mkdtempSync(join(tmpdir(), "tr-receipts-"));
    const filePath = join(dir, "receipts.jsonl");
    try {
      const first = new DurableReceiptStore(filePath);
      const rec = first.append({
        receiptId: "r1",
        kind: "recommendation",
        at: "t1",
        body: { action: "dispatch" }
      });
      const frozen = first.freeze(
        {
          at: "t2",
          recommendation: {
            recommendationId: "r1",
            action: "dispatch",
            payload: { vanId: "214" },
            confidence: mid,
            issuedAt: "t1"
          },
          evidence: [],
          override: {
            actorId: "mgr-1",
            role: "manager",
            authorized: true,
            reason: "customer request",
            replacementAction: "dispatch-088",
            replacementPayload: { vanId: "088" },
            at: "t2"
          },
          outcome: { vanId: "088" }
        },
        "freeze-1"
      );
      expect(rec.hash).toHaveLength(64);
      expect(frozen.body.freeze).toBe(true);
      expect(first.verify()).toBe(true);
      const tip = first.tip();

      const restarted = new DurableReceiptStore(filePath);
      const loaded = restarted.load();
      expect(loaded.receipts).toHaveLength(2);
      expect(verifyLedger(loaded)).toBe(true);
      expect(restarted.tip()).toBe(tip);
      expect(loaded.receipts[0]?.receiptId).toBe("r1");
      expect(loaded.receipts[1]?.kind).toBe("lifecycle");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("4c runAction pipeline", () => {
  it("walks packet → lock → paths → coherence → gate → receipt → override → shadow settle", () => {
    const admitted = admitInboundOrThrow({
      sourceKind: "servicetitan",
      sourceId: "st:job:1042",
      receivedAt: "2026-09-17T12:00:00Z",
      body: { issue: "no-cool" }
    });
    const result = runAction({
      actionId: "act-1",
      action: "dispatch",
      payload: { vanId: "214" },
      packets: [admitted.packet],
      primary: pathFor("primary", admitted.packet.sourceId),
      alternate: pathFor("alternate", admitted.packet.sourceId),
      confidence: mid,
      highConsequence: true,
      defined: true,
      impactAssessed: true,
      integrityOk: true,
      accountableHuman: "mgr-1",
      knownInputs: { call: "1042" },
      expected: { vanId: "214" },
      override: {
        actorId: "mgr-1",
        role: "manager",
        authorized: true,
        reason: "customer requested 088",
        replacementAction: "dispatch",
        replacementPayload: { vanId: "088" },
        at: "2026-09-17T12:06:00Z"
      },
      actual: { vanId: "088" },
      at: "2026-09-17T12:05:00Z"
    });

    expect(result.evidenceLockHash).toHaveLength(64);
    expect(result.coherence.verdict).toBe("PASS");
    expect(result.gateRequired).toBe(true);
    expect(result.gate?.outcome).toBe("PASS");
    expect(result.live.winner).toBe("human");
    expect(result.disagreementPreserved).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.settlement?.deltas.vanId?.actual).toBe("088");
    expect(result.receipts.map((r) => r.kind)).toEqual(["evidence", "recommendation", "override", "outcome"]);
    expect(verifyLedger(result.ledger)).toBe(true);
  });

  it("forces high-consequence through DecisionGate and blocks without override", () => {
    const admitted = admitInboundOrThrow({
      sourceKind: "technician-note",
      sourceId: "note:1",
      receivedAt: "t",
      body: { claim: "deny warranty" }
    });
    const result = runAction({
      actionId: "act-block",
      action: "warranty-deny",
      payload: { covered: false },
      packets: [admitted.packet],
      primary: pathFor("p", admitted.packet.sourceId, "warranty-deny"),
      alternate: pathFor("a", admitted.packet.sourceId, "warranty-deny"),
      confidence: {
        predictionConfidence: 0.97,
        evidenceStrength: "LOW",
        sourceQuality: "LOW",
        agreement: "LOW",
        verificationStatus: "UNVERIFIED"
      },
      highConsequence: true,
      defined: true,
      impactAssessed: true,
      integrityOk: true,
      accountableHuman: "mgr-1",
      knownInputs: {},
      expected: { covered: false },
      at: "t"
    });
    expect(result.gateRequired).toBe(true);
    expect(result.gate?.outcome).toBe("BLOCK");
    expect(result.executed).toBe(false);
    expect(result.live.winner).toBe("trades");
  });

  it("lets an authorized human win after a blocked gate and persists across restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "tr-action-"));
    const filePath = join(dir, "chain-c.jsonl");
    try {
      const store = new DurableReceiptStore(filePath);
      const admitted = admitInboundOrThrow({
        sourceKind: "manager",
        sourceId: "mgr-note",
        receivedAt: "t",
        body: { note: "override after block" }
      });
      const result = runAction({
        actionId: "act-override-block",
        action: "warranty-deny",
        payload: { covered: false },
        packets: [admitted.packet],
        primary: pathFor("p", admitted.packet.sourceId, "warranty-deny"),
        alternate: pathFor("a", admitted.packet.sourceId, "warranty-deny"),
        confidence: {
          predictionConfidence: 0.97,
          evidenceStrength: "LOW",
          sourceQuality: "LOW",
          agreement: "LOW",
          verificationStatus: "UNVERIFIED"
        },
        highConsequence: true,
        defined: true,
        impactAssessed: true,
        integrityOk: true,
        accountableHuman: "mgr-1",
        knownInputs: {},
        expected: { covered: false },
        override: {
          actorId: "mgr-1",
          role: "manager",
          authorized: true,
          reason: "known covered under OEM",
          replacementAction: "warranty-confirm",
          replacementPayload: { covered: true },
          at: "t2"
        },
        at: "t",
        persist: store
      });
      expect(result.gate?.outcome).toBe("BLOCK");
      expect(result.live.winner).toBe("human");
      expect(result.disagreementPreserved).toBe(true);
      expect(result.executed).toBe(true);

      const restarted = new DurableReceiptStore(filePath);
      const loaded = restarted.load();
      expect(loaded.receipts.length).toBeGreaterThanOrEqual(3);
      expect(verifyLedger(loaded)).toBe(true);
      expect(loaded.receipts.some((r) => r.kind === "override")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("4d ServiceTitan shadow read-only", () => {
  it("ingests and hashes ST-shaped records and refuses writes", () => {
    const ingested = ingestServiceTitanShadow({
      entity: "job",
      stId: "1042",
      receivedAt: "2026-09-17T12:00:00Z",
      payload: { status: "Scheduled", jobType: "no-cool" }
    });
    expect(ingested.ok).toBe(true);
    expect(ingested.live).toBe(false);
    expect(ingested.write).toBe(false);
    expect(ingested.hash).toHaveLength(64);
    expect(ingested.packet.sourceType).toBe("servicetitan");
    expect(ingested.inbound.verificationStatus).toBe("UNVERIFIED");
    expect(mayWriteServiceTitan()).toBe(false);
    expect(() => refuseServiceTitanWrite("dispatch.update")).toThrow(/live ServiceTitan writes are refused/);
  });
});
