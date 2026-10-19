import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRefrigerantBoard, classifyRefrigerant, leakRatePct, REFRIGERANT_RULES } from "../src/modules/refrigerant.js";
import { buildPermitBoard } from "../src/modules/permits.js";
import { buildAgreementBoard } from "../src/modules/agreements.js";
import { MODULE_READ_TOOLS } from "../src/modules/registry.js";
import { ApprovalGate } from "../src/approvals/gate.js";
import { handleLocalMcp } from "../src/approvals/local-mcp.js";
import { defaultPermissionSettings, WRITE_PERMISSIONS } from "../src/approvals/permissions.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const NOW = "2026-10-19T12:00:00.000Z";
const box = () => mkdtempSync(join(tmpdir(), "tr-modules-"));
const ctx = (cwd: string) => ({ cwd, instanceId: "local", now: NOW });

function seed(cwd: string, module: string, data: unknown) {
  mkdirSync(join(cwd, "data/runtime/local"), { recursive: true });
  writeFileSync(join(cwd, "data/runtime/local", `${module}.json`), JSON.stringify(data));
}

function example(module: string) {
  return JSON.parse(readFileSync(join(__dirname, "../data/runtime", `${module}.json.example`), "utf8"));
}

function dropJobber(cwd: string) {
  mkdirSync(join(cwd, "data/inbound/jobber"), { recursive: true });
  copyFileSync(join(__dirname, "fixtures/modules/jobber-compliance.json"), join(cwd, "data/inbound/jobber/jobber-compliance.json"));
}

describe("refrigerant log (EPA 608 / AIM Act)", () => {
  it("uses the cited thresholds and trigger rates", () => {
    expect(REFRIGERANT_RULES.section608.thresholdLbs).toBe(50);
    expect(REFRIGERANT_RULES.aimActHfc.thresholdLbs).toBe(15);
    for (const rules of [REFRIGERANT_RULES.section608.rates, REFRIGERANT_RULES.aimActHfc.rates]) {
      expect(rules["commercial-refrigeration"]).toBe(20);
      expect(rules["industrial-process"]).toBe(30);
      expect(rules["comfort-cooling"]).toBe(10);
    }
    expect(classifyRefrigerant("r22")).toBe("ods");
    expect(classifyRefrigerant("R-410A")).toBe("hfc");
    expect(classifyRefrigerant("R-290")).toBe("unknown");
  });

  it("computes 82.152 leak rates (annualizing and rolling average)", () => {
    // 5 lb added 91 days after the previous addition on a 60 lb charge.
    expect(leakRatePct({ method: "annualizing", fullChargeLbs: 60, additions: [{ at: "2026-04-01", pounds: 4 }, { at: "2026-07-01", pounds: 5 }] })).toBe(33.4);
    // First addition: 365 days substituted.
    expect(leakRatePct({ method: "annualizing", fullChargeLbs: 100, additions: [{ at: "2026-07-01", pounds: 5 }] })).toBe(5);
    expect(leakRatePct({ method: "rolling-average", fullChargeLbs: 60, additions: [{ at: "2025-06-01", pounds: 10 }, { at: "2026-04-01", pounds: 4 }, { at: "2026-07-01", pounds: 5 }] })).toBe(15);
    expect(leakRatePct({ method: "annualizing", fullChargeLbs: 60, additions: [] })).toBeNull();
  });

  it("alerts when an appliance over threshold exceeds its trigger rate", () => {
    const cwd = box();
    seed(cwd, "refrigerant", example("refrigerant"));
    const board = buildRefrigerantBoard(ctx(cwd));
    const rtu = board.appliances.find((row) => row.applianceId === "SYN-RTU-1")!;
    expect(rtu.regime).toBe("section608");
    expect(rtu.triggerRatePct).toBe(10);
    expect(rtu.leakRatePct).toBe(33.4);
    expect(rtu.exceeds).toBe(true);
    expect(rtu.repairDueBy).toBe("2026-07-31");
    expect(board.alerts.some((alert) => alert.id === "refrigerant-leak:SYN-RTU-1" && alert.citation.includes("82.157"))).toBe(true);
    const walkIn = board.appliances.find((row) => row.applianceId === "SYN-WALKIN-1")!;
    expect(walkIn.regime).toBe("aimActHfc");
    expect(walkIn.triggerRatePct).toBe(20);
    expect(board.cylinders.find((c) => c.cylinderId === "SYN-CYL-1")!.balanceLbs).toBe(21);
    expect(board.byTechnician[0]!.techCertNumber).toBe("SYN-608-0001");
  });

  it("does not apply 84.106 to residential/light-commercial AC or under 15 lb, and flags unknown classes", () => {
    const cwd = box();
    seed(cwd, "refrigerant", {
      appliances: [
        { applianceId: "A", refrigerant: "R-410A", fullChargeLbs: 20, residentialLightCommercial: true },
        { applianceId: "B", refrigerant: "R-410A", fullChargeLbs: 10 },
        { applianceId: "C", refrigerant: "R-290", fullChargeLbs: 60 }
      ],
      events: [{ applianceId: "C", action: "charge", at: "2026-10-01", pounds: 30 }]
    });
    const board = buildRefrigerantBoard(ctx(cwd));
    expect(board.appliances.map((row) => row.regime)).toEqual(["not-covered", "not-covered", "undetermined"]);
    expect(board.alerts.some((alert) => alert.id === "refrigerant-undetermined:C")).toBe(true);
    expect(board.alerts.some((alert) => alert.id.startsWith("refrigerant-cert:"))).toBe(false);
  });

  it("reads refrigerant entries on admitted platform jobs and flags a missing cert only when absent", () => {
    const cwd = box();
    dropJobber(cwd);
    seed(cwd, "refrigerant", { appliances: [{ applianceId: "SYN-CASE-1", applianceType: "commercial-refrigeration", refrigerant: "R-404A", fullChargeLbs: 18 }] });
    const board = buildRefrigerantBoard(ctx(cwd));
    const row = board.appliances[0]!;
    expect(row.chargedLbs).toBe(3);
    expect(row.leakRatePct).toBe(16.7);
    expect(row.exceeds).toBe(false);
    expect(board.byTechnician[0]).toMatchObject({ technicianId: "SYN-CMP-T-1", techCertNumber: "SYN-608-9", missingCert: false });
    expect(board.source.peers).toEqual(["jobber"]);
  });
});

