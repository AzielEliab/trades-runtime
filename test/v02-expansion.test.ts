import { describe, expect, it } from "vitest";
import {
  archiveChannel,
  CHANNEL_KINDS,
  createChannel,
  mayRecognize,
  missionBoard,
  rewardRawRevenueAlone,
  turnoverAttribution
} from "../src/domain/comms.js";
import {
  advanceFulfillment,
  applyManagerDecision,
  applyShadowBaseline,
  FULFILLMENT_STEPS,
  firstTripProbability,
  purchasingRequiresHuman,
  recommendVanStock,
  refuseLockedAutoRecalibrate,
  STOCK_LOCATIONS,
  type PricebookRecommendation
} from "../src/domain/pricebook-stock.js";
import {
  demandForecast,
  lunarPlumbingFeature,
  lunarWeightWithoutEarnedLift,
  synchronizedWindows
} from "../src/domain/weather-demand.js";
import {
  applyTagChange,
  mayHoldForIdealSeller,
  pickMaintenanceVan,
  sellingWeightForAge
} from "../src/domain/maintenance-routing.js";
import {
  demandFirstUnlessHuman,
  lockedPricebookNotAutoSuperseded,
  lunarWeightIsZeroWithoutLift,
  recognitionNotRawRevenue,
  RULES_V02
} from "../src/rules/constitution.js";
import type { HumanOverride } from "../src/core/human-authority.js";

const manager: HumanOverride = {
  actorId: "mgr-1",
  role: "manager",
  authorized: true,
  reason: "lock the OEM condenser price",
  replacementAction: "pricebook:lock",
  replacementPayload: { proposedPrice: 420 },
  at: "2026-09-11T12:00:00Z"
};

const locked: PricebookRecommendation = {
  recommendationId: "pb-1",
  sku: "COND-14",
  oemPart: "OEM-COND-14",
  proposedPrice: 399,
  locked: true,
  lockHolder: "mgr-1"
};

describe("v0.2 communications, recognition, mission board", () => {
  it("supports the ten channel kinds and permissioned archive", () => {
    expect(CHANNEL_KINDS).toHaveLength(10);
    const channel = createChannel({
      channelId: "ch-wh",
      kind: "warehouse",
      title: "Branch 3 warehouse",
      createdBy: "mgr-1",
      moderators: ["mgr-1"]
    });
    expect(channel.state).toBe("active");
    expect(archiveChannel(channel, "mgr-1").state).toBe("archived");
    expect(() => archiveChannel(channel, "tech-9")).toThrow(/moderator/);
  });

  it("must not reward raw revenue alone", () => {
    expect(rewardRawRevenueAlone()).toBe(false);
    expect(mayRecognize({
      kind: "high-value-quality",
      revenue: 18000,
      qualityOk: false,
      callbackAcceptable: true
    })).toBe(false);
    expect(mayRecognize({
      kind: "successful-repair",
      revenue: 18000,
      qualityOk: true,
      callbackAcceptable: true,
      rawRevenueOnly: true
    })).toBe(false);
    expect(mayRecognize({
      kind: "successful-repair",
      revenue: 420,
      qualityOk: true,
      callbackAcceptable: true
    })).toBe(true);
    expect(recognitionNotRawRevenue({
      kind: "high-value-quality",
      revenue: 99999,
      qualityOk: false,
      callbackAcceptable: false,
      rawRevenueOnly: true
    })).toBe(false);
  });

  it("requires difficulty-normalized evidence for difficult-job recognition", () => {
    expect(mayRecognize({
      kind: "difficult-job",
      revenue: 900,
      qualityOk: true,
      callbackAcceptable: true
    })).toBe(false);
    expect(mayRecognize({
      kind: "difficult-job",
      revenue: 900,
      qualityOk: true,
      callbackAcceptable: true,
      difficultyNormalized: true
    })).toBe(true);
  });

  it("preserves originating Van and closing Comfort Advisor on turnovers", () => {
    expect(turnoverAttribution({
      originatingVanId: "van-214",
      closingComfortAdvisorId: "ca-3"
    })).toEqual({ originatingVanId: "van-214", closingComfortAdvisorId: "ca-3" });
    expect(() => turnoverAttribution({ originatingVanId: "", closingComfortAdvisorId: "ca-3" })).toThrow(/Comfort Advisor/);
  });

  it("mission board shows target, actual, expected pace, remaining gap, projected EOD", () => {
    const [row] = missionBoard([{
      id: "calls",
      measure: "calls-completed",
      target: 40,
      actual: 12,
      elapsedFraction: 0.4
    }]);
    expect(row?.expectedPace).toBe(16);
    expect(row?.remainingGap).toBe(28);
    expect(row?.projectedFinish).toBe(30);
  });
});

