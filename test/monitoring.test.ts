import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { callColumn } from "../src/desk/monitoring.js";
import { renderDeskPage } from "../src/desk/render.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { readDriveMilesFile } from "../src/domain/drive-miles.js";
import { defaultPositionsPath, loadLocalPositions, pinsFromMilesFile } from "../src/domain/local-positions.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const NOW = "2026-09-27T18:00:00.000Z";

function emptyFolders(root: string) {
  return (["servicetitan", "probooks", "trades-app"] as const).map((kind) => {
    const dir = join(root, "inbound", kind);
    mkdirSync(dir, { recursive: true });
    return { dir, preferClass: kind };
  });
}

describe("0.4.9 monitoring view", () => {
  it("places a call on the familiar board column", () => {
    expect(callColumn("scheduled")).toBe("scheduled");
    expect(callColumn("Completed")).toBe("done");
    expect(callColumn("en route")).toBe("on-the-job");
    expect(callColumn("")).toBe("other");
    expect(callColumn("mystery")).toBe("other");
  });

  it("shows synthetic pins, scores, and the call board without a live GPS claim", () => {
    const root = mkdtempSync(join(tmpdir(), "trades-monitor-"));
    const folders = emptyFolders(root);
    const snapshot = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      persistAlertState: false,
      persistLocalReports: false
    });
    expect(RUNTIME_MANIFEST.version).toBe("1.0.0-local");
    expect(snapshot.version).toBe("1.0.0-local");
    expect(snapshot.map).toEqual({
      drawn: false,
      reason: "No coordinates are stored on this desk. A map is not drawn."
    });
    expect(snapshot.monitoring.live_backends).toBe(false);
    expect(snapshot.monitoring.liveTelematics).toBe(false);
    expect(snapshot.monitoring.telematicsVendor).toBe(false);
    expect(snapshot.monitoring.monitoringOnly).toBe(true);
    expect(snapshot.monitoring.refused).toBe("write-back");
    expect(snapshot.monitoring.servicetitanWrite).toBe(false);
    expect(snapshot.monitoring.probooksWrite).toBe(false);
    expect(snapshot.monitoring.author).toBe("Aziel Eliab");
    expect(snapshot.monitoring.positions.source).toBe("synthetic-demo");
    expect(snapshot.monitoring.positions.notALiveGps).toBe(true);
    expect(snapshot.monitoring.positions.pins.map((pin) => pin.technicianName)).toContain("Maya Chen");
    expect(snapshot.monitoring.driveCards.map((card) => card.label)).toEqual([
      "Miles",
      "Miles / stop",
      "Min / stop",
      "Miles / job"
    ]);
    expect(snapshot.monitoring.techCards.length).toBeGreaterThan(0);
    expect(snapshot.monitoring.techCards[0]?.avgTicket).not.toBe("—");
    expect(snapshot.monitoring.columns.map((column) => column.id)).toEqual(["scheduled", "on-the-job", "done"]);
    expect(snapshot.monitoring.columns.find((column) => column.id === "scheduled")?.calls.length).toBeGreaterThan(0);
    expect(snapshot.monitoring.columns.find((column) => column.id === "done")?.calls.length).toBeGreaterThan(0);
    expect(snapshot.monitoring.columns.find((column) => column.id === "on-the-job")?.calls).toEqual([]);
    expect(snapshot.monitoring.kpis.map((card) => card.id)).toEqual(["quality", "ticket", "friction", "drive"]);
    expect(snapshot.monitoring.humanAuthorityRule).toMatch(/Human Authority Rule/);

    const html = renderDeskPage(snapshot);
    expect(html).toContain("Monitoring");
    expect(html).toContain("Synthetic demo positions");
    expect(html).toContain("Not a live GPS feed");
    expect(html).toContain("Local position pins. Not a live telematics map.");
    expect(html).toContain("Maya Chen");
    expect(html).toContain("Miles / stop");
    expect(html).toContain("Tech scores");
    expect(html).toContain("Call board");
    expect(html).toContain('data-column="scheduled"');
    expect(html).toContain('data-column="done"');
    expect(html).toContain("Human Authority Rule");
    expect(html).toContain("refused: write-back");
    expect(html).toContain("live_backends false");
    expect(html).not.toContain("live_backends true");
    expect(html).not.toMatch(/live telematics backend/i);
    expect(html).not.toContain("Glama Latest");
  });

  it("moves pins when the local positions file changes and leaves mile totals ignoring coordinates", () => {
    const root = mkdtempSync(join(tmpdir(), "trades-pins-"));
    const folders = emptyFolders(root);
    const positions = join(root, "positions.json");
    const miles = join(root, "drive-miles.json");
    writeFileSync(
      miles,
      JSON.stringify({
        liveTelematics: false,
        source: "operator-file",
        rows: [
          {
            day: "2026-09-25",
            technicianId: "tech-local",
            technicianName: "Local Tech",
            miles: 12.4,
            driveMinutes: 28,
            stops: 3,
            latitude: 41.5,
            longitude: -87.7
          }
        ]
      })
    );
    const read = readDriveMilesFile(miles);
    expect(read.coordinatesIgnored).toBe(true);
    expect(read.rows[0]).not.toHaveProperty("latitude");
    expect(read.rows[0]?.miles).toBe(12.4);
    const copied = pinsFromMilesFile(miles);
    expect(copied[0]).toMatchObject({ technicianId: "tech-local", lat: 41.5, lng: -87.7 });

    const fromMiles = loadLocalPositions({
      cwd: root,
      instanceId: "local",
      allowSynthetic: true,
      milesPath: miles
    });
    expect(fromMiles.source).toBe("local-file");
    expect(fromMiles.pins[0]?.lat).toBe(41.5);
    expect(fromMiles.note).toMatch(/Mile totals still ignore coordinates/);
    expect(fromMiles.liveTelematics).toBe(false);

    writeFileSync(
      positions,
      JSON.stringify({
        liveTelematics: false,
        live_backends: false,
        source: "operator-file",
        pins: [{ technicianId: "tech-local", technicianName: "Local Tech", kind: "tech", lat: 41.1, lng: -87.1, at: "2026-09-25T14:00:00Z" }]
      })
    );
    const first = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      positionsPath: positions,
      driveMilesPath: miles,
      persistAlertState: false,
      persistLocalReports: false
    });
    expect(first.monitoring.positions.pins[0]?.lat).toBe(41.1);
    expect(first.monitoring.positions.source).toBe("local-file");
    expect(first.monitoring.note).toMatch(/BYO drop-in/);
    expect(first.map.drawn).toBe(false);

    writeFileSync(
      positions,
      JSON.stringify({
        liveTelematics: false,
        source: "local-file",
        pins: [{ technicianId: "tech-local", technicianName: "Local Tech", kind: "truck", lat: 42.2, lng: -88.2, at: "2026-09-25T16:00:00Z" }]
      })
    );
    const second = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      positionsPath: positions,
      driveMilesPath: miles,
      persistAlertState: false,
      persistLocalReports: false
    });
    expect(second.monitoring.positions.pins).toHaveLength(1);
    expect(second.monitoring.positions.pins[0]?.lat).toBe(42.2);
    expect(second.monitoring.positions.pins[0]?.kind).toBe("truck");
    expect(second.drive.coordinatesIgnored).toBe(true);
    expect(second.drive.totalMiles).toBe(12.4);
  });

  it("refuses a live telematics claim and does not substitute the synthetic demo", () => {
    const root = mkdtempSync(join(tmpdir(), "trades-gps-"));
    const refused = join(root, "positions.json");
    writeFileSync(
      refused,
      JSON.stringify({
        liveTelematics: true,
        source: "operator-file",
        pins: [{ technicianId: "tech-live", technicianName: "Live Claim", lat: 40, lng: -80, kind: "tech", at: "2026-09-25T14:00:00Z" }]
      })
    );
    const board = loadLocalPositions({
      cwd: root,
      instanceId: "local",
      allowSynthetic: true,
      explicitPath: refused
    });
    expect(board.source).toBe("unknown");
    expect(board.pins).toEqual([]);
    expect(board.liveTelematics).toBe(false);
    expect(board.note).toMatch(/must not claim a live telematics/);
    expect(board.note).toMatch(/not substituted/);
    expect(() => defaultPositionsPath("tenants")).toThrow(/tenants/);
  });

  it("serves the monitoring board on the loopback desk", async () => {
    const root = mkdtempSync(join(tmpdir(), "trades-monitor-desk-"));
    const folders = emptyFolders(root);
    const desk = await startOperatorDesk({
      port: 0,
      cwd: root,
      folders,
      now: NOW,
      persistAlertState: false,
      persistLocalReports: false
    });
    try {
      const page = await (await fetch(desk.url)).text();
      expect(page).toContain('id="monitoring"');
      expect(page).toContain("Call board");
      expect(page).toContain("Human Authority Rule");
      const body = (await (await fetch(`${desk.url}api/monitoring`)).json()) as {
        live_backends: boolean;
        liveTelematics: boolean;
        monitoringOnly: boolean;
        refused: string;
        positions: { source: string; pins: { technicianName: string | null }[] };
        columns: { id: string }[];
      };
      expect(body.live_backends).toBe(false);
      expect(body.liveTelematics).toBe(false);
      expect(body.monitoringOnly).toBe(true);
      expect(body.refused).toBe("write-back");
      expect(body.positions.source).toBe("synthetic-demo");
      expect(body.positions.pins.some((pin) => pin.technicianName === "Maya Chen")).toBe(true);
      expect(body.columns.map((column) => column.id)).toEqual(["scheduled", "on-the-job", "done"]);
    } finally {
      await desk.close();
    }
  });
});
