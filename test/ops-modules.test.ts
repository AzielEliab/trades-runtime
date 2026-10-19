import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildWarrantyClaimBoard } from "../src/modules/warranty-claims.js";
import { buildTruckStockBoard } from "../src/modules/truck-stock-plan.js";
import { buildCallbackRootCauseBoard } from "../src/modules/callback-root-cause.js";
import { MODULE_READ_TOOLS } from "../src/modules/registry.js";
import { ApprovalGate } from "../src/approvals/gate.js";
import { handleLocalMcp } from "../src/approvals/local-mcp.js";
import { defaultPermissionSettings, WRITE_PERMISSIONS } from "../src/approvals/permissions.js";
import { emptyStockBook, persistStockCount, recordStockCount } from "../src/domain/truck-stock.js";
import { startOperatorDesk } from "../src/desk/server.js";

const NOW = "2026-10-19T12:00:00.000Z";
const box = () => mkdtempSync(join(tmpdir(), "tr-ops-"));
const ctx = (cwd: string) => ({ cwd, instanceId: "local", now: NOW });

function seed(cwd: string, module: string, data: unknown) {
  mkdirSync(join(cwd, "data/runtime/local"), { recursive: true });
  writeFileSync(join(cwd, "data/runtime/local", `${module}.json`), JSON.stringify(data));
}

function dropOps(cwd: string) {
  mkdirSync(join(cwd, "data/inbound/jobber"), { recursive: true });
  copyFileSync(join(__dirname, "fixtures/modules/jobber-ops.json"), join(cwd, "data/inbound/jobber/jobber-ops.json"));
}

function example(module: string) {
  return JSON.parse(readFileSync(join(__dirname, "../data/runtime", `${module}.json.example`), "utf8"));
}

describe("manufacturer warranty claims", () => {
  it("finds warranty parts with no claim from flagged parts and warranty-labeled jobs", () => {
    const cwd = box();
    dropOps(cwd);
    const board = buildWarrantyClaimBoard(ctx(cwd));
    const ids = board.unclaimed.map((p) => `${p.jobId}:${p.partNumber}`).sort();
    // CAP-45 is flagged on the install job; MTR-1 is on a job labeled warranty; FLT-16 has no warranty label.
    expect(ids).toEqual(["SYN-OPS-A:CAP-45", "SYN-OPS-D:MTR-1"]);
    const cap = board.unclaimed.find((p) => p.partNumber === "CAP-45")!;
    expect(cap).toMatchObject({ manufacturer: "SynBrand", equipmentModel: "SYN-M1", replacedOn: "2026-09-01", ageDays: 48, filingDaysLeft: null });
    expect(board.alerts.some((a) => a.id === "warranty-unclaimed:SYN-OPS-A:CAP-45")).toBe(true);
  });

  it("matches claims, ages them, and uses filing windows only when the shop set them", () => {
    const cwd = box();
    dropOps(cwd);
    seed(cwd, "warranty-claims", {
      settings: { claimAgingDays: 10, filingWindowDays: { SynBrand: 50 } },
      claims: [
        { claimId: "C1", jobId: "SYN-OPS-A", partNumber: "CAP-45", manufacturer: "SynBrand", status: "submitted", submittedOn: "2026-09-02", amountClaimed: 85.5 },
        { claimId: "C2", jobId: "X", partNumber: "Y", status: "rejected" }
      ]
    });
    const board = buildWarrantyClaimBoard(ctx(cwd));
    expect(board.unclaimed.map((p) => p.partNumber)).toEqual(["MTR-1"]);
    expect(board.unclaimed[0]!.filingDaysLeft).toBe(36);
    expect(board.claims.find((c) => c.claimId === "C2")!.status).toBe("denied");
    expect(board.alerts.map((a) => a.id)).toEqual(expect.arrayContaining(["warranty-aging:C1", "warranty-denied:C2"]));
    expect(board.totals).toMatchObject({ amountClaimed: 85.5, amountPaid: 0, openClaims: 1 });
  });
});

