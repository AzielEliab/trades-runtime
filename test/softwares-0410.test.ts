import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderDeskPage } from "../src/desk/render.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { loadCoverage, readCoverageFile, writeCoverageLayer } from "../src/domain/coverage-map.js";
import type { DrivePerformance } from "../src/domain/drive-miles.js";
import type { FrictionBoard } from "../src/domain/friction.js";
import { buildRightTech } from "../src/domain/right-tech.js";
import { loadTimeTracking, persistTimeTracking, readTimeCardsFile } from "../src/domain/time-tracking.js";
import type { TimeTrackingBoard } from "../src/domain/time-tracking.js";
import type { CoverageBoard } from "../src/domain/coverage-map.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const NOW = "2026-09-27T18:00:00.000Z";

function emptyFolders(root: string) {
  return (["servicetitan", "probooks", "trades-app"] as const).map((kind) => {
    const dir = join(root, "inbound", kind);
    mkdirSync(dir, { recursive: true });
    return { dir, preferClass: kind };
  });
}

describe("0.4.10 time, coverage, and right tech", () => {
  it("shows the three Softwares from the local demo on Monitoring", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-ops-demo-"));
    const snapshot = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders: emptyFolders(root),
      persistAlertState: false,
      persistLocalReports: true
    });
    expect(RUNTIME_MANIFEST.version).toBe("0.4.12");
    expect(snapshot.version).toBe("0.4.12");
    expect(snapshot.live_backends).toBe(false);
    expect(snapshot.map).toEqual({
      drawn: false,
      reason: "No coordinates are stored on this desk. A map is not drawn."
    });

    const time = snapshot.timeTracking;
    expect(time.source).toBe("synthetic-demo");
    expect(time.dataLabel).toBe("synthetic-demo");
    expect(time.live_backends).toBe(false);
    expect(time.liveTelematics).toBe(false);
    expect(time.notALiveGps).toBe(true);
    expect(time.written).toBe(true);
    expect(time.cards.map((card) => card.technicianName)).toEqual([
      "Maya Chen",
      "Luis Ortega",
      "Priya Shah",
      "Andre Cole",
      "Sam Okonkwo"
    ]);
    const maya = time.cards[0];
    expect(maya?.status).toBe("on-call");
    expect(maya?.elapsedMinutes).toBe(50);
    expect(maya?.estimatedRemainingMinutes).toBe(40);
    expect(maya?.travelMinutes).toBe(22);
    expect(time.cards.find((card) => card.technicianId === "tech-priya")?.status).toBe("idle");
    expect(time.cards.find((card) => card.technicianId === "tech-priya")?.estimatedRemainingMinutes).toBe(0);
    expect(time.cards.find((card) => card.technicianId === "tech-luis")?.status).toBe("travel");
    expect(existsSync(join(root, time.path))).toBe(true);
    const audit = readFileSync(join(root, time.auditPath), "utf8").trim().split("\n");
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]!).live_backends).toBe(false);
    expect(JSON.parse(audit[0]!).writes).toBe(false);
    persistTimeTracking({ cwd: root, report: time });
    expect(readFileSync(join(root, time.auditPath), "utf8").trim().split("\n")).toHaveLength(1);

    const coverage = snapshot.coverage;
    expect(coverage.source).toBe("synthetic-demo");
    expect(coverage.live_backends).toBe(false);
    expect(coverage.mapTileVendor).toBe(false);
    expect(coverage.addressMapDrawn).toBe(false);
    expect(coverage.layers).toEqual({ zipcodes: true, counties: true, cities: true, roads: true });
    expect(coverage.breakdowns.map((row) => row.layer)).toEqual(["zipcodes", "counties", "cities", "roads"]);
    expect(coverage.breakdowns.every((row) => row.enabled)).toBe(true);
    expect(coverage.breakdowns.find((row) => row.layer === "zipcodes")?.features).toBe(5);
    expect(coverage.breakdowns.find((row) => row.layer === "counties")?.jobs).toBeGreaterThan(0);
    expect(coverage.totals.techs).toBeGreaterThan(0);
    expect(coverage.note).toMatch(/Synthetic demo coverage/);
    expect(coverage.note).toMatch(/Not a live map-tile vendor/);

    const fit = snapshot.rightTech;
    expect(fit.suggestionsOnly).toBe(true);
    expect(fit.autoDispatch).toBe(false);
    expect(fit.writeBack).toBe("refused");
    expect(fit.servicetitanWrite).toBe(false);
    expect(fit.probooksWrite).toBe(false);
    expect(fit.live_backends).toBe(false);
    expect(fit.liveTelematics).toBe(false);
    expect(fit.job?.id).toBe("SYN-DESK-HVAC-1");
    expect(fit.suggestions[0]?.technicianId).toBe("tech-maya");
    expect(fit.suggestions[0]?.reasons.join(" ")).toMatch(/HVAC skill matches/);
    expect(fit.suggestions[0]?.reasons.join(" ")).toMatch(/miles from the job pin/);
    expect(fit.suggestions[0]?.reasons.join(" ")).toMatch(/minutes left/);
    expect(fit.suggestions.every((row) => row.autoDispatch === false && row.writeBack === "refused")).toBe(true);
    const andre = fit.suggestions.find((row) => row.technicianId === "tech-andre");
    expect(andre && fit.suggestions[0] && andre.rank > fit.suggestions[0].rank).toBe(true);
    expect(fit.humanAuthorityRule).toMatch(/suggestions only/i);
    expect(fit.humanAuthorityRule).toMatch(/does not auto-dispatch/);

    expect(snapshot.monitoring.timeTracking.cards).toHaveLength(5);
    expect(snapshot.monitoring.coverage.layers.zipcodes).toBe(true);
    expect(snapshot.monitoring.rightTech.suggestionsOnly).toBe(true);

    const html = renderDeskPage(snapshot);
    expect(html).toContain("Time");
    expect(html).toContain("Coverage");
    expect(html).toContain("Right tech");
    expect(html).toContain("Maya Chen");
    expect(html).toContain('data-coverage-layer="zipcodes"');
    expect(html).toContain('data-coverage-layer="counties"');
    expect(html).toContain('data-coverage-layer="cities"');
    expect(html).toContain('data-coverage-layer="roads"');
    expect(html).toContain('data-layer="zipcodes"');
    expect(html).toContain('data-layer="roads"');
    expect(html).toContain("Suggestions only");
    expect(html).toContain("auto-dispatch false");
    expect(html).toContain("/api/time-tracking");
    expect(html).toContain("/api/coverage");
    expect(html).toContain("/api/right-tech");
    expect(html).toContain("Not a live GPS feed");
    expect(html).toContain("Not a live map tile");
    expect(html).toContain("Address map stays undrawn");
    expect(html).toContain("live_backends false");
    expect(html).not.toContain("live_backends true");
    expect(html).not.toMatch(/live telematics backend/i);
    expect(html).not.toContain("Glama Latest");
    expect(html).not.toMatch(/ServiceTitan write client/i);
  });

  it("recomputes BYO time cards when the local file changes and audits the new digest", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-ops-time-"));
    const folders = emptyFolders(root);
    const cards = join(root, "time-cards.json");
    writeFileSync(
      cards,
      JSON.stringify({
        liveTelematics: false,
        live_backends: false,
        source: "operator-file",
        cards: [
          {
            technicianId: "tech-local",
            technicianName: "Local Tech",
            jobId: "JOB-1",
            trade: "hvac",
            status: "on-call",
            skills: ["hvac"],
            estimatedMinutes: 90,
            segments: [{ kind: "clocked", startedAt: "2026-09-27T17:10:00Z", endedAt: null }]
          }
        ]
      })
    );
    const first = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      timeCardsPath: cards,
      persistAlertState: false,
      persistLocalReports: true
    });
    expect(first.timeTracking.source).toBe("local-file");
    expect(first.timeTracking.dataLabel).toBe("local-file");
    expect(first.timeTracking.note).toMatch(/BYO drop-in/);
    expect(first.timeTracking.cards[0]?.elapsedMinutes).toBe(50);
    expect(first.timeTracking.cards[0]?.estimatedRemainingMinutes).toBe(40);

    writeFileSync(
      cards,
      JSON.stringify({
        live_backends: false,
        source: "local-file",
        cards: [
          {
            technicianId: "tech-local",
            technicianName: "Local Tech",
            jobId: "JOB-1",
            trade: "plumbing",
            status: "on-call",
            skills: ["plumbing"],
            estimatedMinutes: 30,
            segments: [{ kind: "clocked", startedAt: "2026-09-27T17:50:00Z", endedAt: null }]
          }
        ]
      })
    );
    const second = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      timeCardsPath: cards,
      persistAlertState: false,
      persistLocalReports: true
    });
    expect(second.timeTracking.cards[0]?.elapsedMinutes).toBe(10);
    expect(second.timeTracking.cards[0]?.estimatedRemainingMinutes).toBe(20);
    expect(second.timeTracking.cards[0]?.trade).toBe("plumbing");
    const lines = readFileSync(join(root, second.timeTracking.auditPath), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).sourceDigest).not.toBe(JSON.parse(lines[1]!).sourceDigest);
  });

  it("refuses a live telematics claim on time cards and coverage and does not substitute the demo", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-ops-refuse-"));
    const timePath = join(root, "time-cards.json");
    writeFileSync(
      timePath,
      JSON.stringify({
        liveTelematics: true,
        source: "operator-file",
        cards: [
          {
            technicianId: "tech-live",
            status: "on-call",
            segments: [{ kind: "clocked", startedAt: NOW, endedAt: null }]
          }
        ]
      })
    );
    const time = loadTimeTracking({ cwd: root, instanceId: "desk", now: NOW, allowSynthetic: true, explicitPath: timePath });
    expect(time.source).toBe("unknown");
    expect(time.cards).toEqual([]);
    expect(time.liveTelematics).toBe(false);
    expect(time.note).toMatch(/must not claim a live telematics/);
    expect(time.note).toMatch(/not substituted/);

    const coveragePath = join(root, "coverage.json");
    writeFileSync(
      coveragePath,
      JSON.stringify({
        live_backends: true,
        source: "operator-file",
        features: [
          {
            id: "60607",
            layer: "zipcodes",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-87.7, 41.8],
                  [-87.6, 41.8],
                  [-87.6, 41.9],
                  [-87.7, 41.9],
                  [-87.7, 41.8]
                ]
              ]
            }
          }
        ]
      })
    );
    const coverage = loadCoverage({
      cwd: root,
      instanceId: "desk",
      allowSynthetic: true,
      explicitPath: coveragePath,
      pins: []
    });
    expect(coverage.source).toBe("unknown");
    expect(coverage.features).toEqual([]);
    expect(coverage.live_backends).toBe(false);
    expect(coverage.note).toMatch(/must not claim a live map/);
    expect(coverage.note).toMatch(/not substituted/);
    expect(() => readTimeCardsFile(timePath)).toThrow(/live telematics/);
    expect(() => readCoverageFile(coveragePath)).toThrow(/live map/);
  });

  it("turns a coverage layer off and drops it from the breakdown", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-ops-layers-"));
    const folders = emptyFolders(root);
    const before = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      persistAlertState: false,
      persistLocalReports: false
    });
    expect(before.coverage.layers.cities).toBe(true);
    expect(before.coverage.totals.features).toBe(9);
    const layerFile = join(root, before.coverage.layerPath);
    writeCoverageLayer(layerFile, "cities", false);
    const after = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      persistAlertState: false,
      persistLocalReports: false
    });
    expect(after.coverage.layers.cities).toBe(false);
    expect(after.coverage.layers.zipcodes).toBe(true);
    const cities = after.coverage.breakdowns.find((row) => row.layer === "cities");
    expect(cities?.enabled).toBe(false);
    expect(cities?.features).toBe(0);
    expect(cities?.jobs).toBe(0);
    expect(after.coverage.totals.features).toBe(8);
    const html = renderDeskPage(after);
    expect(html).toContain('data-coverage-layer="cities"');
    expect(html).not.toContain('data-layer="cities"');
    expect(html).toContain('data-layer="zipcodes"');
    expect(html).toContain('data-coverage="cities" data-enabled="false"');
  });

  it("ranks skill and time ahead of a nearer wrong trade", () => {
    const fit = buildRightTech({
      dataLabel: "local-file",
      jobId: "JOB-HVAC",
      calls: [{ id: "JOB-HVAC", lane: "hvac", status: "scheduled", technicianName: null }],
      time: {
        source: "local-file",
        cards: [
          {
            technicianId: "near-wrong",
            technicianName: "Near Wrong",
            skills: ["electrical"],
            status: "idle",
            estimatedRemainingMinutes: 0
          },
          {
            technicianId: "fit",
            technicianName: "Fit Tech",
            skills: ["hvac"],
            status: "on-call",
            estimatedRemainingMinutes: 40
          }
        ]
      } as TimeTrackingBoard,
      pins: [
        { technicianId: "near-wrong", technicianName: "Near Wrong", lat: 41.901, lng: -87.661, kind: "tech", at: null },
        { technicianId: "fit", technicianName: "Fit Tech", lat: 41.88, lng: -87.63, kind: "tech", at: null }
      ],
      coverage: {
        source: "local-file",
        jobs: [{ id: "JOB-HVAC", trade: "hvac", label: "No cool", lat: 41.9, lng: -87.66 }]
      } as CoverageBoard,
      friction: { employees: [] } as unknown as FrictionBoard,
      drive: { techs: [] } as unknown as DrivePerformance
    });
    expect(fit.autoDispatch).toBe(false);
    expect(fit.writeBack).toBe("refused");
    expect(fit.suggestions[0]?.technicianId).toBe("fit");
    expect(fit.suggestions[0]?.reasons.join(" ")).toMatch(/HVAC skill matches/);
    expect(fit.suggestions[1]?.technicianId).toBe("near-wrong");
    expect(fit.suggestions[1]?.miles).toBeLessThan(fit.suggestions[0]?.miles ?? 99);
  });

  it("serves time, coverage, and right tech on the loopback desk", async () => {
    const root = mkdtempSync(join(tmpdir(), "tr-ops-desk-"));
    const desk = await startOperatorDesk({
      port: 0,
      cwd: root,
      folders: emptyFolders(root),
      now: NOW,
      persistAlertState: false,
      persistLocalReports: false
    });
    try {
      const page = await (await fetch(desk.url)).text();
      expect(page).toContain("Right tech");
      expect(page).toContain("Maya Chen");
      expect(page).toContain('data-coverage-layer="roads"');
      const time = (await (await fetch(`${desk.url}api/time-tracking`)).json()) as {
        live_backends: boolean;
        source: string;
        cards: { technicianId: string; estimatedRemainingMinutes: number | null }[];
      };
      expect(time.live_backends).toBe(false);
      expect(time.source).toBe("synthetic-demo");
      expect(time.cards.find((card) => card.technicianId === "tech-maya")?.estimatedRemainingMinutes).toBe(40);
      const coverage = (await (await fetch(`${desk.url}api/coverage`)).json()) as {
        live_backends: boolean;
        mapTileVendor: boolean;
        addressMapDrawn: boolean;
        layers: { cities: boolean };
        breakdowns: { layer: string; enabled: boolean }[];
      };
      expect(coverage.live_backends).toBe(false);
      expect(coverage.mapTileVendor).toBe(false);
      expect(coverage.addressMapDrawn).toBe(false);
      expect(coverage.layers.cities).toBe(true);
      const toggled = (await (
        await fetch(`${desk.url}api/coverage/layers`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ layer: "cities", enabled: false })
        })
      ).json()) as { ok: boolean; vendorWrite: boolean; autoDispatch: boolean; layers: { cities: boolean } };
      expect(toggled.ok).toBe(true);
      expect(toggled.vendorWrite).toBe(false);
      expect(toggled.autoDispatch).toBe(false);
      expect(toggled.layers.cities).toBe(false);
      const again = (await (await fetch(`${desk.url}api/coverage`)).json()) as {
        layers: { cities: boolean; zipcodes: boolean };
        breakdowns: { layer: string; enabled: boolean; features: number }[];
      };
      expect(again.layers.cities).toBe(false);
      expect(again.layers.zipcodes).toBe(true);
      expect(again.breakdowns.find((row) => row.layer === "cities")).toMatchObject({ enabled: false, features: 0 });
      const fit = (await (await fetch(`${desk.url}api/right-tech?job=SYN-DESK-HVAC-1`)).json()) as {
        autoDispatch: boolean;
        writeBack: string;
        suggestionsOnly: boolean;
        job: { id: string };
        suggestions: { technicianId: string; reasons: string[] }[];
      };
      expect(fit.autoDispatch).toBe(false);
      expect(fit.writeBack).toBe("refused");
      expect(fit.suggestionsOnly).toBe(true);
      expect(fit.job.id).toBe("SYN-DESK-HVAC-1");
      expect(fit.suggestions[0]?.technicianId).toBe("tech-maya");
      const alias = (await (await fetch(`${desk.url}api/tech-fit`)).json()) as { suggestionsOnly: boolean };
      expect(alias.suggestionsOnly).toBe(true);
    } finally {
      await desk.close();
    }
  });
});
