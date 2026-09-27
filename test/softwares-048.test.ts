import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flagTraining, trainingFromJobEconomics } from "../src/domain/huddle-board.js";
import {
  defaultDriveMilesPath,
  loadDrivePerformance,
  readDriveMilesFile,
  summarizeDrive,
  SYNTHETIC_DRIVE_LEGS
} from "../src/domain/drive-miles.js";
import {
  buildPerformanceBoard,
  formatRankedBoard,
  knownJobMoney,
  performanceAsSkillScore,
  performanceAsTraining,
  syntheticPerformanceJobs
} from "../src/domain/performance-board.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { renderDeskPage } from "../src/desk/render.js";
import { renderPrintableSnapshot } from "../src/desk/print.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { defaultAlertConfig } from "../src/desk/alerts.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const NOW = "2026-09-27T15:00:00Z";

function emptyFolders(root: string) {
  return (["servicetitan", "probooks", "trades-app"] as const).map((preferClass) => {
    const dir = join(root, "inbound", preferClass);
    mkdirSync(dir, { recursive: true });
    return { dir, preferClass };
  });
}

describe("0.4.8 miles driven and drive performance", () => {
  it("shows labeled synthetic miles when no local file exists and refuses a vendor claim", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-miles-"));
    const synthetic = loadDrivePerformance({
      cwd: root,
      instanceId: "local",
      allowSynthetic: true,
      completedJobs: 5
    });
    expect(synthetic.source).toBe("synthetic-demo");
    expect(synthetic.liveTelematics).toBe(false);
    expect(synthetic.telematicsVendor).toBe(false);
    expect(synthetic.vendorClaim).toBe(false);
    expect(synthetic.notAGpsTrace).toBe(true);
    expect(synthetic.totalMiles).toBe(269);
    expect(synthetic.totalStops).toBe(19);
    expect(synthetic.milesPerStop).toBe(14.16);
    expect(synthetic.milesPerCompletedJob).toBe(53.8);
    expect(synthetic.days.length).toBeGreaterThan(1);
    expect(synthetic.note).toMatch(/not a telematics vendor/i);
    expect(synthetic.note).toMatch(/not a company export/i);

    const missing = loadDrivePerformance({
      cwd: root,
      instanceId: "local",
      allowSynthetic: false,
      completedJobs: 4
    });
    expect(missing.source).toBe("unknown");
    expect(missing.totalMiles).toBeNull();
    expect(missing.days).toEqual([]);
    expect(missing.note).toMatch(/stay unknown/i);

    const vendorPath = join(root, "vendor-miles.json");
    writeFileSync(
      vendorPath,
      JSON.stringify({
        liveTelematics: true,
        telematicsVendor: "Example GPS",
        rows: [{ day: "2026-09-25", technicianId: "tech-a", miles: 10 }]
      })
    );
    expect(() => readDriveMilesFile(vendorPath)).toThrow(/must not claim a live telematics vendor/);
    const refused = loadDrivePerformance({
      cwd: root,
      instanceId: "local",
      explicitPath: vendorPath,
      allowSynthetic: true,
      completedJobs: 5
    });
    expect(refused.source).toBe("unknown");
    expect(refused.totalMiles).toBeNull();
    expect(refused.note).toMatch(/not substituted/i);

    const localPath = join(root, "drive-miles.json");
    writeFileSync(
      localPath,
      JSON.stringify({
        liveTelematics: false,
        telematicsVendor: null,
        source: "operator-file",
        rows: [
          {
            day: "2026-09-25",
            technicianId: "tech-local",
            technicianName: "Local Tech",
            miles: 12.4,
            driveMinutes: 28,
            stops: 3,
            latitude: 41.8,
            longitude: -87.6
          },
          { day: "2026-09-25", technicianId: "tech-local", miles: 3.6, stops: 1 }
        ]
      })
    );
    const read = readDriveMilesFile(localPath);
    expect(read.coordinatesIgnored).toBe(true);
    expect(read.rows[0]).not.toHaveProperty("latitude");
    const local = summarizeDrive({
      source: "local-file",
      path: localPath,
      rows: read.rows,
      completedJobs: 2,
      coordinatesIgnored: read.coordinatesIgnored
    });
    expect(local.source).toBe("local-file");
    expect(local.totalMiles).toBe(16);
    expect(local.totalDriveMinutes).toBeNull();
    expect(local.milesPerStop).toBe(4);
    expect(local.milesPerCompletedJob).toBe(8);
    expect(local.liveTelematics).toBe(false);
    expect(local.note).toMatch(/coordinates/i);

    expect(() => defaultDriveMilesPath("tenants")).toThrow(/local instance id/);
    expect(SYNTHETIC_DRIVE_LEGS.every((row) => row.miles >= 0)).toBe(true);
  });
});

