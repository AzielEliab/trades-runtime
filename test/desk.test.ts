import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUNTIME_MANIFEST } from "../src/manifest.js";
import { defaultAlertConfig } from "../src/desk/alerts.js";
import { buildOperatorSnapshot, RECORDED_SYNTHETIC_SHADOW_CONFIDENCE } from "../src/desk/snapshot.js";
import { renderDeskPage } from "../src/desk/render.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { describeConfidence } from "../src/core/confidence.js";

const NOW = "2026-09-25T12:00:00Z";
const FIXTURES = join(process.cwd(), "test", "fixtures", "byo");

function emptyFolders(root: string) {
  const folders = (["servicetitan", "probooks", "trades-app"] as const).map((preferClass) => {
    const dir = join(root, preferClass);
    mkdirSync(dir, { recursive: true });
    return { dir, preferClass };
  });
  return folders;
}

describe("local operator desk", () => {
  it("labels an empty inbound root as synthetic demo and withholds invented accuracy", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-desk-empty-"));
    const snapshot = buildOperatorSnapshot({
      now: NOW,
      folders: emptyFolders(root),
      alertConfig: defaultAlertConfig()
    });
    expect(snapshot.dataLabel).toBe("synthetic-demo");
    expect(snapshot.live_backends).toBe(false);
    expect(snapshot.writes).toBe(false);
    expect(snapshot.author).toBe("Aziel Eliab");
    expect(snapshot.version).toBe(RUNTIME_MANIFEST.version);
    expect(snapshot.pilot).toEqual({ optionC: "not-started", optionD: "not-started" });
    expect(snapshot.series.length).toBeGreaterThan(1);
    expect(snapshot.metrics.jobs).toBeGreaterThan(0);
    expect(snapshot.mission.goals[0]?.measure).toBe("calls-completed");
    expect(snapshot.mission.goals[0]?.elapsedFraction).toBeGreaterThan(0);
    expect(snapshot.mission.goals[0]?.elapsedFraction).toBeLessThanOrEqual(1);
    expect(snapshot.fulfillment.steps.some((step) => step.reached && step.step === "READY")).toBe(true);
    expect(snapshot.scores.every((score) => score.inventedAccuracy === false)).toBe(true);
    const recorded = snapshot.scores.find((score) => score.id === "recorded-shadow-confidence");
    expect(recorded?.value).toBe(describeConfidence(RECORDED_SYNTHETIC_SHADOW_CONFIDENCE));
    expect(recorded?.note).toMatch(/Not measured accuracy/);
    expect(snapshot.report.status).toBe("simulated");
    expect(snapshot.alerts.some((alert) => alert.title === "Synthetic demo")).toBe(true);
    expect(snapshot.alerts.some((alert) => alert.title === "Local alert rules")).toBe(true);
    expect(snapshot.ruleAlerts.map((alert) => alert.rule).sort()).toEqual([
      "capacity",
      "late-jobs",
      "verification-stall"
    ]);
    expect(snapshot.ruleAlerts.every((alert) => alert.inventedAccuracy === false && alert.dataLabel === "synthetic-demo")).toBe(true);
    expect(snapshot.ruleAlerts.every((alert) => !/\d+%/.test(alert.detail))).toBe(true);
    expect(snapshot.honesty).toMatch(/Not a live GM pilot/);

    const html = renderDeskPage(snapshot);
    expect(html).toContain("<svg");
    expect(html).toContain("Synthetic demo");
    expect(html).toContain("Mission board");
    expect(html).toContain("live_backends false");
    expect(html).toContain("UNVERIFIED");
    expect(html).toContain("Operator desk");
    expect(html).toContain("Acknowledge");
    expect(html).toContain("Active rules");
    expect(html).toContain("History");
    expect(html).toContain("Open slots at or below the local threshold");
    expect(html).not.toContain("92%");
  });

  it("labels a dropped synthetic trades-app export as BYO-admitted and keeps confidence withheld", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-desk-byo-"));
    const folders = emptyFolders(root);
    const trades = folders.find((folder) => folder.preferClass === "trades-app");
    if (!trades) throw new Error("missing trades-app folder");
    copyFileSync(join(FIXTURES, "jobber-export.json"), join(trades.dir, "jobber-export.json"));
    copyFileSync(join(FIXTURES, "servicetitan-export.json"), join(folders[0]!.dir, "export.json"));

    const original = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("network refused");
    };
    try {
      const snapshot = buildOperatorSnapshot({
        now: NOW,
        folders,
        config: {
          instanceId: "local",
          servicetitanPath: folders[0]!.dir,
          probooksPath: folders[1]!.dir,
          tradesAppPath: trades.dir,
          tradesAppReadEndpoint: "http://127.0.0.1:9/read",
          receiptPath: join(root, "missing-receipts.jsonl"),
          ledgerPath: join(root, "missing-ledger.jsonl")
        }
      });
      expect(snapshot.dataLabel).toBe("byo-admitted-synthetic");
      expect(snapshot.inbound.map((row) => row.peerClass).sort()).toEqual(["servicetitan", "trades-app"]);
      expect(snapshot.inbound.every((row) => row.verificationStatus === "UNVERIFIED" && row.write === false)).toBe(true);
      expect(snapshot.metrics.admittedPackets).toBe(snapshot.metrics.unverified);
      expect(snapshot.metrics.jobs).toBeGreaterThan(0);
      const confidence = snapshot.scores.find((score) => score.id === "prediction-confidence");
      expect(confidence?.value).toBe("withheld");
      expect(snapshot.scores.some((score) => score.value.includes("72%"))).toBe(false);
      expect(snapshot.fulfillment.steps.every((step) => step.reached === false)).toBe(true);
      expect(snapshot.readEndpointHints.some((hint) => /not called/.test(hint))).toBe(true);
      expect(JSON.stringify(snapshot.inbound)).not.toContain("Synthetic Client");
      expect(snapshot.report.status).toBe("observed");
      const html = renderDeskPage(snapshot);
      expect(html).toContain("BYO-admitted synthetic drill");
      expect(html).toContain("jobber");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("serves the desk on localhost and refreshes after a new drop", async () => {
    const root = mkdtempSync(join(tmpdir(), "tr-desk-http-"));
    const folders = emptyFolders(root);
    const desk = await startOperatorDesk({
      port: 0,
      folders,
      cwd: root,
      alertStatePath: join(root, "alert-state.json"),
      alertConfig: defaultAlertConfig()
    });
    try {
      const page = await fetch(desk.url);
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("The day, on this machine.");
      expect(html).toContain("Synthetic demo");
      const denied = await fetch(desk.url, { method: "POST", body: "{}" });
      expect(denied.status).toBe(405);
      const before = (await (await fetch(`${desk.url}api/snapshot`)).json()) as { dataLabel: string };
      expect(before.dataLabel).toBe("synthetic-demo");
      const trades = folders.find((folder) => folder.preferClass === "trades-app");
      if (!trades) throw new Error("missing folder");
      copyFileSync(join(FIXTURES, "generic-jobs.json"), join(trades.dir, "generic-jobs.json"));
      const after = (await (await fetch(`${desk.url}api/snapshot`)).json()) as {
        dataLabel: string;
        inbound: { profileId: string }[];
        writes: boolean;
      };
      expect(after.dataLabel).toBe("byo-admitted-synthetic");
      expect(after.inbound[0]?.profileId).toBe("generic-json");
      expect(after.writes).toBe(false);
    } finally {
      await desk.close();
    }
  });

  it("reads inbound under an explicit root", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-desk-root-"));
    const dir = join(root, "data", "inbound", "trades-app");
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(FIXTURES, "housecall-export.json"), join(dir, "housecall-export.json"));
    const snapshot = buildOperatorSnapshot({ cwd: root, now: NOW });
    expect(snapshot.dataLabel).toBe("byo-admitted-synthetic");
    expect(snapshot.inbound[0]?.profileId).toBe("housecall-pro");
    expect(snapshot.metrics.appointments).toBeGreaterThan(0);
  });

  it("refuses a non-local bind", () => {
    expect(() => startOperatorDesk({ host: "0.0.0.0", port: 0 })).toThrow(/127\.0\.0\.1/);
  });
});
