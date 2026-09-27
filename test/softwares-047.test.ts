import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyChain } from "../src/core/chains.js";
import { flagHandoffBehavior, flagNamedFailure, reconstructHandoff, systemBeforeBlame } from "../src/domain/chain-d.js";
import { collectDepartmentFlags } from "../src/domain/chain-d.js";
import { flagCrossTradeBehavior } from "../src/domain/cross-trade-matrix.js";
import { flagTraining, trainingFromJobEconomics, trainingNeeded } from "../src/domain/huddle-board.js";
import { asSkillScore, reconcileJobWithPartCosts } from "../src/domain/job-economics.js";
import {
  adaptPartCost,
  applyMarketAdaptation,
  type PricebookInputs,
  type PricebookRecommendation
} from "../src/domain/pricebook.js";
import { flagRecognitionBehavior } from "../src/domain/recognition.js";
import { marketAdaptationWeight, type PatternEvidence } from "../src/domain/regional-recalibration.js";
import {
  countOnVan,
  countWarehouse,
  defaultStockCountPath,
  emptyStockBook,
  fulfillmentQueueFromCounts,
  persistStockCount,
  readStockBook,
  recommendVanStock
} from "../src/domain/truck-stock.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { renderDeskPage } from "../src/desk/render.js";
import { renderPrintableSnapshot } from "../src/desk/print.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { defaultAlertConfig } from "../src/desk/alerts.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const thin: PatternEvidence = {
  sampleSize: 2,
  geographicConcentration: 0.2,
  constructionSimilarity: 0.2,
  materialSimilarity: 0.2,
  technicianConfirmations: 0,
  outcomeConfirmations: 0,
  recencyDays: 800,
  crossBranchAgreement: 0.1,
  conflicting: true,
  stale: true,
  cohortDissimilar: true,
  stoppedRecurring: false
};

const strong: PatternEvidence = {
  sampleSize: 40,
  geographicConcentration: 0.8,
  constructionSimilarity: 0.85,
  materialSimilarity: 0.9,
  technicianConfirmations: 12,
  outcomeConfirmations: 10,
  recencyDays: 40,
  crossBranchAgreement: 0.8,
  conflicting: false,
  stale: false,
  cohortDissimilar: false,
  stoppedRecurring: false
};