describe("0.4.8 ranked performance board", () => {
  it("ranks employees and departments best to worst and refuses a skill or training score", () => {
    const jobs = syntheticPerformanceJobs();
    const board = buildPerformanceBoard({ jobs, source: "synthetic-demo" });
    expect(board.companyExport).toBe(false);
    expect(board.notASkillScore).toBe(true);
    expect(board.trainingSeparate).toBe(true);
    expect(board.source).toBe("synthetic-demo");
    expect(board.employees.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(board.employees.map((row) => row.id)).toEqual([
      "tech-sam",
      "tech-maya",
      "tech-priya",
      "tech-luis",
      "tech-andre"
    ]);
    expect(board.employees[0]?.label).toBe("Sam Okonkwo");
    expect(board.employees[0]!.boardOrder).toBeGreaterThan(board.employees[1]!.boardOrder);
    expect(board.employees.every((row) => row.notASkillScore && row.trainingSeparate)).toBe(true);
    expect(formatRankedBoard(board.employees).split("\n")[0]).toBe("1. Sam Okonkwo");
    expect(formatRankedBoard(board.employees)).toMatch(/5\. Andre Cole/);
    expect(board.departments.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(board.departments.map((row) => row.id)).toEqual(["cross-trades", "hvac", "electrical", "plumbing", "sewer"]);
    expect(board.note).toMatch(/not a company export/i);
    expect(board.note).toMatch(/not a skill score/i);
    expect(board.note).toMatch(/trainingNeeded/i);
    const maya = board.employees.find((row) => row.id === "tech-maya");
    expect(maya?.currentRevenue).toBe(1260);
    expect(maya?.rank).not.toBe(1);

    expect(() => performanceAsSkillScore(board)).toThrow(/not technician skill/);
    expect(() => performanceAsTraining(board)).toThrow(/not a training flag/);
    expect(() => flagTraining({ revenue: 1260 })).toThrow(/not a training flag/);
    expect(() => trainingFromJobEconomics()).toThrow(/not a training flag/);

    const blank = buildPerformanceBoard({
      source: "admitted-rows",
      jobs: [
        {
          id: "a",
          technicianId: "tech-a",
          technicianName: "Ada",
          department: "hvac",
          callback: "no",
          ticket: null,
          sold: null,
          revenue: null
        },
        {
          id: "b",
          technicianId: "tech-b",
          technicianName: "Ben",
          department: "plumbing",
          callback: "yes",
          ticket: null,
          sold: null,
          revenue: null
        }
      ]
    });
    expect(blank.employees[0]?.id).toBe("tech-a");
    expect(blank.employees[0]?.avgTicket).toBeNull();
    expect(blank.employees[0]?.currentRevenue).toBeNull();
    expect(blank.employees[0]?.recallRate).toBe(0);
    expect(blank.employees[1]?.recallRate).toBe(1);
    expect(blank.note).toMatch(/stay blank/i);

    expect(knownJobMoney({ ticket: "420", sold: 0, currentRevenue: 420 })).toEqual({
      ticket: 420,
      sold: 0,
      revenue: 420
    });
    expect(knownJobMoney({ total: 99, amount: 50 })).toEqual({ ticket: null, sold: null, revenue: null });
    expect(knownJobMoney({})).toEqual({ ticket: null, sold: null, revenue: null });
  });
});

describe("0.4.8 desk surfaces", () => {
  it("shows both Softwares on the synthetic desk and on the loopback routes", async () => {
    expect(RUNTIME_MANIFEST.version).toBe("0.4.10");
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
    const root = mkdtempSync(join(tmpdir(), "tr-desk-048-"));
    const folders = emptyFolders(root);
    const snapshot = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      alertConfig: defaultAlertConfig(),
      persistAlertState: false
    });
    expect(snapshot.dataLabel).toBe("synthetic-demo");
    expect(snapshot.drive.source).toBe("synthetic-demo");
    expect(snapshot.drive.liveTelematics).toBe(false);
    expect(snapshot.drive.totalMiles).toBe(269);
    expect(snapshot.performance.source).toBe("synthetic-demo");
    expect(snapshot.performance.companyExport).toBe(false);
    expect(snapshot.performance.employees[0]?.id).toBe("tech-sam");
    expect(snapshot.performance.employees.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    const priyaBoard = snapshot.performance.employees.find((row) => row.id === "tech-priya");
    const priyaHuddle = snapshot.huddle.techs.find((tech) => tech.id === "tech-priya");
    const samHuddle = snapshot.huddle.techs.find((tech) => tech.id === "tech-sam");
    expect(priyaHuddle?.trainingNeeded.severity).toBe("needed");
    expect(priyaHuddle?.trainingNeeded.fromEconomics).toBe(false);
    expect(samHuddle?.trainingNeeded.severity).toBe("none");
    expect(priyaBoard?.rank).not.toBe(1);
    expect(priyaBoard?.trainingSeparate).toBe(true);

    const html = renderDeskPage(snapshot);
    expect(html).toContain("Miles and drive performance");
    expect(html).toContain("Performance board");
    expect(html).toContain("1");
    expect(html).toContain("Sam Okonkwo");
    expect(html).toContain("/api/drive");
    expect(html).toContain("/api/performance");
    expect(html).toContain("live telematics false");
    expect(html).toContain("not a skill score");
    const receipt = renderPrintableSnapshot(snapshot);
    expect(receipt).toContain("Miles and drive performance");
    expect(receipt).toContain("Performance board");
    expect(receipt).toContain("Sam Okonkwo");
    expect(receipt).toContain("best to worst");

    const admittedRoot = mkdtempSync(join(tmpdir(), "tr-desk-048-byo-"));
    const admittedFolders = emptyFolders(admittedRoot);
    writeFileSync(
      join(admittedFolders[2]!.dir, "jobs.json"),
      JSON.stringify({
        synthetic: true,
        records: [
          {
            job_id: "JOB-1",
            status: "completed",
            trade: "hvac",
            technicianId: "tech-ada",
            technicianName: "Ada",
            scheduled_at: "2026-09-27T15:00:00Z",
            isCallback: false,
            ticket: 500,
            sold: 80,
            revenue: 500
          },
          {
            job_id: "JOB-2",
            status: "completed",
            trade: "plumbing",
            technicianId: "tech-ben",
            technicianName: "Ben",
            scheduled_at: "2026-09-27T15:00:00Z",
            isCallback: true,
            ticket: 200,
            sold: 10,
            revenue: 200
          }
        ]
      })
    );
    const admitted = buildOperatorSnapshot({
      cwd: admittedRoot,
      now: NOW,
      folders: admittedFolders,
      alertConfig: defaultAlertConfig(),
      persistAlertState: false
    });
    expect(admitted.dataLabel).toBe("byo-admitted-synthetic");
    expect(admitted.drive.source).toBe("unknown");
    expect(admitted.drive.totalMiles).toBeNull();
    expect(admitted.performance.source).toBe("admitted-rows");
    expect(admitted.performance.companyExport).toBe(false);
    expect(admitted.performance.employees.map((row) => row.id)).toEqual(["tech-ada", "tech-ben"]);
    expect(admitted.performance.employees[0]?.currentRevenue).toBe(500);
    expect(admitted.performance.note).toMatch(/not a company export/i);

    const milesPath = join(admittedRoot, "data", "runtime", "local", "drive-miles.json");
    mkdirSync(join(admittedRoot, "data", "runtime", "local"), { recursive: true });
    writeFileSync(
      milesPath,
      JSON.stringify({
        liveTelematics: false,
        source: "local-file",
        rows: [{ day: "2026-09-27", technicianId: "tech-ada", technicianName: "Ada", miles: 22, stops: 2 }]
      })
    );
    const withMiles = buildOperatorSnapshot({
      cwd: admittedRoot,
      now: NOW,
      folders: admittedFolders,
      alertConfig: defaultAlertConfig(),
      persistAlertState: false
    });
    expect(withMiles.drive.source).toBe("local-file");
    expect(withMiles.drive.totalMiles).toBe(22);
    expect(withMiles.drive.liveTelematics).toBe(false);
    expect(withMiles.drive.milesPerCompletedJob).toBe(11);

    const desk = await startOperatorDesk({
      port: 0,
      cwd: root,
      folders,
      now: NOW,
      alertConfig: defaultAlertConfig(),
      alertStatePath: join(root, "alert-state.json"),
      persistAlertState: false
    });
    try {
      const drive = (await (await fetch(`${desk.url}api/drive`)).json()) as {
        live_backends: boolean;
        writes: boolean;
        liveTelematics: boolean;
        telematicsVendor: boolean;
        drive: { source: string; totalMiles: number; notAGpsTrace: boolean };
      };
      expect(drive.live_backends).toBe(false);
      expect(drive.writes).toBe(false);
      expect(drive.liveTelematics).toBe(false);
      expect(drive.telematicsVendor).toBe(false);
      expect(drive.drive.source).toBe("synthetic-demo");
      expect(drive.drive.totalMiles).toBe(269);
      expect(drive.drive.notAGpsTrace).toBe(true);
      const performance = (await (await fetch(`${desk.url}api/performance`)).json()) as {
        companyExport: boolean;
        notASkillScore: boolean;
        trainingSeparate: boolean;
        performance: { employees: { rank: number; label: string }[] };
      };
      expect(performance.companyExport).toBe(false);
      expect(performance.notASkillScore).toBe(true);
      expect(performance.trainingSeparate).toBe(true);
      expect(performance.performance.employees[0]).toMatchObject({ rank: 1, label: "Sam Okonkwo" });
      expect(performance.performance.employees.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await desk.close();
    }
  });
});
