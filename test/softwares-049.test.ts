import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HUMAN_AUTHORITY_RULE, proposeAlertActions } from "../src/desk/alert-actions.js";
import { defaultAlertConfig } from "../src/desk/alerts.js";
import { renderPrintableSnapshot } from "../src/desk/print.js";
import { renderDeskPage } from "../src/desk/render.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { startOperatorDesk } from "../src/desk/server.js";
import {
  INBOUND_DEFECTS,
  buildInboundQualityReport,
  persistInboundQuality,
  scoreInboundFragment,
  type InboundQualityFragment
} from "../src/domain/inbound-quality.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";
import { optionCStartGate } from "../src/spine/option-c-start-gate.js";
import { mayWriteProBooks, mayWriteServiceTitan } from "../src/index.js";

const NOW = "2026-09-27T18:00:00.000Z";

function emptyFolders(root: string) {
  return (["servicetitan", "probooks", "trades-app"] as const).map((kind) => {
    const dir = join(root, "inbound", kind);
    mkdirSync(dir, { recursive: true });
    return { dir, preferClass: kind };
  });
}

describe("0.4.9 inbound quality", () => {
  it("scores the synthetic fixture for every defect class without a tenant pull", () => {
    const report = buildInboundQualityReport({
      version: RUNTIME_MANIFEST.version,
      now: NOW,
      instanceId: "local",
      allowSynthetic: true
    });
    expect(report.live_backends).toBe(false);
    expect(report.writes).toBe(false);
    expect(report.tenantPull).toBe(false);
    expect(report.servicetitanWrite).toBe(false);
    expect(report.probooksWrite).toBe(false);
    expect(report.writeBack).toBe("refused");
    expect(report.checklistNotAccuracy).toBe(true);
    expect(report.source).toBe("synthetic-demo");
    expect(report.pilot_started).toBe(false);
    expect(report.author).toBe("Aziel Eliab");
    expect(report.humanReport).toMatch(/not an accuracy percent/i);
    expect(report.humanReport).toMatch(/live_backends false/);
    expect(report.volumeBySourceKind.map((row) => row.sourceKind)).toEqual(["servicetitan", "probooks"]);
    expect(report.volumeBySourceKind.every((row) => row.count > 0)).toBe(true);
    expect(report.scoreDistribution.map((row) => row.band)).toEqual(["0-39", "40-69", "70-100"]);
    const defects = new Set(report.topDefects.map((row) => row.defect));
    for (const defect of INBOUND_DEFECTS) expect(defects.has(defect)).toBe(true);
    expect(report.meanScore).not.toBeNull();
    expect(report.fragments.every((row) => row.refusedWrite && row.writes === false)).toBe(true);
    const complete = report.fragments.find((row) => row.sourceId === "syn-st-complete");
    expect(complete?.score).toBe(100);
    expect(complete?.flags).toEqual([]);
  });

  it("flags conflicting keys, a refused write, and a stale clock on a local file", () => {
    const stale = scoreInboundFragment(
      {
        sourceKind: "servicetitan",
        sourceId: "st-stale",
        file: "jobs.json",
        fields: {
          id: "ST-1",
          status: "Completed",
          jobType: "no cool",
          observedAt: "2020-01-01T00:00:00Z",
          method: "POST"
        }
      },
      NOW
    );
    expect(stale.flags.map((flag) => flag.defect)).toEqual(expect.arrayContaining(["stale", "refused-write"]));
    expect(stale.writes).toBe(false);

    const conflict = scoreInboundFragment(
      {
        sourceKind: "probooks",
        sourceId: "pb-conflict",
        file: "items.json",
        fields: { id: "PB-1", sku: "SKU-1", name: "valve", cost: 10, amount: 14, observedAt: "2026-09-26" }
      } satisfies InboundQualityFragment,
      NOW
    );
    expect(conflict.flags.some((flag) => flag.defect === "conflicting-keys")).toBe(true);
  });

  it("reads a local drop and refuses a hosted tenants path", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-quality-"));
    const dir = join(root, "servicetitan");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "jobs.json"),
      JSON.stringify({
        synthetic: true,
        jobs: [{ id: "LOCAL-1", jobId: "LOCAL-2", status: "Completed", jobStatus: "Canceled", observedAt: "2026-09-26T12:00:00Z" }]
      })
    );
    const report = buildInboundQualityReport({
      version: "0.4.9",
      now: NOW,
      instanceId: "desk",
      allowSynthetic: false,
      folders: [{ dir, sourceKind: "servicetitan" }],
      root: join(root, "runtime")
    });
    expect(report.source).toBe("local-files");
    expect(report.tenantPull).toBe(false);
    expect(report.fragmentCount).toBe(1);
    expect(report.fragments[0]?.flags.some((flag) => flag.defect === "conflicting-keys")).toBe(true);
    expect(report.note).toMatch(/not a live tenant pull/i);
    const written = persistInboundQuality({ cwd: root, report });
    expect(written.written).toBe(true);
    const jsonPath = join(root, written.path);
    const auditPath = join(root, written.auditPath);
    const textPath = join(root, written.textPath);
    expect(JSON.parse(readFileSync(jsonPath, "utf8")).live_backends).toBe(false);
    expect(readFileSync(textPath, "utf8")).toMatch(/Shadow \/ local/);
    persistInboundQuality({ cwd: root, report: written });
    const lines = readFileSync(auditPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).writes).toBe(false);
    expect(() =>
      buildInboundQualityReport({
        version: "0.4.9",
        now: NOW,
        instanceId: "tenants",
        allowSynthetic: false
      })
    ).toThrow(/not shared\/hosted\/tenants/);
  });
});