const inputs: PricebookInputs = {
  repairFrequency: 12,
  predictedDemand: 8,
  alreadyOnAssignedVan: false,
  currentCost: 180,
  lastCost: 175,
  averageCost: 210,
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

const unlocked: PricebookRecommendation = {
  recommendationId: "pb-open",
  sku: "COND-14",
  oemPart: "OEM-COND-14",
  proposedPrice: 410,
  locked: false
};

describe("0.4.7 part cost and market adaptation", () => {
  it("keeps adapted cost near current when regional evidence is thin", () => {
    expect(marketAdaptationWeight(thin).weakened).toBe(true);
    expect(marketAdaptationWeight(thin).weight).toBeLessThanOrEqual(0.15);
    expect(marketAdaptationWeight(strong).weakened).toBe(false);
    expect(marketAdaptationWeight(strong).weight).toBeGreaterThan(marketAdaptationWeight(thin).weight);
    expect(marketAdaptationWeight(undefined)).toEqual({ weight: 0, weakened: true });

    const weakened = adaptPartCost(inputs, thin);
    const supported = adaptPartCost(inputs, strong);
    expect(weakened.costMove).toBe(5);
    expect(weakened.currentCost).toBe(180);
    expect(weakened.lastCost).toBe(175);
    expect(weakened.subordinateToHuman).toBe(true);
    expect(weakened.autoApplied).toBe(false);
    expect(Math.abs(weakened.adaptedCost - weakened.currentCost)).toBeLessThan(
      Math.abs(supported.adaptedCost - supported.currentCost)
    );
    expect(supported.adaptedCost).toBeGreaterThan(weakened.adaptedCost);
  });

  it("refuses market adaptation of a locked price and uses adapted parts in job economics", () => {
    expect(() => applyMarketAdaptation({ ...unlocked, locked: true, lockHolder: "mgr-1" }, inputs, strong)).toThrow(
      /cannot be auto-recalibrated/
    );
    const adapted = applyMarketAdaptation(unlocked, inputs, thin);
    expect(adapted.proposedPrice).toBe(unlocked.proposedPrice);
    expect(adapted.costSignal?.weakened).toBe(true);
    const moved = applyMarketAdaptation(unlocked, inputs, strong);
    expect(moved.proposedPrice).not.toBe(unlocked.proposedPrice);
    expect(moved.costSignal?.autoApplied).toBe(false);

    const job = reconcileJobWithPartCosts(
      {
        revenue: 1000,
        warrantyRecovery: 0,
        procurement: 0,
        loadedLabor: 100,
        callbackRework: 0,
        concessions: 0,
        laborHours: 2
      },
      [{ currentCost: 180, lastCost: 175, averageCost: 210, quantity: 2, evidence: strong }]
    );
    expect(job.partCost.currentParts).toBe(360);
    expect(job.partCost.lastParts).toBe(350);
    expect(job.partCost.adaptedParts).not.toBe(job.partCost.currentParts);
    expect(job.realizedContribution).toBe(1000 - job.partCost.adaptedParts - 100);
    expect(job.notASkillScore).toBe(true);
    expect(() => asSkillScore(job)).toThrow(/not technician skill/);
  });
});

describe("0.4.7 training needed", () => {
  it("flags severity from procedure observations and refuses economics", () => {
    expect(trainingNeeded([]).severity).toBe("none");
    expect(trainingNeeded([]).fromEconomics).toBe(false);
    expect(flagTraining({ observations: [{ technicianId: "tech-luis", kind: "coaching-requested" }] }).severity).toBe(
      "watch"
    );
    expect(
      flagTraining({
        observations: [{ technicianId: "tech-priya", kind: "repeated-same-failure", count: 2 }]
      }).severity
    ).toBe("needed");
    expect(
      flagTraining({
        observations: [
          { technicianId: "tech-andre", kind: "certification-gap", count: 1 },
          { technicianId: "tech-andre", kind: "repeated-same-failure", count: 2 }
        ]
      }).severity
    ).toBe("urgent");
    expect(() => flagTraining({ revenue: 24000 })).toThrow(/not a training flag/);
    expect(() => flagTraining({ margin: 0.4, contributionPerLaborHour: 80 })).toThrow(/not a training flag/);
    expect(() => trainingFromJobEconomics()).toThrow(/not a training flag/);
  });
});

describe("0.4.7 department behavior", () => {
  it("flags good handoffs and bad coordination without blaming the last person", () => {
    const good = flagHandoffBehavior({
      recordId: "d-good",
      at: "t",
      fromRole: "warehouse",
      toRole: "dispatch",
      expectedAction: "stage-part",
      actualAction: "stage-part",
      acknowledged: true,
      knowledgeAtOrigin: { ready: true },
      knowledgeAtRecipient: { ready: true }
    });
    expect(good.polarity).toBe("positive");
    expect(good.kind).toBe("clean-handoff");
    expect(good.lastPersonBlamed).toBe(false);

    const bad = flagHandoffBehavior({
      recordId: "d-bad",
      at: "t",
      fromRole: "warehouse",
      toRole: "dispatch",
      expectedAction: "ack-ready",
      actualAction: "silent",
      acknowledged: false,
      knowledgeAtOrigin: { ready: true }
    });
    expect(bad.polarity).toBe("negative");
    expect(bad.kind).toBe("unacknowledged-handoff");
    expect(systemBeforeBlame("unacknowledged-handoff")).toBe("system");
    expect(bad.lastPersonBlamed).toBe(false);

    const named = flagNamedFailure({
      recordId: "d-human",
      fromRole: "dispatch",
      toRole: "tech",
      failureType: "human-execution-error"
    });
    expect(named.attribution).toBe("human");
    expect(named.lastPersonBlamed).toBe(false);
    expect(
      flagNamedFailure({
        recordId: "d-human-named",
        fromRole: "dispatch",
        toRole: "tech",
        failureType: "human-execution-error",
        blameLastPerson: true
      }).lastPersonBlamed
    ).toBe(true);

    const reconstructed = reconstructHandoff(emptyChain("D"), {
      recordId: "d-chain",
      at: "t",
      fromRole: "warehouse",
      toRole: "dispatch",
      expectedAction: "stage-part",
      actualAction: "stage-part",
      acknowledged: true,
      knowledgeAtOrigin: { ready: true },
      knowledgeAtRecipient: { ready: true }
    });
    expect(reconstructed.failureType).toBeUndefined();
    expect(reconstructed.behavior.polarity).toBe("positive");
    expect(reconstructed.chain.records[0]?.polarity).toBe("positive");

    const assist = flagCrossTradeBehavior({
      signal: { origin: "hvac", receiving: "electrical", evidenceSupported: true, weight: 0.1 }
    });
    expect(assist.polarity).toBe("positive");
    expect(assist.kind).toBe("cross-trade-assist");
    expect(assist.lastPersonBlamed).toBe(false);
    const unevidenced = flagCrossTradeBehavior({
      signal: { origin: "plumbing", receiving: "sewer", evidenceSupported: false, weight: 0.4 }
    });
    expect(unevidenced.polarity).toBe("negative");
    expect(unevidenced.attribution).toBe("system");

    const recognized = flagRecognitionBehavior({
      flagId: "rec-good",
      candidate: { kind: "successful-repair", revenue: 420, qualityOk: true, callbackAcceptable: true },
      fromRole: "van",
      toRole: "warehouse"
    });
    expect(recognized?.polarity).toBe("positive");
    expect(
      flagRecognitionBehavior({
        flagId: "rec-revenue",
        candidate: {
          kind: "successful-repair",
          revenue: 9000,
          qualityOk: true,
          callbackAcceptable: true,
          rawRevenueOnly: true
        },
        fromRole: "van",
        toRole: "warehouse"
      })
    ).toBeUndefined();
    const miss = flagRecognitionBehavior({
      flagId: "rec-miss",
      candidate: { kind: "successful-repair", revenue: 420, qualityOk: false, callbackAcceptable: false },
      fromRole: "dispatch",
      toRole: "warehouse",
      coordinationMiss: true
    });
    expect(miss?.polarity).toBe("negative");
    expect(miss?.lastPersonBlamed).toBe(false);

    const board = collectDepartmentFlags([good, bad, assist, unevidenced, recognized!, miss!]);
    expect(board.positive.length).toBeGreaterThan(0);
    expect(board.negative.length).toBeGreaterThan(0);
    expect(board.systemBeforeBlame).toBe(true);
    expect(board.lastPersonBlamedByDefault).toBe(false);
    expect(board.positive.every((flag) => flag.lastPersonBlamed === false)).toBe(true);
    expect(board.negative.every((flag) => flag.lastPersonBlamed === false)).toBe(true);
  });
});

describe("0.4.7 truck stock counts", () => {
  it("counts on-van and warehouse stock in a local file and feeds fulfillment", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-stock-"));
    const bookPath = join(root, defaultStockCountPath("desk-local", "runtime"));
    let book = emptyStockBook("desk-local", "2026-09-27T00:00:00Z");
    book = persistStockCount({
      bookPath,
      book,
      line: {
        sku: "COND-14",
        location: "ON_VAN",
        vanId: "van-214",
        quantity: 2,
        countedAt: "2026-09-27T00:00:00Z",
        countedBy: "operator"
      }
    });
    book = persistStockCount({
      bookPath,
      book,
      line: {
        sku: "COND-14",
        location: "BRANCH_STOCK",
        placeId: "branch-3",
        quantity: 6,
        countedAt: "2026-09-27T00:01:00Z",
        countedBy: "operator"
      }
    });
    const loaded = readStockBook(bookPath);
    expect(loaded.hostedInventory).toBe(false);
    expect(loaded.liveErp).toBe(false);
    expect(countOnVan(loaded, "van-214", "COND-14")).toBe(2);
    expect(countWarehouse(loaded, "COND-14", "branch-3")).toBe(6);
    expect(countOnVan(loaded, "van-214", "MISSING")).toBeNull();
    const log = readFileSync(bookPath.replace(/\.json$/, ".jsonl"), "utf8").trim().split("\n");
    expect(log).toHaveLength(2);

    const queue = fulfillmentQueueFromCounts(
      [
        {
          callId: "call-1",
          vanId: "van-214",
          partNumber: "COND-14",
          quantity: 3,
          location: "BRANCH_STOCK"
        },
        {
          callId: "call-2",
          vanId: "van-088",
          partNumber: "COND-14",
          quantity: 1,
          location: "BRANCH_STOCK"
        }
      ],
      loaded
    );
    expect(queue).toHaveLength(1);
    expect(queue[0]?.quantity).toBe(1);
    expect(queue[0]?.location).toBe("BRANCH_STOCK");
    expect(queue[0]?.procurementRequired).toBe(false);

    expect(
      recommendVanStock({
        consumption: 4,
        firstTripRate: 0.88,
        carryingCost: 0.2,
        explorationNeed: false,
        onVanCount: 6,
        warehouseCount: 6
      })
    ).toBe("hold-min");
    expect(
      recommendVanStock({
        consumption: 4,
        firstTripRate: 0.88,
        carryingCost: 0.2,
        explorationNeed: false,
        onVanCount: 0,
        warehouseCount: 0
      })
    ).toBe("increase");
    expect(
      recommendVanStock({
        consumption: 4,
        firstTripRate: 0.88,
        carryingCost: 0.2,
        explorationNeed: false
      })
    ).toBe("add");

    expect(() => defaultStockCountPath("tenants")).toThrow(/local instance id/);
    expect(() => persistStockCount({ bookPath: join(root, "data/tenants/a/stock-counts.json"), book, line: book.counts[0]! })).toThrow(
      /hosted inventory/
    );
  });
});

