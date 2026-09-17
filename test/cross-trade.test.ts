import { describe, expect, it } from "vitest";
import { rankVans, type CallFitFactors, type ScoredVan } from "../src/domain/call-fit.js";
import {
  CROSS_TRADE_WEIGHT_CAP,
  applyCrossTradeWeight,
  assertSecondaryOnly,
  buildPrimaryPool
} from "../src/domain/cross-trade-matrix.js";

const fit = (over: Partial<CallFitFactors> = {}): CallFitFactors => ({
  quality: 0.8,
  competence: 0.8,
  technicalFit: 0.9,
  clientFit: 0.7,
  geolocation: 0.5,
  inventory: 0.8,
  runtime: 0.7,
  contribution: 0.6,
  margin: 0.6,
  scheduleImpact: 0.7,
  exploration: 0.1,
  ...over
});

function scored(vanId: string, qualified: boolean, factors: CallFitFactors): ScoredVan {
  return {
    vanId,
    qualifiedForPrimary: qualified,
    factors,
    baseScore: 0,
    crossTradeAdjustment: 0,
    finalScore: 0
  };
}

describe("v0.5 cross-trade constitutional routing", () => {
  it("does not put an HVAC selling tech in the pool for a furnace call just because the water heater is old", () => {
    const sellingTech = scored("van-sell", false, fit({ contribution: 0.99 }));
    const hvacTech = scored("van-hvac", true, fit());
    const all = [sellingTech, hvacTech];
    const pool = buildPrimaryPool(all);
    expect(pool.map((v) => v.vanId)).toEqual(["van-hvac"]);
    expect(() =>
      assertSecondaryOnly(all, [...pool, sellingTech], {
        origin: "hvac",
        receiving: "plumbing",
        evidenceSupported: true,
        weight: 0.5
      })
    ).toThrow(/manufactured/);
  });

  it("applies only a bounded secondary weight after the qualified pool exists", () => {
    const ranked = rankVans([
      { vanId: "a", qualifiedForPrimary: true, factors: fit({ technicalFit: 0.91 }) },
      { vanId: "b", qualifiedForPrimary: true, factors: fit({ technicalFit: 0.9 }) }
    ]);
    const weighted = applyCrossTradeWeight(ranked, {
      origin: "hvac",
      receiving: "plumbing",
      evidenceSupported: true,
      weight: 0.9
    });
    expect(weighted.every((v) => v.crossTradeAdjustment <= CROSS_TRADE_WEIGHT_CAP)).toBe(true);
    assertSecondaryOnly(
      [
        ...weighted,
        scored("unqualified", false, fit())
      ],
      weighted,
      { origin: "hvac", receiving: "plumbing", evidenceSupported: true, weight: 0.9 }
    );
  });

  it("ignores unevidenced opportunity", () => {
    const ranked = rankVans([{ vanId: "a", qualifiedForPrimary: true, factors: fit() }]);
    const weighted = applyCrossTradeWeight(ranked, {
      origin: "hvac",
      receiving: "electrical",
      evidenceSupported: false,
      weight: 0.15
    });
    expect(weighted[0]?.crossTradeAdjustment).toBe(0);
  });
});