describe("truck stock vs tomorrow", () => {
  it("compares counted van stock to tomorrow's job parts and suggests restock", () => {
    const cwd = box();
    dropOps(cwd);
    seed(cwd, "truck-stock", { settings: { timeZone: "UTC" }, vans: [{ vanId: "VAN-1", technicianIds: ["SYN-T1"] }], par: [{ sku: "FLT-16", min: 4 }] });
    let book = emptyStockBook("local", NOW);
    book = recordStockCount(book, { sku: "CAP-45", location: "ON_VAN", vanId: "VAN-1", quantity: 1, countedAt: NOW, countedBy: "op" });
    book = recordStockCount(book, { sku: "FLT-16", location: "ON_VAN", vanId: "VAN-1", quantity: 5, countedAt: NOW, countedBy: "op" });
    book = recordStockCount(book, { sku: "CAP-45", location: "BRANCH_STOCK", placeId: "SHOP", quantity: 10, countedAt: NOW, countedBy: "op" });
    const board = buildTruckStockBoard(ctx(cwd), undefined, book);
    expect(board.tomorrow).toBe("2026-10-20");
    expect(board.vans).toHaveLength(1);
    const lines = Object.fromEntries(board.vans[0]!.lines.map((l) => [l.sku, l]));
    expect(lines["CAP-45"]).toMatchObject({ needed: 2, onVan: 1, short: 1, suggestedRestock: 1, restockFrom: "BRANCH_STOCK" });
    expect(lines["FLT-16"]).toMatchObject({ needed: 3, onVan: 5, short: 0, par: 4, suggestedRestock: 2, restockFrom: "unknown" });
    expect(lines["TXV-2"]).toMatchObject({ onVan: null, short: null, suggestedRestock: null });
    expect(board.alerts.map((a) => a.id)).toEqual(expect.arrayContaining(["stock-short:VAN-1:CAP-45", "stock-uncounted:VAN-1:TXV-2"]));
    expect(board.totals).toMatchObject({ jobsTomorrow: 1, shortages: 1, uncounted: 1, restockUnits: 3 });
  });

  it("flags tomorrow's parts with no van, and ignores other days", () => {
    const cwd = box();
    dropOps(cwd);
    seed(cwd, "truck-stock", { settings: { timeZone: "UTC" }, demand: [{ jobId: "L1", sku: "Z", quantity: 1, scheduledFor: "2026-10-22" }] });
    const board = buildTruckStockBoard(ctx(cwd));
    expect(board.vans).toHaveLength(0);
    expect(board.unassigned.map((n) => n.sku).sort()).toEqual(["CAP-45", "FLT-16", "TXV-2"]);
  });
});

describe("callback root cause", () => {
  it("links callbacks only by explicit reference and rolls up by original tech, part, and model", () => {
    const cwd = box();
    dropOps(cwd);
    const board = buildCallbackRootCauseBoard(ctx(cwd));
    expect(board.totals).toMatchObject({ jobs: 5, callbacks: 2, warranty: 1, linked: 1, unlinked: 1 });
    expect(board.links[0]).toMatchObject({ callbackJobId: "SYN-OPS-B", originalJobId: "SYN-OPS-A", originalTechnicianId: "SYN-T1", callbackTechnicianId: "SYN-T2", partNumber: "CAP-45", equipmentModel: "SYN-M1", category: "part-failure", daysBetween: 19 });
    expect(board.unlinked[0]!.callbackJobId).toBe("SYN-OPS-C");
    expect(board.byTechnician[0]).toMatchObject({ key: "Synthetic Tech One", callbacks: 1 });
    expect(board.byPart[0]!.key).toBe("CAP-45");
  });

  it("uses local links for root cause and flags repeats", () => {
    const cwd = box();
    dropOps(cwd);
    seed(cwd, "callbacks", { links: [{ callbackJobId: "SYN-OPS-C", originalJobId: "SYN-OPS-A", partNumber: "CAP-45", installStep: "capacitor sizing", category: "install" }] });
    const board = buildCallbackRootCauseBoard(ctx(cwd));
    expect(board.totals.linked).toBe(2);
    expect(board.byPart[0]).toMatchObject({ key: "CAP-45", callbacks: 2 });
    expect(board.byInstallStep.find((r) => r.key === "capacitor sizing")!.callbacks).toBe(1);
    expect(board.alerts.some((a) => a.id === "callback-repeat:part:CAP-45")).toBe(true);
  });
});