describe("permits and inspections", () => {
  it("ages pending, overdue scheduled, and failed permits per jurisdiction", () => {
    const cwd = box();
    dropJobber(cwd);
    seed(cwd, "permits", {
      settings: { pendingDays: 5 },
      permits: [
        { permitId: "P1", jobId: "J1", jurisdiction: "Town A", status: "pending", appliedOn: "2026-10-01" },
        { permitId: "P2", jobId: "J2", jurisdiction: "Town A", status: "scheduled", inspectionScheduledFor: "2026-10-15" },
        { permitId: "P3", jobId: "J3", jurisdiction: "Town B", status: "passed", appliedOn: "2026-09-01", inspectedOn: "2026-09-11" }
      ]
    });
    const board = buildPermitBoard(ctx(cwd));
    expect(board.settings.pendingDays).toBe(5);
    expect(board.byStatus).toMatchObject({ pending: 1, scheduled: 1, passed: 1, failed: 1 });
    expect(board.alerts.map((a) => a.permitId).sort()).toEqual(["P1", "P2", "SYN-CMP-P-1"]);
    expect(board.blockedJobs.map((row) => row.jobId)).toContain("SYN-CMP-JOB-1");
    expect(board.blockedJobs.map((row) => row.jobId)).not.toContain("J3");
    expect(board.byJurisdiction.find((j) => j.jurisdiction === "Town B")!.avgDaysToPass).toBe(10);
  });
});

describe("maintenance agreements", () => {
  it("finds renewals, missed tune-ups, and not-visited members; values risk only from named prices", () => {
    const cwd = box();
    dropJobber(cwd);
    seed(cwd, "agreements", {
      agreements: [
        { agreementId: "A1", customerName: "M1", startOn: "2025-11-15", renewalOn: "2026-11-15", status: "active", visitsPerTerm: 2, visits: ["2026-03-10"] },
        { agreementId: "A2", customerName: "M2", startOn: "2025-06-01", renewalOn: "2026-06-01", status: "active", price: 199, visitsPerTerm: 2, visits: ["2025-09-01", "2026-01-15"] },
        { agreementId: "A3", customerName: "M3", startOn: "2026-01-01", renewalOn: "2027-01-01", status: "active", price: 300, visitsPerTerm: 2, visits: [] }
      ]
    });
    const board = buildAgreementBoard(ctx(cwd));
    const byId = Object.fromEntries(board.agreements.map((row) => [row.agreementId, row]));
    expect(byId.A1!.renewalDue).toBe(true);
    expect(byId.A1!.missedTuneUps).toBe(0);
    expect(byId.A2!.lapsed).toBe(true);
    expect(byId.A3!.missedTuneUps).toBe(1);
    expect(byId.A3!.notVisited).toBe(true);
    // Agreement from the admitted Jobber job: priced 1200, renewal 2026-11-01, one completed visit.
    expect(byId["SYN-CMP-A-1"]!.renewalDue).toBe(true);
    expect(byId["SYN-CMP-A-1"]!.lastVisitOn).toBe("2026-10-10");
    expect(board.revenueAtRisk.amount).toBe(199 + 300 + 1200);
    expect(board.revenueAtRisk.agreementsPriceUnknown).toBe(1);
  });

  it("reports no revenue at risk when no prices are on file", () => {
    const cwd = box();
    seed(cwd, "agreements", example("agreements"));
    const board = buildAgreementBoard(ctx(cwd));
    expect(board.revenueAtRisk).toMatchObject({ amount: 0, agreementsPriced: 0, agreementsPriceUnknown: 1 });
  });
});

