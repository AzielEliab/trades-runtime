import { describe, expect, it } from "vitest";
import {
  attachEvent,
  bindWarehouseDemand,
  CHANNEL_KINDS,
  createManagedChannel,
  emitChannelEvent
} from "../src/domain/communications.js";
import { fireRecognition, mayRecognize, rewardRawRevenueAlone } from "../src/domain/recognition.js";
import { CORE_MEASURES, GOAL_SCOPES, missionBoard } from "../src/domain/mission-board.js";
import {
  applyShadowBaseline,
  collectEvidenceWhileLocked,
  recommendFromShadowBaseline,
  refuseLockedAutoRecalibrate,
  type PricebookInputs,
  type PricebookRecommendation
} from "../src/domain/pricebook.js";
import {
  economicsForLocation,
  fulfillmentQueueFromDemand,
  recommendVanProfile,
  STOCK_LOCATIONS
} from "../src/domain/truck-stock.js";

const inputs: PricebookInputs = {
  repairFrequency: 12,
  predictedDemand: 8,
  alreadyOnAssignedVan: false,
  currentCost: 180,
  lastCost: 175,
  averageCost: 178,
  expectedContribution: 220,
  premiumMarginTarget: 0.45,
  availabilityDays: 2,
  leadTimeDays: 3,
  freightCost: 18,
  freightDelayDays: 1,
  procurementBurden: 20,
  laborHours: 2.5,
  jobDifficulty: 1.1,
  accessDifficulty: 1,
  expectedRuntime: 90,
  oemPart: "OEM-COND-14",
  vendorSku: "COND-14",
  compatibilityEvidence: true,
  historicalReturns: 0.04,
  firstTripEffect: 0.1,
  realizedMargin: 0.32
};

const locked: PricebookRecommendation = {
  recommendationId: "pb-lock",
  sku: "COND-14",
  oemPart: "OEM-COND-14",
  proposedPrice: 399,
  locked: true,
  lockHolder: "mgr-1"
};

const jobBase = {
  revenue: 1500,
  warrantyRecovery: 0,
  parts: 200,
  procurement: 40,
  loadedLabor: 300,
  callbackRework: 0,
  concessions: 0,
  laborHours: 3
};

describe("v0.2 communications on the canonical event stream", () => {
  it("creates permissioned channels and links lifecycle to events", () => {
    expect(CHANNEL_KINDS).toContain("incident");
    expect(() => createManagedChannel({
      channelId: "ch-1",
      kind: "dispatch",
      title: "Dispatch",
      moderators: ["tech-9"]
    }, { actorId: "tech-9", role: "technician", authorized: false })).toThrow(/authorized manager/);

    const channel = createManagedChannel({
      channelId: "ch-wh",
      kind: "warehouse",
      title: "Branch 3 warehouse",
      moderators: ["mgr-1"]
    }, { actorId: "mgr-1", role: "manager", authorized: true });
    const created = emitChannelEvent(channel, "channel-created", { title: channel.title }, "2026-09-11T13:00:00Z");
    const linked = attachEvent(channel, created);
    expect(created.source).toBe("trades-runtime:comms");
    expect(linked.eventIds).toContain(created.eventId);

    const bound = bindWarehouseDemand(linked, ["sr:call-1:OEM-COND-14"], "2026-09-11T13:01:00Z");
    expect(bound.event.kind).toBe("warehouse-demand");
    expect(bound.channel.eventIds).toHaveLength(2);
  });
});

