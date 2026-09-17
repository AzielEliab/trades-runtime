import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runRecordedShadowDays, runShadowDayDemo } from "../src/demo/shadow-day.js";

describe("L2 recorded shadow-day", () => {
  it("keeps planned / actual / counterfactual reconstructable and does not score techs", () => {
    const days = runRecordedShadowDays();
    expect(days.hvac.kind).toBe("hvac");
    expect(days.plumbingOverflow.kind).toBe("plumbing-overflow");
    expect(days.hvac.mode).toBe("SHADOW-SEALED");
    expect(days.plumbingOverflow.mode).toBe("SHADOW-VISIBLE");
    expect(days.hvac.scoresTechnicians).toBe(false);
    expect(days.plumbingOverflow.scoresTechnicians).toBe(false);

    for (const day of [days.hvac, days.plumbingOverflow]) {
      expect(day.reconstructable.planned).toEqual(day.planned);
      expect(day.reconstructable.actual).toEqual(day.actual);
      expect(day.reconstructable.counterfactual).toEqual(day.counterfactual);
      expect(day.settlement.hindsightLeak).toBe(false);
      expect(day.settlement.sealedRecommendationHash).toHaveLength(64);
      expect(day.ledgerValid).toBe(true);
      expect(day).not.toHaveProperty("technicianScore");
    }

    const hvacFixture = JSON.parse(readFileSync("test/fixtures/shadow-day-hvac.json", "utf8"));
    const plumbingFixture = JSON.parse(readFileSync("test/fixtures/shadow-day-plumbing-overflow.json", "utf8"));
    expect(days.hvac).toEqual(hvacFixture);
    expect(days.plumbingOverflow).toEqual(plumbingFixture);
  });

  it("rebases from actual state without claiming live-branch accuracy", () => {
    const demo = runShadowDayDemo("hvac");
    expect(demo.trajectoryRecords).toBeGreaterThanOrEqual(3);
    expect(demo.liveWinner).toBe("human");
    expect(demo.disagreementPreserved).toBe(true);
  });
});