describe("module writes through the approval gate", () => {
  it("adds refrigerant.write, permits.write, agreements.write, default off", async () => {
    for (const permission of ["refrigerant.write", "permits.write", "agreements.write"]) expect(WRITE_PERMISSIONS).toContain(permission);
    const cwd = box();
    const gate = new ApprovalGate({ cwd, instanceId: "local" });
    const refused = await gate.requestWrite({ tool: "trades_runtime_refrigerant_record", args: { applianceId: "X", action: "charge", at: NOW, pounds: 1 }, requestedBy: "mcp:a" });
    expect(refused.status).toBe("refused");
    expect(existsSync(join(cwd, "data/runtime/local/refrigerant.json"))).toBe(false);
  });

  it("writes only after the operator says yes, and the board reads the result", async () => {
    const cwd = box();
    const settings = { ...defaultPermissionSettings(), selected: ["refrigerant.write", "permits.write", "agreements.write"] as const };
    const gate = new ApprovalGate({ cwd, instanceId: "local", settings: { ...settings, selected: [...settings.selected] }, now: () => new Date(NOW) });
    const requests = [
      { tool: "trades_runtime_refrigerant_record", args: { applianceId: "RTU", action: "charge", at: "2026-10-18T10:00:00Z", pounds: 2, technicianId: "T1", techCertNumber: "C1" } },
      { tool: "trades_runtime_permit_update", args: { permitId: "P9", jobId: "J9", jurisdiction: "Town", status: "failed" } },
      { tool: "trades_runtime_agreement_update", args: { agreementId: "AG", kind: "renewal", renewalOn: "2027-10-01", price: 250 } },
      { tool: "trades_runtime_agreement_update", args: { agreementId: "AG", kind: "visit", on: "2026-10-18" } }
    ];
    for (const request of requests) {
      const pending = await gate.requestWrite({ ...request, requestedBy: "mcp:z" });
      expect(pending.status).toBe("pending");
      if (pending.status !== "pending") continue;
      const decided = await gate.decide({ approvalId: pending.approvalId, decision: "yes", decidedBy: "cli:op", via: "cli" });
      expect(decided.result?.outcome, request.tool).toBe("written");
    }
    const denied = await gate.requestWrite({ tool: "trades_runtime_permit_update", args: { permitId: "P9", jobId: "J9", jurisdiction: "Town", status: "passed" }, requestedBy: "mcp:z" });
    if (denied.status === "pending") await gate.decide({ approvalId: denied.approvalId, decision: "no", decidedBy: "cli:op", via: "cli" });
    expect(buildRefrigerantBoard(ctx(cwd)).totals.chargedLbs).toBe(2);
    expect(buildPermitBoard(ctx(cwd)).permits[0]!.status).toBe("failed");
    const agreement = buildAgreementBoard(ctx(cwd)).agreements[0]!;
    expect(agreement).toMatchObject({ agreementId: "AG", price: 250, lastVisitOn: "2026-10-18" });
    expect(readFileSync(join(cwd, "data/runtime/local/permits.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("refuses malformed module writes before an approval is created", async () => {
    const gate = new ApprovalGate({ cwd: box(), instanceId: "local", settings: { ...defaultPermissionSettings(), mode: "all" } });
    const bad = await gate.requestWrite({ tool: "trades_runtime_refrigerant_record", args: { applianceId: "X", action: "charge", at: NOW }, requestedBy: "mcp:a" });
    expect(bad.status).toBe("refused");
    if (bad.status === "refused") expect(bad.reason).toMatch(/needs pounds/);
  });
});

describe("module read surfaces", () => {
  it("lists read-only module tools on the local MCP and answers them", async () => {
    const cwd = box();
    seed(cwd, "permits", example("permits"));
    const gate = new ApprovalGate({ cwd, instanceId: "local" });
    const list = (await handleLocalMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, gate, "s")) as { result: { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> } };
    for (const tool of MODULE_READ_TOOLS) {
      const found = list.result.tools.find((row) => row.name === tool.name);
      expect(found?.annotations.readOnlyHint).toBe(true);
    }
    const call = (await handleLocalMcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "trades_runtime_permits" } }, gate, "s")) as { result: { structuredContent: { module: string; permits: unknown[] } } };
    expect(call.result.structuredContent.module).toBe("permits");
    expect(call.result.structuredContent.permits).toHaveLength(1);
  });

  it("the loopback desk serves module JSON and panels", async () => {
    const cwd = box();
    seed(cwd, "refrigerant", example("refrigerant"));
    const desk = await startOperatorDesk({ cwd, port: 0, now: NOW, persistAlertState: false, persistLocalReports: false });
    try {
      const json = (await (await fetch(`${desk.url}api/refrigerant`)).json()) as { module: string; alerts: unknown[] };
      expect(json.module).toBe("refrigerant");
      expect(json.alerts.length).toBeGreaterThan(0);
      for (const route of ["api/permits", "api/agreements.json"]) expect((await fetch(`${desk.url}${route}`)).status).toBe(200);
      const html = await (await fetch(desk.url)).text();
      for (const id of ["refrigerant-board", "permits-board", "agreements-board"]) expect(html).toContain(`id="${id}"`);
      expect(html).toContain("40 CFR 82.157");
    } finally {
      await desk.close();
    }
  });

  it("keeps catalog honesty flags", () => {
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
  });
});