describe("v0.2 pricebook, stock, warehouse", () => {
  it("lists all stock locations and fulfillment steps", () => {
    expect(STOCK_LOCATIONS).toEqual([
      "ON_VAN",
      "NEARBY_VAN",
      "BRANCH_STOCK",
      "CENTRAL_WAREHOUSE",
      "LOCAL_DISTRIBUTOR",
      "SHIPPED",
      "BACKORDERED"
    ]);
    expect(FULFILLMENT_STEPS).toEqual([
      "REQUESTED",
      "CLAIMED",
      "PICKING",
      "READY",
      "TRANSFER",
      "DELIVERED",
      "INSTALLED",
      "RECONCILED"
    ]);
    expect(firstTripProbability("ON_VAN")).toBeGreaterThan(firstTripProbability("BACKORDERED"));
  });

  it("refuses automatic recalibration of a locked pricebook recommendation", () => {
    expect(() => refuseLockedAutoRecalibrate(locked)).toThrow(/cannot be auto-recalibrated/);
    expect(() => applyShadowBaseline(locked, 250)).toThrow(/cannot be auto-recalibrated/);
    expect(lockedPricebookNotAutoSuperseded(locked)).toBe(true);
    const unlocked = applyShadowBaseline({ ...locked, locked: false, lockHolder: undefined }, 250);
    expect(unlocked.proposedPrice).toBe(250);
  });

  it("writes Chain C when an authorized human locks or overrides", () => {
    const { live, chain } = applyManagerDecision(
      { ...locked, locked: false, lockHolder: undefined },
      "LOCK",
      manager
    );
    expect(live.locked).toBe(true);
    expect(live.lockHolder).toBe("mgr-1");
    expect(chain.chain).toBe("C");
    expect(chain.records).toHaveLength(1);
    const overridden = applyManagerDecision(live, "OVERRIDE", {
      ...manager,
      replacementPayload: { proposedPrice: 515 }
    });
    expect(overridden.live.proposedPrice).toBe(515);
    expect(overridden.live.locked).toBe(true);
  });

  it("keeps purchasing human unless delegated and recommends van stock actions", () => {
    expect(purchasingRequiresHuman()).toBe(true);
    expect(purchasingRequiresHuman(true)).toBe(false);
    expect(recommendVanStock({
      consumption: 0,
      firstTripRate: 0.9,
      carryingCost: 0.8,
      explorationNeed: false
    })).toBe("eliminate");
    expect(recommendVanStock({
      consumption: 0.4,
      firstTripRate: 0.9,
      carryingCost: 0.2,
      explorationNeed: true
    })).toBe("hold-min");
    expect(advanceFulfillment({
      requestId: "sr-1",
      callId: "call-1",
      vanId: "214",
      partNumber: "OEM-COND-14",
      quantity: 1,
      location: "BRANCH_STOCK",
      step: "REQUESTED"
    }).step).toBe("CLAIMED");
  });
});

describe("v0.2 weather and lunar demand", () => {
  it("requires synchronized past-7 / current-week / forward-7 windows", () => {
    expect(synchronizedWindows({
      branchId: "b3",
      windows: { "past-7": {}, "current-week": { heatIndex: 88 }, "forward-7": { heavyRain: true } }
    })).toEqual(["past-7", "current-week", "forward-7"]);
  });

  it("widens uncertainty in extreme-event mode instead of multiplying demand", () => {
    const normal = demandForecast({ baseVolume: 100, features: { heatIndex: 98 } });
    const extreme = demandForecast({ baseVolume: 100, features: { heatIndex: 98, extremeEvent: true } });
    expect(normal.volume).toBeGreaterThan(100);
    expect(extreme.volume).toBe(100);
    expect(extreme.uncertainty).toBeGreaterThan(normal.uncertainty);
    expect(extreme.eventSpecificMix).toBe(true);
  });

  it("sets lunar weight to 0 unless earned lift after confounders", () => {
    expect(lunarWeightWithoutEarnedLift()).toBe(0);
    expect(lunarPlumbingFeature(false, 0.4).weight).toBe(0);
    expect(lunarPlumbingFeature(false, 0.4).assumedCausesLeaks).toBe(false);
    expect(lunarPlumbingFeature(true, 0.12).weight).toBe(0.12);
    expect(lunarWeightIsZeroWithoutLift()).toBe(true);
    const withLunar = demandForecast({
      baseVolume: 100,
      features: {},
      lunar: lunarPlumbingFeature(false, 0.5)
    });
    expect(withLunar.volume).toBe(100);
  });
});

describe("v0.2 maintenance routing", () => {
  it("increases Selling Tech weight with equipment age but never delays a qualified available tech", () => {
    expect(sellingWeightForAge(6)).toBe(0);
    expect(sellingWeightForAge(12)).toBeGreaterThan(sellingWeightForAge(10));
    expect(mayHoldForIdealSeller(false)).toBe(false);
    expect(mayHoldForIdealSeller(true)).toBe(true);
    expect(demandFirstUnlessHuman(false)).toBe(true);

    const pick = pickMaintenanceVan({
      equipmentAgeYears: 14,
      candidates: [
        { vanId: "seller-later", tags: ["selling-tech"], availableNow: false, qualifiedForPrimary: true },
        { vanId: "service-now", tags: ["service-2"], availableNow: true, qualifiedForPrimary: true }
      ]
    });
    expect(pick.vanId).toBe("service-now");
    expect(pick.heldForSeller).toBe(false);
  });

  it("lets an authorized human override van choice and records tag changes on Chain C", () => {
    const pick = pickMaintenanceVan({
      equipmentAgeYears: 14,
      humanOverrideVanId: "seller-held",
      candidates: [
        { vanId: "service-now", tags: ["service-2"], availableNow: true, qualifiedForPrimary: true }
      ]
    });
    expect(pick.vanId).toBe("seller-held");
    expect(() => applyTagChange(["service-1"], ["selling-tech"], false, {
      actorId: "bot",
      role: "system",
      reason: "auto",
      at: "t"
    })).toThrow(/authorized human/);
    const changed = applyTagChange(["service-1"], ["selling-tech"], true, {
      actorId: "mgr-1",
      role: "manager",
      reason: "qualified seller",
      at: "2026-09-11T12:00:00Z"
    });
    expect(changed.tags).toEqual(["selling-tech"]);
    expect(changed.chain.records[0]?.chain).toBe("C");
  });
});

describe("v0.2 constitution additions", () => {
  it("lists the five v0.2 governing invariants", () => {
    expect(RULES_V02).toHaveLength(5);
  });
});
