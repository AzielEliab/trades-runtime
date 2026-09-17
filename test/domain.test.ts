import { describe, expect, it } from "vitest";
import { asSkillScore, reconcileJob } from "../src/domain/job-economics.js";
import { reconstructHandoff, systemBeforeBlame } from "../src/domain/chain-d.js";
import { emptyChain } from "../src/core/chains.js";
import { existingCommitmentProtected, latestSafeDispatch, recommendBlock, scoreRescheduleRisk } from "../src/domain/workforce-capacity.js";
import { paretoFrontier, reconcilePipelines } from "../src/domain/decision-fabric.js";
import { estimatedIsNotRealized, requireReportMetadata } from "../src/domain/analytics.js";
import { assertGeographyNeverSoleWinner, rankVans } from "../src/domain/call-fit.js";
import { runShadowDayDemo } from "../src/demo/shadow-day.js";
import type { CallFitFactors } from "../src/domain/call-fit.js";

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

describe("domain engines", () => {
  it("reconciles labor × cost × realized contribution", () => {
    const job = reconcileJob({
      revenue: 1500,
      warrantyRecovery: 0,
      parts: 200,
      procurement: 40,
      loadedLabor: 300,
      callbackRework: 0,
      concessions: 0,
      laborHours: 3
    });
    expect(job.realizedContribution).toBe(960);
    expect(() => asSkillScore(job)).toThrow(/not technician skill/);
  });

  it("reconstructs Chain D unacknowledged handoffs as system-first", () => {
    const { failureType } = reconstructHandoff(emptyChain("D"), {
      recordId: "d1",
      at: "t",
      fromRole: "warehouse",
      toRole: "dispatch",
      expectedAction: "ack-ready",
      actualAction: "silent",
      acknowledged: false,
      knowledgeAtOrigin: { ready: true }
    });
    expect(failureType).toBe("unacknowledged-handoff");
    expect(systemBeforeBlame(failureType)).toBe("system");
  });

  it("computes latest safe dispatch and booking blocks", () => {
    expect(latestSafeDispatch({
      mustLeaveByMinutes: 15.5 * 60,
      predictedDuration: 90,
      uncertaintyBuffer: 20,
      travelReturn: 30
    })).toBe(15.5 * 60 - 140);
    expect(recommendBlock({ hardUnavailable: true, protectEmergency: false, demandSurge: false })).toBe("CLOSED");
    expect(scoreRescheduleRisk({
      onTimeProbability: 0.8,
      expectedStartRange: [9, 11],
      expectedCompletionRange: [11, 14],
      emergencyDisplacementRisk: 0.2,
      technicianOverrunRisk: 0.3,
      customerFlexibility: null,
      downstreamScheduleImpact: 0.4
    }).rescheduleProbability).toBeCloseTo(0.2);
    expect(() => existingCommitmentProtected(true, true)).toThrow(/silently/);
  });

  it("exposes a Pareto frontier across pipeline candidates", () => {
    const candidates = [
      { pipeline: "optimization" as const, action: "fast", objectives: { speed: 10, contrib: 1 } },
      { pipeline: "predictive-ml" as const, action: "profit", objectives: { speed: 1, contrib: 10 } },
      { pipeline: "human-heuristic" as const, action: "fast", objectives: { speed: 9, contrib: 1 } }
    ];
    const frontier = paretoFrontier(candidates);
    expect(frontier.has("fast")).toBe(true);
    expect(frontier.has("profit")).toBe(true);
    expect(reconcilePipelines(candidates).some((r) => r.disagreement)).toBe(true);
  });

  it("requires mandatory analytics report metadata", () => {
    expect(() => requireReportMetadata({ scope: "branch-3" })).toThrow(/missing/);
    const meta = requireReportMetadata({
      scope: "branch-3",
      dataSources: ["synthetic"],
      sampleSize: 12,
      formula: "sum(contribution)",
      assumptions: ["no live ST"],
      confidenceNote: "LOW sample",
      status: "estimated",
      versionLineage: "0.1.0",
      receiptRefs: ["r1"]
    });
    expect(estimatedIsNotRealized(meta.status)).toBe(true);
  });

  it("Call-Fit prefers technical fit over a nearer weaker van", () => {
    const ranked = rankVans([
      { vanId: "near", qualifiedForPrimary: true, factors: fit({ geolocation: 0.99, technicalFit: 0.4 }) },
      { vanId: "far", qualifiedForPrimary: true, factors: fit({ geolocation: 0.2, technicalFit: 0.99 }) }
    ]);
    expect(ranked[0]?.vanId).toBe("far");
    expect(() => assertGeographyNeverSoleWinner(ranked)).not.toThrow();
  });

  it("shadow-day demo emits receipts and preserves human disagreement", () => {
    const demo = runShadowDayDemo();
    expect(demo.liveWinner).toBe("human");
    expect(demo.disagreementPreserved).toBe(true);
    expect(demo.ledgerValid).toBe(true);
    expect(demo.receiptCount).toBeGreaterThanOrEqual(3);
  });
});