describe("0.4.9 alert action stubs", () => {
  it("proposes refused write-back stubs and never a tenant call", () => {
    const stubs = proposeAlertActions([
      {
        id: "capacity:synthetic-demo",
        rule: "capacity",
        severity: "watch",
        title: "Open slots are low",
        detail: "Synthetic capacity rule.",
        dataLabel: "synthetic-demo",
        raisedAt: NOW,
        lastSeenAt: NOW,
        active: true,
        acknowledgedAt: null,
        acknowledgedBy: null,
        inventedAccuracy: false
      }
    ]);
    expect(stubs).toHaveLength(2);
    expect(stubs.every((stub) => stub.refused === "write-back")).toBe(true);
    expect(stubs.every((stub) => stub.executed === false && stub.tenantCall === false)).toBe(true);
    expect(stubs.every((stub) => stub.servicetitanWrite === false && stub.probooksWrite === false)).toBe(true);
    expect(stubs[0]?.humanAuthorityRule).toBe(HUMAN_AUTHORITY_RULE);
    expect(stubs[0]?.requiredHumanAuthority).toMatch(/dispatcher/);
    expect(stubs[1]?.label).toMatch(/Hold ServiceTitan and ProBooks/);
    expect(proposeAlertActions([])).toEqual([]);
    expect(mayWriteServiceTitan()).toBe(false);
    expect(mayWriteProBooks()).toBe(false);
  });
});

