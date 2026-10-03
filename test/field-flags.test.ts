import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyDeskAlerts, buildAlertDigest, defaultAlertConfig, type DeskRuleSignals } from "../src/desk/alerts.js";
import {
  fieldFlagsFromInboundRow,
  parseFieldFlag,
  readFieldFlagDirectory,
  writeFieldFlagFile
} from "../src/desk/field-flags.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const NOW = "2026-10-03T16:00:00.000Z";

function signals(): DeskRuleSignals {
  return {
    dataLabel: "byo-admitted-synthetic",
    now: NOW,
    evidenceTrust: "MEDIUM",
    verification: "UNVERIFIED",
    bookingBlock: "OPEN",
    openSlots: 8,
    booked: 4,
    lane: 12,
    lateJobs: 0,
    lateBasis: "none",
    oldestObservationAt: NOW,
    missionElapsedFraction: 0.5,
    missionActual: 1,
    missionExpectedPace: 1
  };
}

const FLAG = {
  flagId: "sample-van-down",
  vanId: "van-sample-1",
  jobId: "JOB-1",
  kind: "vanDown",
  severity: "hold",
  note: "Sample fixture. Not an accuracy percent.",
  raisedAt: NOW,
  raisedBy: "sample-tech",
  inventedAccuracy: false
};

describe("local field flags", () => {
  it("refuses invented accuracy, phone-home, and a missing van", () => {
    expect(parseFieldFlag(FLAG).inventedAccuracy).toBe(false);
    expect(() => parseFieldFlag({ ...FLAG, inventedAccuracy: true })).toThrow(/invented accuracy/);
    expect(() => parseFieldFlag({ ...FLAG, sms: "555" })).toThrow(/sms/);
    expect(() => parseFieldFlag({ ...FLAG, accuracyPercent: 90 })).toThrow(/accuracyPercent/);
    const waiting = fieldFlagsFromInboundRow({
      raw: { id: "JOB-NO-VAN", needsParts: true },
      jobId: "JOB-NO-VAN",
      now: NOW
    });
    expect(waiting.flags).toEqual([]);
    expect(waiting.notices[0]?.title).toBe("Field flag waiting on a van");
    expect(waiting.notices[0]?.detail).toMatch(/No van was invented/);
    expect(JSON.stringify(waiting)).not.toMatch(/\d+%/);
  });

  it("shows an explicit flag on the desk digest and can turn the rule off", () => {
    const config = defaultAlertConfig();
    const shown = applyDeskAlerts({
      signals: signals(),
      config,
      state: null,
      now: NOW,
      fieldFlags: [parseFieldFlag(FLAG)]
    });
    const hit = shown.active.find((alert) => alert.rule === "field-flag");
    expect(hit?.title).toMatch(/Van down/);
    expect(hit?.inventedAccuracy).toBe(false);
    expect(hit?.detail).not.toMatch(/\d+%/);
    const digest = buildAlertDigest({
      version: RUNTIME_MANIFEST.version,
      generatedAt: NOW,
      dataLabel: "byo-admitted-synthetic",
      hits: shown.active
    });
    expect(digest.hits.some((row) => row.rule === "field-flag")).toBe(true);
    const hidden = applyDeskAlerts({
      signals: signals(),
      config: parseFieldFlag ? { ...config, rules: { ...config.rules, fieldFlag: { enabled: false } } } : config,
      state: null,
      now: NOW,
      fieldFlags: [parseFieldFlag(FLAG)]
    });
    expect(hidden.active.some((alert) => alert.rule === "field-flag")).toBe(false);
    expect(hidden.notices.some((notice) => notice.title === "Field-flag rule off")).toBe(true);
  });

  it("writes a loopback flag file and the desk shows it", async () => {
    const root = mkdtempSync(join(tmpdir(), "tr-field-flag-"));
    const written = writeFieldFlagFile(join(root, "data", "runtime", "local", "field-flags"), FLAG);
    expect(written.flag.vanId).toBe("van-sample-1");
    const read = readFieldFlagDirectory(join(root, "data", "runtime", "local", "field-flags"));
    expect(read.flags).toHaveLength(1);
    const desk = await startOperatorDesk({
      port: 0,
      cwd: root,
      persistAlertState: false,
      persistLocalReports: false,
      now: NOW
    });
    try {
      const raised = await fetch(`${desk.url}api/flags/raise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...FLAG,
          flagId: "sample-safety",
          kind: "safetyHold",
          severity: "hold",
          note: "Sample footing. Not an accuracy percent."
        })
      });
      expect(raised.status).toBe(200);
      const body = (await raised.json()) as { vendorWrite: boolean; inventedAccuracy: boolean; field_softwares_1_0: boolean };
      expect(body.vendorWrite).toBe(false);
      expect(body.inventedAccuracy).toBe(false);
      expect(body.field_softwares_1_0).toBe(false);
      const snapshot = (await (await fetch(`${desk.url}api/snapshot`)).json()) as {
        ruleAlerts: { rule: string; detail: string }[];
        pilot_started: boolean;
        live_backends: boolean;
      };
      expect(snapshot.pilot_started).toBe(false);
      expect(snapshot.live_backends).toBe(false);
      expect(snapshot.ruleAlerts.some((alert) => alert.rule === "field-flag" && alert.detail.includes("van-sample-1"))).toBe(
        true
      );
      const refused = await fetch(`${desk.url}api/flags/raise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...FLAG, inventedAccuracy: true })
      });
      expect(refused.status).toBe(400);
    } finally {
      await desk.close();
    }
    expect(readFileSync("src/shadow/office-try.ts", "utf8")).not.toMatch(/field-flags/);
    expect(readFileSync("src/shadow/field-try.ts", "utf8")).not.toMatch(/office-try/);
    expect(readFileSync("src/shadow/field-try.ts", "utf8")).not.toMatch(/buildOperatorSnapshot/);
  });
});