describe("v0.2 recognition cannot fire on raw revenue alone", () => {
  it("refuses revenue-only celebration even at high ticket value", () => {
    expect(rewardRawRevenueAlone()).toBe(false);
    expect(mayRecognize({
      kind: "high-value-quality",
      revenue: 24000,
      qualityOk: false,
      callbackAcceptable: false
    })).toBe(false);
    expect(() => fireRecognition({
      kind: "high-value-quality",
      revenue: 24000,
      qualityOk: false,
      callbackAcceptable: false
    }, "t")).toThrow(/raw revenue alone/);
    expect(() => fireRecognition({
      kind: "successful-repair",
      revenue: 900,
      qualityOk: true,
      callbackAcceptable: true,
      rawRevenueOnly: true
    }, "t")).toThrow(/raw revenue alone/);
    expect(fireRecognition({
      kind: "successful-repair",
      revenue: 420,
      qualityOk: true,
      callbackAcceptable: true
    }, "t").fired).toBe(true);
  });
});

describe("v0.2 mission board computes pace, gap, and projected finish", () => {
  it("exposes role scopes and core measures", () => {
    expect(GOAL_SCOPES).toEqual(["company", "region", "branch", "team", "role"]);
    expect(CORE_MEASURES).toContain("first-trip-completion");
    const [row] = missionBoard([{
      id: "equip",
      measure: "equipment-sales",
      scope: "branch",
      target: 10,
      actual: 4,
      elapsedFraction: 0.5
    }]);
    expect(row?.expectedPace).toBe(5);
    expect(row?.remainingGap).toBe(6);
    expect(row?.projectedFinish).toBe(8);
  });
});

describe("v0.2 LOCK prevents auto pricebook change", () => {
  it("keeps the live price when locked and only records reconsideration evidence", () => {
    const rec = recommendFromShadowBaseline("pb-new", 410, inputs);
    expect(rec.source).toBe("servicetitan-shadow");
    expect(rec.shadowBaseline).toBe(true);
    expect(() => refuseLockedAutoRecalibrate(locked)).toThrow(/cannot be auto-recalibrated/);
    expect(() => applyShadowBaseline(locked, 199)).toThrow(/cannot be auto-recalibrated/);
    const evidence = collectEvidenceWhileLocked(locked, "realized margin drifted");
    expect(evidence.superseded).toBe(false);
    expect(evidence.live.proposedPrice).toBe(399);
  });
});

describe("v0.2 inventory location affects completion and economics", () => {
  it("makes ON_VAN cheaper and more completable than BACKORDERED", () => {
    expect(STOCK_LOCATIONS).toHaveLength(7);
    const onVan = economicsForLocation(jobBase, "ON_VAN");
    const backordered = economicsForLocation(jobBase, "BACKORDERED");
    expect(onVan.completionProbability).toBeGreaterThan(backordered.completionProbability);
    expect(onVan.procurement).toBeLessThan(backordered.procurement);
    expect(onVan.realizedContribution).toBeGreaterThan(backordered.realizedContribution);
  });

  it("builds a van profile and a warehouse queue from live job demand", () => {
    const actions = recommendVanProfile({
      vanId: "214",
      territory: "north-city",
      callMix: { "no-cool": 0.6 },
      skillProfile: ["service-2"],
      consumption: { "COND-14": 4, "CAP-5": 0 },
      firstTripRate: 0.88,
      predictedDemand: { "COND-14": 3, "CAP-5": 0.1 },
      leadTimeDays: 2,
      carryingCost: 0.7,
      explorationNeed: true
    });
    expect(actions.find((a) => a.sku === "COND-14")?.action).toBe("add");
    expect(actions.find((a) => a.sku === "CAP-5")?.action).toBe("eliminate");

    const queue = fulfillmentQueueFromDemand([
      {
        callId: "call-1",
        vanId: "214",
        partNumber: "OEM-COND-14",
        quantity: 1,
        onVanQuantity: 1,
        location: "ON_VAN"
      },
      {
        callId: "call-2",
        vanId: "088",
        partNumber: "OEM-TXV",
        quantity: 1,
        onVanQuantity: 0,
        location: "BRANCH_STOCK",
        urgency: "same-day"
      }
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.step).toBe("REQUESTED");
    expect(queue[0]?.partNumber).toBe("OEM-TXV");
    expect(queue[0]?.replenishAfter).toBe(true);
  });
});