describe("0.4.9 Option C start gate", () => {
  it("stays prep, blocked-until, with Option D out of scope", () => {
    const gate = optionCStartGate(NOW);
    expect(gate.pilot_started).toBe(false);
    expect(gate.pilotMayStart).toBe(false);
    expect(gate.pilot).toBe("not-started");
    expect(gate.optionC).toBe("prep-only");
    expect(gate.optionD).toBe("out-of-scope");
    expect(gate.cutover).toBe(false);
    expect(gate.live_backends).toBe(false);
    expect(gate.writes).toBe(false);
    expect(gate.pages).toBe("off");
    expect(gate.author).toBe("Aziel Eliab");
    expect(gate.gates.length).toBeGreaterThanOrEqual(8);
    expect(gate.gates.every((item) => item.state === "blocked-until" && item.required)).toBe(true);
    expect(gate.claim).toMatch(/remains prep/);
    expect(gate.claim).toMatch(/Option D is out of scope/);
    expect(JSON.stringify(gate)).not.toMatch(/pilot_started":true/);
    expect(JSON.stringify(gate)).not.toMatch(/cutover":true/);
  });
});

describe("0.4.9 desk surfaces", () => {
  it("shows the quality report, stub actions, and the start gate from local demo data", async () => {
    expect(RUNTIME_MANIFEST.version).toBe("0.4.9");
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    const root = mkdtempSync(join(tmpdir(), "tr-desk-049-"));
    const folders = emptyFolders(root);
    const snapshot = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders,
      alertConfig: defaultAlertConfig(),
      persistAlertState: false,
      persistLocalReports: true
    });
    expect(snapshot.inboundQuality.source).toBe("synthetic-demo");
    expect(snapshot.inboundQuality.live_backends).toBe(false);
    expect(snapshot.inboundQuality.tenantPull).toBe(false);
    expect(snapshot.alertActions.refused).toBe("write-back");
    expect(snapshot.alertActions.stubs.length).toBeGreaterThan(0);
    expect(snapshot.alertActions.stubs.every((stub) => stub.executed === false)).toBe(true);
    expect(snapshot.optionCStartGate.pilotMayStart).toBe(false);
    expect(snapshot.optionCStartGate.optionD).toBe("out-of-scope");
    expect(snapshot.pilot_started).toBe(false);
    const audit = readFileSync(join(root, snapshot.inboundQuality.auditPath), "utf8");
    expect(audit).toMatch(/"tenantPull":false/);
    expect(readFileSync(join(root, snapshot.alertActions.path), "utf8")).toMatch(/"refused": "write-back"/);

    const html = renderDeskPage(snapshot);
    expect(html).toContain("Inbound quality");
    expect(html).toContain("Volume by sourceKind");
    expect(html).toContain("Score distribution");
    expect(html).toContain("Top defect classes");
    expect(html).toContain("Proposed actions (stubs)");
    expect(html).toContain("Human Authority Rule");
    expect(html).toContain("refused: write-back");
    expect(html).toContain("Option C start gate");
    expect(html).toContain("blocked-until");
    expect(html).toContain("Option C remains prep");
    expect(html).not.toContain("live_backends true");
    expect(html).not.toContain("Glama Latest");
    const receipt = renderPrintableSnapshot(snapshot);
    expect(receipt).toContain("Inbound quality");
    expect(receipt).toContain("Alert action stubs");
    expect(receipt).toContain("Option C start gate");
    expect(receipt).toContain("blocked-until");

    const desk = await startOperatorDesk({
      port: 0,
      cwd: root,
      folders,
      now: NOW,
      alertConfig: defaultAlertConfig(),
      alertStatePath: join(root, "alert-state.json"),
      persistAlertState: false,
      persistLocalReports: false
    });
    try {
      const quality = (await (await fetch(`${desk.url}api/inbound-quality`)).json()) as {
        live_backends: boolean;
        writes: boolean;
        tenantPull: boolean;
        checklistNotAccuracy: boolean;
        source: string;
        volumeBySourceKind: { sourceKind: string; count: number }[];
      };
      expect(quality.live_backends).toBe(false);
      expect(quality.writes).toBe(false);
      expect(quality.tenantPull).toBe(false);
      expect(quality.checklistNotAccuracy).toBe(true);
      expect(quality.source).toBe("synthetic-demo");
      expect(quality.volumeBySourceKind.map((row) => row.sourceKind)).toEqual(["servicetitan", "probooks"]);
      const text = await (await fetch(`${desk.url}api/inbound-quality.txt`)).text();
      expect(text).toMatch(/not an accuracy percent/i);
      const actions = (await (await fetch(`${desk.url}api/alert-actions`)).json()) as {
        refused: string;
        tenantCall: boolean;
        servicetitanWrite: boolean;
        probooksWrite: boolean;
        stubs: { refused: string; executed: boolean }[];
      };
      expect(actions.refused).toBe("write-back");
      expect(actions.tenantCall).toBe(false);
      expect(actions.servicetitanWrite).toBe(false);
      expect(actions.probooksWrite).toBe(false);
      expect(actions.stubs.every((stub) => stub.refused === "write-back" && stub.executed === false)).toBe(true);
      const gate = (await (await fetch(`${desk.url}api/option-c-start-gate`)).json()) as {
        pilot_started: boolean;
        pilotMayStart: boolean;
        optionD: string;
        cutover: boolean;
        gates: { state: string }[];
      };
      expect(gate.pilot_started).toBe(false);
      expect(gate.pilotMayStart).toBe(false);
      expect(gate.optionD).toBe("out-of-scope");
      expect(gate.cutover).toBe(false);
      expect(gate.gates.every((item) => item.state === "blocked-until")).toBe(true);
    } finally {
      await desk.close();
    }
  });
});
