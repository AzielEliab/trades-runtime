import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUNTIME_MANIFEST } from "../src/manifest.js";
import {
  acknowledgeAlert,
  applyDeskAlerts,
  defaultAlertConfig,
  dispatchLocalHooks,
  emptyAlertState,
  parseAlertConfig,
  type DeskRuleSignals
} from "../src/desk/alerts.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { parseLocalInboundConfig } from "../src/spine/local-inbound-config.js";

const NOW = "2026-09-25T12:00:00Z";

function signals(partial: Partial<DeskRuleSignals> = {}): DeskRuleSignals {
  return {
    dataLabel: "byo-admitted",
    now: NOW,
    evidenceTrust: "MEDIUM",
    verification: "UNVERIFIED",
    bookingBlock: "OPEN",
    openSlots: 8,
    booked: 4,
    lane: 12,
    lateJobs: 0,
    lateBasis: "Admitted job rows: 0 unfinished before the mission day, 0 counted today.",
    oldestObservationAt: "2026-09-25T11:00:00Z",
    missionElapsedFraction: 0.5,
    missionActual: 2,
    missionExpectedPace: 2,
    ...partial
  };
}

describe("local alert rules", () => {
  it("matches the committed example and refuses phone-home", () => {
    const example = parseAlertConfig(JSON.parse(readFileSync("data/runtime/alerts.json.example", "utf8")) as unknown);
    expect(example.rules).toEqual(defaultAlertConfig().rules);
    expect(example.hooks).toEqual({ file: null, webhook: null });
    expect(() => parseAlertConfig({ phoneHome: true })).toThrow(/phoneHome/);
    expect(() => parseAlertConfig({ hooks: { webhook: "https://trades-runtime.vibelock.workers.dev/hook" } })).toThrow(
      /no phone-home/
    );
    expect(() => parseAlertConfig({ hooks: { webhook: "https://example.com/alert" } })).toThrow(/no phone-home/);
    expect(() => parseAlertConfig({ hooks: { file: "https://example.com/alerts.jsonl" } })).toThrow(/local path/);
    expect(() => parseAlertConfig({ hooks: { file: "data/tenants/alerts.jsonl" } })).toThrow(/tenants/);
    expect(parseAlertConfig({ hooks: { webhook: "http://127.0.0.1:9/alerts" } }).hooks.webhook).toBe(
      "http://127.0.0.1:9/alerts"
    );
    expect(() => parseLocalInboundConfig({ alertsPath: "data/tenants/alerts.json" })).toThrow(/tenants/);
    expect(() => parseLocalInboundConfig({ alertsPath: "https://example.com/alerts.json" })).toThrow(/local file path/);
    expect(RUNTIME_MANIFEST.modules.some((module) => module.slug === "alert-rules")).toBe(true);
  });

  it("fires from desk scores and does not invent an accuracy percent", () => {
    const config = defaultAlertConfig();
    const quiet = applyDeskAlerts({ signals: signals(), config, state: null, now: NOW });
    expect(quiet.active).toEqual([]);

    const capacity = applyDeskAlerts({
      signals: signals({ dataLabel: "synthetic-demo", openSlots: 0, lane: 12, booked: 12 }),
      config,
      state: null,
      now: NOW
    });
    const capacityAlert = capacity.active.find((alert) => alert.rule === "capacity");
    expect(capacityAlert?.severity).toBe("hold");
    expect(capacityAlert?.detail).toMatch(/Synthetic demo/);
    expect(capacityAlert?.detail).not.toMatch(/\d+%/);
    expect(capacityAlert?.inventedAccuracy).toBe(false);

    const late = applyDeskAlerts({
      signals: signals({ lateJobs: 2, dataLabel: "byo-admitted-synthetic" }),
      config,
      state: null,
      now: NOW
    });
    expect(late.active.find((alert) => alert.rule === "late-jobs")?.detail).toMatch(/BYO-admitted synthetic drill/);

    const trust = applyDeskAlerts({
      signals: signals({ evidenceTrust: "LOW" }),
      config,
      state: quiet.state,
      now: NOW
    });
    const trustAlert = trust.active.find((alert) => alert.rule === "trust-band");
    expect(trustAlert?.title).toMatch(/dropped/);
    expect(trustAlert?.detail).toMatch(/Trust is not truth/);
    expect(trustAlert?.detail).not.toMatch(/\d+%/);

    const booking = applyDeskAlerts({
      signals: signals({ bookingBlock: "BLOCK_NEW_BOOKING", missionActual: 1, missionExpectedPace: 4.2, missionElapsedFraction: 0.8 }),
      config,
      state: null,
      now: NOW
    });
    expect(booking.active.find((alert) => alert.rule === "booking-block")?.detail).toMatch(/recommendBlock is BLOCK_NEW_BOOKING/);

    const stalled = applyDeskAlerts({
      signals: signals({ oldestObservationAt: "2026-09-24T00:00:00Z", verification: "UNVERIFIED" }),
      config,
      state: null,
      now: NOW
    });
    expect(stalled.active.find((alert) => alert.rule === "verification-stall")?.detail).toMatch(/Wrapper admission is not verification/);

    const fresh = applyDeskAlerts({
      signals: signals({ oldestObservationAt: null }),
      config,
      state: null,
      now: NOW
    });
    expect(fresh.active.some((alert) => alert.rule === "verification-stall")).toBe(false);
    expect(fresh.notices.some((notice) => notice.title === "Verification stall rule waiting")).toBe(true);

    const blankLane = applyDeskAlerts({
      signals: signals({ openSlots: null, lane: null }),
      config,
      state: null,
      now: NOW
    });
    expect(blankLane.active.some((alert) => alert.rule === "capacity")).toBe(false);
    expect(blankLane.notices.some((notice) => /does not invent a lane/.test(notice.detail))).toBe(true);
  });

  it("acknowledges, keeps history, and appends a local file hook once", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-alerts-"));
    const hook = join(root, "alerts.jsonl");
    const config = parseAlertConfig({
      ...defaultAlertConfig(),
      hooks: { file: hook, webhook: null }
    });
    const first = applyDeskAlerts({
      signals: signals({ openSlots: 1, lateJobs: 1 }),
      config,
      state: emptyAlertState(),
      now: NOW
    });
    const dispatched = dispatchLocalHooks({ cwd: root, config, raised: first.raised, now: NOW, fetchImpl: () => {
      throw new Error("webhook should stay off");
    } });
    expect(dispatched.fileAppended).toBe(first.raised.length);
    expect(readFileSync(hook, "utf8").trim().split("\n")).toHaveLength(first.raised.length);
    const line = JSON.parse(readFileSync(hook, "utf8").trim().split("\n")[0]!) as { phoneHome: boolean; writes: boolean };
    expect(line.phoneHome).toBe(false);
    expect(line.writes).toBe(false);
    expect(JSON.stringify(line)).not.toMatch(/Synthetic Client/);

    const acked = acknowledgeAlert(first.state, first.active[0]!.id, "operator", NOW);
    expect(acked.found).toBe(true);
    expect(acked.state.alerts.find((alert) => alert.id === first.active[0]!.id)?.acknowledgedAt).toBe(NOW);

    const second = applyDeskAlerts({
      signals: signals({ openSlots: 1, lateJobs: 1 }),
      config,
      state: acked.state,
      now: "2026-09-25T12:05:00Z"
    });
    expect(second.raised).toEqual([]);
    expect(second.history.length).toBe(first.history.length);
    const still = second.active.find((alert) => alert.id === first.active[0]!.id);
    expect(still?.acknowledgedAt).toBe(NOW);

    const cleared = applyDeskAlerts({
      signals: signals(),
      config,
      state: second.state,
      now: "2026-09-25T13:00:00Z"
    });
    expect(cleared.active).toEqual([]);
    expect(cleared.history.some((alert) => alert.active === false)).toBe(true);
  });

  it("calls a loopback webhook and does not call a public host", () => {
    const calls: string[] = [];
    const config = parseAlertConfig({
      hooks: { webhook: "http://127.0.0.1:9/local-alerts" }
    });
    const applied = applyDeskAlerts({
      signals: signals({ bookingBlock: "CLOSED" }),
      config,
      state: null,
      now: NOW
    });
    dispatchLocalHooks({
      cwd: process.cwd(),
      config,
      raised: applied.raised,
      now: NOW,
      fetchImpl: (input) => {
        calls.push(String(input));
        return Promise.resolve(new Response("ok"));
      }
    });
    expect(calls).toEqual(["http://127.0.0.1:9/local-alerts"]);
    expect(() =>
      dispatchLocalHooks({
        cwd: process.cwd(),
        config: {
          ...config,
          hooks: { file: null, webhook: "https://trades-runtime.vibelock.workers.dev/hook" }
        },
        raised: applied.raised,
        now: NOW,
        fetchImpl: () => {
          calls.push("public");
          return Promise.resolve(new Response("no"));
        }
      })
    ).toThrow(/no phone-home/);
    expect(calls).not.toContain("public");
  });

  it("reads inline local.json rules and a gitignored file, and the desk can acknowledge", async () => {
    const root = mkdtempSync(join(tmpdir(), "tr-alerts-desk-"));
    for (const kind of ["servicetitan", "probooks", "trades-app"]) {
      mkdirSync(join(root, "data", "inbound", kind), { recursive: true });
    }
    writeFileSync(
      join(root, "data", "inbound", "local.json"),
      JSON.stringify({
        instanceId: "local",
        alerts: {
          rules: {
            capacity: { openSlotsAtOrBelow: 0 },
            lateJobs: { countAtOrAbove: 10000 },
            verificationStall: { stallMinutes: 400000 }
          },
          hooks: { file: null, webhook: null }
        }
      })
    );
    const inline = buildOperatorSnapshot({ cwd: root, now: NOW });
    expect(inline.dataLabel).toBe("synthetic-demo");
    expect(inline.alertRules.source).toBe("local.json");
    expect(inline.ruleAlerts).toEqual([]);
    expect(inline.alerts.some((alert) => alert.title === "Trust-band rule waiting")).toBe(true);

    const configDir = join(root, "data", "runtime", "local");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "alerts.json"),
      JSON.stringify({
        hooks: { webhook: "https://example.com/phone" }
      })
    );
    const fetchCalls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (input) => {
      fetchCalls.push(String(input));
      return Promise.resolve(new Response("no"));
    };
    try {
      const invalid = buildOperatorSnapshot({ cwd: root, now: NOW, persistAlertState: true });
      expect(invalid.alertRules.source).toBe("invalid");
      expect(invalid.alerts.some((alert) => alert.title === "Alert config was not applied")).toBe(true);
      expect(invalid.alertRules.hooks.webhook).toBe(false);
      expect(fetchCalls).toEqual([]);
      expect(invalid.ruleAlerts.some((alert) => alert.rule === "capacity")).toBe(true);
    } finally {
      globalThis.fetch = original;
    }

    const statePath = join(root, "alert-state.json");
    const desk = await startOperatorDesk({
      port: 0,
      cwd: root,
      alertStatePath: statePath,
      alertConfig: defaultAlertConfig()
    });
    try {
      const page = await fetch(desk.url);
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("rule-banner");
      expect(html).toContain("data-ack");
      const view = (await (await fetch(`${desk.url}api/view`)).json()) as { "rule-banner": string; alerts: string };
      expect(view["rule-banner"]).toContain("capacity");
      expect(view.alerts).toContain("History");
      const snapshot = (await (await fetch(`${desk.url}api/snapshot`)).json()) as {
        ruleAlerts: { id: string; acknowledgedAt: string | null }[];
        writes: boolean;
      };
      expect(snapshot.writes).toBe(false);
      const id = snapshot.ruleAlerts[0]?.id;
      if (!id) throw new Error("expected a firing rule");
      const denied = await fetch(desk.url, { method: "POST", body: "{}" });
      expect(denied.status).toBe(405);
      const ack = await fetch(`${desk.url}api/alerts/ack`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, by: "operator" })
      });
      expect(ack.status).toBe(200);
      const body = (await ack.json()) as { ok: boolean; vendorWrite: boolean; phoneHome: boolean };
      expect(body.ok).toBe(true);
      expect(body.vendorWrite).toBe(false);
      expect(body.phoneHome).toBe(false);
      const after = (await (await fetch(`${desk.url}api/snapshot`)).json()) as {
        ruleAlerts: { id: string; acknowledgedAt: string | null }[];
        alertHistory: { id: string; acknowledgedAt: string | null }[];
      };
      expect(after.ruleAlerts.find((alert) => alert.id === id)?.acknowledgedAt).toBeTruthy();
      expect(after.alertHistory.find((alert) => alert.id === id)?.acknowledgedAt).toBeTruthy();
      const afterView = (await (await fetch(`${desk.url}api/view`)).json()) as { "rule-banner": string; alerts: string };
      expect(afterView["rule-banner"]).not.toContain(`data-rule="${id.split(":")[0]}"`);
      expect(afterView.alerts).toContain("Acknowledged");
      expect(afterView.alerts).toContain("History");
    } finally {
      await desk.close();
    }
  });

  it("shows a booking-block rule when the mission clock is behind pace", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-alerts-pace-"));
    const folders = (["servicetitan", "probooks", "trades-app"] as const).map((preferClass) => {
      const dir = join(root, preferClass);
      mkdirSync(dir, { recursive: true });
      return { dir, preferClass };
    });
    const snapshot = buildOperatorSnapshot({
      now: "2026-09-25T20:00:00Z",
      folders,
      alertConfig: defaultAlertConfig()
    });
    expect(snapshot.bookingBlock).toBe("BLOCK_NEW_BOOKING");
    expect(snapshot.ruleAlerts.some((alert) => alert.rule === "booking-block")).toBe(true);
    expect(snapshot.scores.find((score) => score.id === "capacity-block")?.value).toBe("BLOCK_NEW_BOOKING");
  });
});