describe("0.4.7 desk surfaces", () => {
  it("shows the four Softwares on the synthetic desk and the local stock route", async () => {
    expect(RUNTIME_MANIFEST.version).toBe("0.4.11");
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
    const root = mkdtempSync(join(tmpdir(), "tr-desk-047-"));
    const folders = (["servicetitan", "probooks", "trades-app"] as const).map((kind) => {
      const dir = join(root, "inbound", kind);
      mkdirSync(dir, { recursive: true });
      return { dir, preferClass: kind };
    });
    const snapshot = buildOperatorSnapshot({
      cwd: root,
      now: "2026-09-27T15:00:00Z",
      folders,
      alertConfig: defaultAlertConfig(),
      persistAlertState: false
    });
    expect(snapshot.live_backends).toBe(false);
    expect(snapshot.pilot_started).toBe(false);
    expect(snapshot.partCosts.source).toBe("synthetic-sample");
    expect(snapshot.partCosts.subordinateToHuman).toBe(true);
    expect(snapshot.partCosts.autoApplied).toBe(false);
    expect(snapshot.partCosts.lines.some((line) => line.weakened)).toBe(true);
    expect(snapshot.partCosts.lines.some((line) => !line.weakened)).toBe(true);
    const priya = snapshot.huddle.techs.find((tech) => tech.id === "tech-priya");
    const maya = snapshot.huddle.techs.find((tech) => tech.id === "tech-maya");
    expect(priya?.trainingNeeded.severity).toBe("needed");
    expect(priya?.trainingNeeded.fromEconomics).toBe(false);
    expect(maya?.trainingNeeded.severity).toBe("none");
    expect(maya?.trainingNeeded.reason).toMatch(/not inferred from revenue/i);
    expect(snapshot.behavior.positive.length).toBeGreaterThan(0);
    expect(snapshot.behavior.negative.length).toBeGreaterThan(0);
    expect(snapshot.behavior.lastPersonBlamedByDefault).toBe(false);
    expect(snapshot.behavior.positive.concat(snapshot.behavior.negative).every((flag) => !flag.lastPersonBlamed)).toBe(
      true
    );
    expect(snapshot.stock.source).toBe("synthetic-sample");
    expect(snapshot.stock.hostedInventory).toBe(false);
    expect(snapshot.stock.liveErp).toBe(false);
    expect(snapshot.stock.lines.some((line) => line.location === "ON_VAN" && line.quantity === 2)).toBe(true);
    expect(snapshot.stock.sampleRequest?.quantity).toBe(1);

    const html = renderDeskPage(snapshot);
    expect(html).toContain("Part cost");
    expect(html).toContain("Department behavior");
    expect(html).toContain("Training needed");
    expect(html).toContain("hosted inventory false");
    expect(html).toContain("/api/stock");
    const receipt = renderPrintableSnapshot(snapshot);
    expect(receipt).toContain("Part cost");
    expect(receipt).toContain("Department behavior");
    expect(receipt).toContain("Truck counts");
    expect(receipt).toContain("COND-14");

    const desk = await startOperatorDesk({
      port: 0,
      cwd: root,
      folders,
      now: "2026-09-27T15:00:00Z",
      alertConfig: defaultAlertConfig(),
      alertStatePath: join(root, "alert-state.json"),
      persistAlertState: false
    });
    try {
      const stock = (await (await fetch(`${desk.url}api/stock`)).json()) as {
        live_backends: boolean;
        writes: boolean;
        hostedInventory: boolean;
        liveErp: boolean;
        source: string;
        lines: { location: string; quantity: number }[];
      };
      expect(stock.live_backends).toBe(false);
      expect(stock.writes).toBe(false);
      expect(stock.hostedInventory).toBe(false);
      expect(stock.liveErp).toBe(false);
      expect(stock.source).toBe("synthetic-sample");
      expect(stock.lines.some((line) => line.location === "ON_VAN")).toBe(true);
    } finally {
      await desk.close();
    }
  });
});
