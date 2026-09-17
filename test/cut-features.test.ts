import { describe, expect, it } from "vitest";
import {
  exampleActorRegistry,
  grantAuthority,
  registerActor
} from "../src/core/actor-registry.js";
import { applyHumanOverride } from "../src/core/human-authority.js";
import { applyManagerDecision, type PricebookRecommendation } from "../src/domain/pricebook.js";
import {
  ingestServiceTitanCustomer,
  ingestServiceTitanEquipment,
  ingestServiceTitanJob,
  ingestServiceTitanPricebook,
  mayWriteServiceTitan,
  openServiceTitanShadowClient,
  refuseServiceTitanWriteMethod,
  type NoCompiledStWrite
} from "../src/spine/servicetitan-shadow.js";
import {
  emptyFulfillmentStream,
  fulfillmentTrail,
  runFulfillmentTo,
  transitionFulfillment
} from "../src/domain/fulfillment-machine.js";
import {
  applyCompletion,
  lockMissionGoal,
  openMissionDay,
  retargetGoal
} from "../src/domain/mission-board.js";
import {
  appendImprovementFromCompletedJob,
  attachJobToAddress,
  jobPatternIsNotDefect
} from "../src/domain/property-jobs.js";
import { neighborhoodPatternProvesSubjectDefect } from "../src/domain/neighborhood-failure-patterns.js";
import { repairCostEqualsResaleUplift } from "../src/domain/property-improvement-ledger.js";
import { parseShadowMode, mayAdviseLock } from "../src/core/shadow-modes.js";

const rec = {
  recommendationId: "rec",
  action: "hold",
  payload: {},
  confidence: {
    predictionConfidence: 0.7,
    evidenceStrength: "HIGH" as const,
    sourceQuality: "HIGH" as const,
    agreement: "HIGH" as const,
    verificationStatus: "VERIFIED" as const
  },
  issuedAt: "2026-09-17T12:00:00Z"
};

describe("TR-CUT feature 6 actor / authority registry", () => {
  it("requires named role, branch scope, and lock-holder id — not a bare boolean", () => {
    const registry = exampleActorRegistry();
    const grant = grantAuthority(registry, {
      actorId: "mgr-1",
      action: "LOCK",
      branchId: "branch:midwest-3",
      lockHolderId: "mgr-1",
      at: "2026-09-17T12:00:00Z"
    });
    expect(grant.lockHolderId).toBe("mgr-1");
    expect(grant.branchId).toBe("branch:midwest-3");
    expect(grant.role).toBe("manager");

    expect(() =>
      applyHumanOverride(rec, {
        actorId: "intern",
        role: "technician",
        branchId: "branch:midwest-3",
        lockHolderId: "intern",
        reason: "flag",
        replacementAction: "dispatch",
        replacementPayload: {},
        at: "t",
        authorized: true
      }, registry)
    ).toThrow(/unauthorized/);

    const locked: PricebookRecommendation = {
      recommendationId: "pb-cut",
      sku: "SKU-1",
      oemPart: "OEM-1",
      proposedPrice: 100,
      locked: false
    };
    const { live, ledger } = applyManagerDecision(locked, "LOCK", {
      actorId: "mgr-1",
      role: "manager",
      branchId: "branch:midwest-3",
      lockHolderId: "mgr-1",
      reason: "lock OEM",
      replacementAction: "pricebook:lock",
      replacementPayload: { proposedPrice: 100 },
      at: "2026-09-17T12:00:00Z"
    }, registry);
    expect(live.lockHolder).toBe("mgr-1");
    expect(ledger.receipts[0]?.body.lockHolderId).toBe("mgr-1");
    expect(ledger.receipts[0]?.body.branchId).toBe("branch:midwest-3");
  });

  it("refuses an actor outside branch scope", () => {
    const registry = registerActor(exampleActorRegistry(), {
      actorId: "mgr-other",
      displayName: "Other",
      role: "manager",
      branchIds: ["branch:other"]
    });
    expect(() =>
      grantAuthority(registry, {
        actorId: "mgr-other",
        action: "ACCEPT",
        branchId: "branch:midwest-3",
        lockHolderId: "mgr-other",
        at: "t"
      })
    ).toThrow(/no grant/);
  });
});

