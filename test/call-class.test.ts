import { describe, expect, it } from "vitest";
import {
  aggregateCallClasses,
  classifyCall,
  syntheticDeskCallClasses,
  SYNTHETIC_DESK_CALLS
} from "../src/domain/call-class.js";
import { explainMissionPace, openMissionDay } from "../src/domain/mission-board.js";
import { explainBookingBlock } from "../src/domain/workforce-capacity.js";

describe("callback and warranty call classification", () => {
  it("reads explicit flags, job type, and tags, and leaves prose alone", () => {
    expect(classifyCall({ isCallback: true, isWarranty: false })).toMatchObject({
      callback: "yes",
      warranty: "no"
    });
    expect(classifyCall({ callback: "return-visit", tags: ["warranty"] })).toMatchObject({
      callback: "yes",
      warranty: "yes"
    });
    expect(classifyCall({ jobType: "callback", warrantyState: "NOT_COVERED" })).toMatchObject({
      callback: "yes",
      warranty: "no"
    });
    expect(classifyCall({ jobType: "service" })).toMatchObject({
      callback: "unknown",
      warranty: "unknown"
    });
    expect(classifyCall({ summary: "warranty callback from last month", description: "return visit" })).toMatchObject({
      callback: "unknown",
      warranty: "unknown"
    });
    expect(classifyCall({ completedOn: "2026-08-01", scheduledOn: "2026-09-25" })).toMatchObject({
      callback: "unknown",
      warranty: "unknown"
    });
  });

  it("does not treat possible, unknown, or lookup-failed warranty state as covered", () => {
    for (const state of ["POSSIBLE", "UNKNOWN", "LOOKUP_FAILED"]) {
      const row = classifyCall({ warrantyState: state });
      expect(row.warranty).toBe("unknown");
      expect(row.warrantyBasis).toMatch(/not a coverage decision/i);
    }
    expect(classifyCall({ warrantyState: "CONFIRMED" }).warranty).toBe("yes");
    expect(classifyCall({ warrantyState: "NOT_COVERED" }).warranty).toBe("no");
    const conflict = classifyCall({ isWarranty: true, warrantyState: "POSSIBLE" });
    expect(conflict.warranty).toBe("unknown");
    expect(conflict.warrantyBasis).toMatch(/Conflicting/);
  });

  it("leaves conflicting callback labels unknown", () => {
    const row = classifyCall({ isCallback: true, callback: "no" });
    expect(row.callback).toBe("unknown");
    expect(row.callbackBasis).toMatch(/Conflicting/);
  });

  it("aggregates callback, warranty, neither, and not-classified without dropping a both", () => {
    const counts = aggregateCallClasses([
      classifyCall({ isCallback: true, isWarranty: false }),
      classifyCall({ isWarranty: true, isCallback: false }),
      classifyCall({ isCallback: true, isWarranty: true }),
      classifyCall({ callback: "no", warranty: "no" }),
      classifyCall({ jobType: "repair" }),
      classifyCall({})
    ]);
    expect(counts).toMatchObject({
      calls: 6,
      callback: 2,
      warranty: 2,
      callbackAndWarranty: 1,
      neither: 1,
      notClassified: 2
    });
  });

  it("ships a multi-trade synthetic sample with non-zero callback and warranty counts", () => {
    const trades = new Set(SYNTHETIC_DESK_CALLS.map((row) => row.trade));
    expect([...trades].sort()).toEqual(["cross-trades", "electrical", "hvac", "plumbing", "sewer"]);
    const counts = aggregateCallClasses(syntheticDeskCallClasses());
    expect(counts.callback).toBeGreaterThan(0);
    expect(counts.warranty).toBeGreaterThan(0);
    expect(counts.notClassified).toBeGreaterThan(0);
    expect(counts.calls).toBe(SYNTHETIC_DESK_CALLS.length);
  });
});

describe("score explanations", () => {
  it("names the mission pace band in plain language", () => {
    const behind = explainMissionPace({
      measure: "calls-completed",
      actual: 3,
      target: 7,
      expectedPace: 5.8,
      elapsedFraction: 0.83
    });
    expect(behind.band).toBe("behind");
    expect(behind.why).toMatch(/^Why:/);
    expect(behind.why).toMatch(/3/);
    expect(behind.why).not.toMatch(/\d+%/);

    const open = openMissionDay({
      branchId: "local",
      day: "2026-09-25",
      openedAt: "2026-09-25T00:00:00Z",
      closesAt: "2026-09-25T23:59:59Z",
      clock: "2026-09-25T00:00:00Z",
      goals: [{ id: "calls-completed", measure: "calls-completed", target: 4, actual: 0 }]
    });
    expect(explainMissionPace(open.goals[0]!).band).toBe("not-started");
  });

  it("states the booking-block reason when new booking is held", () => {
    const blocked = explainBookingBlock({
      hardUnavailable: false,
      protectEmergency: false,
      demandSurge: true,
      actual: 3,
      expectedPace: 5.83,
      elapsedFraction: 0.83
    });
    expect(blocked.block).toBe("BLOCK_NEW_BOOKING");
    expect(blocked.blocked).toBe(true);
    expect(blocked.headline).toMatch(/New booking is blocked/);
    expect(blocked.why).toMatch(/BLOCK_NEW_BOOKING/);
    expect(blocked.why).toMatch(/behind expected pace/);

    const open = explainBookingBlock({
      hardUnavailable: false,
      protectEmergency: false,
      demandSurge: false,
      actual: 4,
      expectedPace: 3.5,
      elapsedFraction: 0.5
    });
    expect(open.block).toBe("OPEN");
    expect(open.blocked).toBe(false);
    expect(open.headline).toMatch(/Nothing is blocking new booking/);
  });
});