describe("ops writes through the approval gate", () => {
  it("adds warranty_claims.write, truck_stock.write, callbacks.write, default off", async () => {
    for (const p of ["warranty_claims.write", "truck_stock.write", "callbacks.write"]) expect(WRITE_PERMISSIONS).toContain(p);
    const gate = new ApprovalGate({ cwd: box(), instanceId: "local" });
    const refused = await gate.requestWrite({ tool: "trades_runtime_truck_stock_count", args: { vanId: "V", sku: "S", quantity: 1 }, requestedBy: "mcp:a" });
    expect(refused.status).toBe("refused");
  });

  it("writes claims, van counts, and callback links only after a yes", async () => {
    const cwd = box();
    dropOps(cwd);
    seed(cwd, "truck-stock", { settings: { timeZone: "UTC" }, vans: [{ vanId: "VAN-1", technicianIds: ["SYN-T1"] }] });
    const gate = new ApprovalGate({ cwd, instanceId: "local", settings: { ...defaultPermissionSettings(), selected: ["warranty_claims.write", "truck_stock.write", "callbacks.write"] }, now: () => new Date(NOW) });
    const requests = [
      { tool: "trades_runtime_warranty_claim_update", args: { claimId: "C9", jobId: "SYN-OPS-D", partNumber: "MTR-1", status: "submitted", submittedOn: "2026-10-18" } },
      { tool: "trades_runtime_truck_stock_count", args: { vanId: "VAN-1", sku: "TXV-2", quantity: 0 } },
      { tool: "trades_runtime_callback_link", args: { callbackJobId: "SYN-OPS-C", originalJobId: "SYN-OPS-D", category: "diagnosis" } }
    ];
    for (const request of requests) {
      const pending = await gate.requestWrite({ ...request, requestedBy: "mcp:z" });
      expect(pending.status, request.tool).toBe("pending");
      if (pending.status !== "pending") continue;
      const decided = await gate.decide({ approvalId: pending.approvalId, decision: "yes", decidedBy: "cli:op", via: "cli" });
      expect(decided.result?.outcome, request.tool).toBe("written");
    }
    expect(buildWarrantyClaimBoard(ctx(cwd)).unclaimed.map((p) => p.partNumber)).toEqual(["CAP-45"]);
    const txv = buildTruckStockBoard(ctx(cwd)).vans[0]!.lines.find((l) => l.sku === "TXV-2")!;
    expect(txv).toMatchObject({ onVan: 0, short: 1 });
    expect(buildCallbackRootCauseBoard(ctx(cwd)).links.find((l) => l.callbackJobId === "SYN-OPS-C")).toMatchObject({ originalJobId: "SYN-OPS-D", category: "diagnosis" });
    const bad = await gate.requestWrite({ tool: "trades_runtime_callback_link", args: { callbackJobId: "A", originalJobId: "A" }, requestedBy: "mcp:z" });
    expect(bad.status).toBe("refused");
  });
});

describe("ops read surfaces", () => {
  it("exposes read-only MCP tools and desk panels for the ops modules", async () => {
    const cwd = box();
    dropOps(cwd);
    for (const module of ["warranty-claims", "truck-stock", "callbacks"]) seed(cwd, module, example(module));
    persistStockCount({ bookPath: join(cwd, "data/runtime/local/stock-counts.json"), book: emptyStockBook("local", NOW), line: { sku: "CAP-45", location: "ON_VAN", vanId: "SYN-VAN-1", quantity: 1, countedAt: NOW, countedBy: "op" } });
    const gate = new ApprovalGate({ cwd, instanceId: "local" });
    const list = (await handleLocalMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, gate, "s")) as { result: { tools: Array<{ name: string }> } };
    for (const name of ["trades_runtime_warranty_claims", "trades_runtime_truck_stock", "trades_runtime_callbacks"]) {
      expect(list.result.tools.some((t) => t.name === name)).toBe(true);
      expect(MODULE_READ_TOOLS.some((t) => t.name === name)).toBe(true);
    }
    const desk = await startOperatorDesk({ cwd, port: 0, now: NOW, persistAlertState: false, persistLocalReports: false });
    try {
      for (const route of ["api/warranty-claims", "api/truck-stock", "api/callbacks.json"]) expect((await fetch(`${desk.url}${route}`)).status).toBe(200);
      const html = await (await fetch(desk.url)).text();
      for (const id of ["warranty-claims-board", "truck-stock-board", "callbacks-board"]) expect(html).toContain(`id="${id}"`);
    } finally {
      await desk.close();
    }
  });
});