describe("TR-CUT feature 7 ST shadow read-only", () => {
  it("ingests job / pricebook / equipment / customer via FragGate and compiles no write path", () => {
    const job = ingestServiceTitanJob("1042", "2026-09-17T12:00:00Z", { jobType: "no-cool" });
    const book = ingestServiceTitanPricebook("sku-1", "2026-09-17T12:00:00Z", { price: 399 });
    const equip = ingestServiceTitanEquipment("eq-9", "2026-09-17T12:00:00Z", { ageYears: 14 });
    const customer = ingestServiceTitanCustomer("c-1", "2026-09-17T12:00:00Z", { nameHash: "x" });
    expect(job.hash).toHaveLength(64);
    expect(book.packet.sourceType).toBe("servicetitan");
    expect(equip.inbound.verificationStatus).toBe("UNVERIFIED");
    expect(customer.write).toBe(false);
    expect(mayWriteServiceTitan()).toBe(false);
    expect(() => refuseServiceTitanWriteMethod("POST")).toThrow(/POST/);
    expect(() => refuseServiceTitanWriteMethod("PUT")).toThrow(/PUT/);
    expect(() => refuseServiceTitanWriteMethod("PATCH")).toThrow(/PATCH/);

    const noWrite: NoCompiledStWrite = true;
    expect(noWrite).toBe(true);
    const client = openServiceTitanShadowClient();
    expect(client.writes).toBe(false);
    expect("post" in client).toBe(false);
    expect("put" in client).toBe(false);
    expect("patch" in client).toBe(false);
  });
});

describe("TR-CUT feature 8 fulfillment state machine", () => {
  it("walks REQUESTED → … → RECONCILED on the event stream", () => {
    const started = {
      requestId: "sr:call-1:OEM",
      callId: "call-1",
      vanId: "214",
      partNumber: "OEM",
      quantity: 1,
      location: "BRANCH_STOCK" as const,
      step: "REQUESTED" as const
    };
    const first = transitionFulfillment(started, emptyFulfillmentStream(), "2026-09-17T08:00:00Z");
    expect(first.request.step).toBe("CLAIMED");
    expect(first.event.kind).toBe("fulfillment:CLAIMED");
    expect(first.event.source).toBe("trades-runtime:fulfillment");

    const done = runFulfillmentTo(started, "RECONCILED", emptyFulfillmentStream(), "2026-09-17T16:00:00Z");
    expect(done.request.step).toBe("RECONCILED");
    expect(fulfillmentTrail(done.stream)).toEqual([
      "CLAIMED",
      "PICKING",
      "READY",
      "TRANSFER",
      "DELIVERED",
      "INSTALLED",
      "RECONCILED"
    ]);
  });
});

describe("TR-CUT feature 9 mission board clock", () => {
  it("is one branch / one day, updates KPIs from completions, and lets a human lock a goal", () => {
    let board = openMissionDay({
      branchId: "branch:midwest-3",
      day: "2026-09-17",
      openedAt: "2026-09-17T07:00:00Z",
      closesAt: "2026-09-17T18:00:00Z",
      clock: "2026-09-17T12:30:00Z",
      goals: [{ id: "calls", measure: "calls-completed", target: 40, actual: 10 }]
    });
    expect(board.branchId).toBe("branch:midwest-3");
    expect(board.day).toBe("2026-09-17");
    expect(board.goals[0]?.expectedPace).toBeCloseTo(20, 5);

    board = applyCompletion(board, "calls-completed", 5, "2026-09-17T13:00:00Z");
    expect(board.goals[0]?.actual).toBe(15);
    expect(board.goals[0]?.remainingGap).toBe(25);

    board = lockMissionGoal(board, "calls", "mgr-1");
    expect(board.lockHolders.calls).toBe("mgr-1");
    expect(() => retargetGoal(board, "calls", 99)).toThrow(/locked mission goal/);
  });
});

describe("TR-CUT feature 10 PI wired to jobs", () => {
  it("attaches a job to an address and appends the improvement ledger from completed work", () => {
    const attached = attachJobToAddress({
      jobId: "job-1042",
      address: "100 Main St",
      branchId: "branch:midwest-3",
      trade: "hvac",
      status: "completed",
      work: "capacitor + clean",
      cost: 420,
      completedAt: "2026-09-17T16:00:00Z"
    });
    expect(attached.job.propertyId).toBe(attached.property.propertyId);
    const { entry } = appendImprovementFromCompletedJob(attached.property, attached.job);
    expect(entry.cost).toBe(420);
    expect(entry.estimatedValueEffect.mid).not.toBe(420);
    expect(repairCostEqualsResaleUplift()).toBe(false);
    expect(
      jobPatternIsNotDefect({
        patternId: "p1",
        kind: "ObservedNeighborhoodPattern",
        trade: "hvac",
        patternClass: "equipment-family-failure",
        neighborhoodId: "n-west",
        comparableCaseCount: 6,
        riskLevel: "high",
        evidenceBasis: "nearby failures",
        verifiedOnSubjectProperty: false
      }).proofOfSubjectDefect
    ).toBe(false);
    expect(neighborhoodPatternProvesSubjectDefect()).toBe(false);
  });
});

describe("shadow modes", () => {
  it("exposes SHADOW-SEALED / SHADOW-VISIBLE / ADVISE-LOCKED", () => {
    expect(parseShadowMode("SHADOW-SEALED")).toBe("SHADOW-SEALED");
    expect(parseShadowMode("SHADOW-VISIBLE")).toBe("SHADOW-VISIBLE");
    expect(mayAdviseLock("ADVISE-LOCKED")).toBe(true);
    expect(mayAdviseLock("SHADOW-SEALED")).toBe(false);
  });
});
