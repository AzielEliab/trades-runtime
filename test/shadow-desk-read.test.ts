import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { planCli } from "../src/cli.js";
import { defaultAlertConfig } from "../src/desk/alerts.js";
import { recordFieldEvent } from "../src/desk/field-time.js";
import {
  addDiscount,
  addTask,
  applyDiscount,
  attachPart,
  setLabor,
  setMargin,
  setPartCost,
  updateJobPrices
} from "../src/desk/job-price.js";
import { readShadowDesk, shadowReadsFromSnapshot } from "../src/desk/shadow-read.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";
import { defaultLocalInboundConfig } from "../src/spine/local-inbound-config.js";

const NOW = "2026-09-25T18:00:00Z";
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(rootDir, "node_modules", ".bin", "tsx");

function emptyFolders(root: string) {
  return (["servicetitan", "probooks", "trades-app"] as const).map((preferClass) => {
    const dir = join(root, preferClass);
    return { dir, preferClass };
  });
}

function seedSharedList(root: string, instanceId: string): void {
  const roster = ["tech-maya"];
  recordFieldEvent({
    cwd: root,
    instanceId,
    kind: "clock-in",
    at: "2026-09-25T14:00:00Z",
    technicianId: "tech-maya",
    technicianName: "Maya Chen",
    jobId: "job-9",
    rosterIds: roster
  });
  recordFieldEvent({
    cwd: root,
    instanceId,
    kind: "meal-start",
    at: "2026-09-25T16:00:00Z",
    technicianId: "tech-maya",
    rosterIds: roster
  });
  recordFieldEvent({
    cwd: root,
    instanceId,
    kind: "meal-end",
    at: "2026-09-25T16:30:00Z",
    technicianId: "tech-maya",
    rosterIds: roster
  });
  recordFieldEvent({
    cwd: root,
    instanceId,
    kind: "extended-drive",
    at: "2026-09-25T16:40:00Z",
    technicianId: "tech-maya",
    jobId: "job-9",
    rosterIds: roster
  });
  recordFieldEvent({
    cwd: root,
    instanceId,
    kind: "clock-out",
    at: "2026-09-25T17:00:00Z",
    technicianId: "tech-maya",
    rosterIds: roster
  });

  updateJobPrices(root, instanceId, (store) => {
    const attached = attachPart(store, { jobId: "job-9", sku: "COND-14", name: "Contactor" });
    let next = setPartCost(attached.store, { jobId: "job-9", partId: attached.part.partId, cost: 80 });
    next = setLabor(next, "job-9", 40);
    next = addTask(next, { jobId: "job-9", label: "ladder setup", amount: 10 });
    next = setMargin(next, "job-9", 1.5);
    const percent = addDiscount(next, { jobId: "job-9", kind: "percent", value: 10, locked: false });
    next = applyDiscount(percent.store, {
      jobId: "job-9",
      discountId: percent.discount.discountId,
      role: "technician",
      actorId: "tech-maya"
    });
    const manager = addDiscount(next, {
      jobId: "job-9",
      kind: "manager",
      value: 20,
      locked: true,
      allowedRoles: ["manager", "operator"]
    });
    return applyDiscount(manager.store, {
      jobId: "job-9",
      discountId: manager.discount.discountId,
      role: "manager",
      actorId: "mgr-1"
    });
  });
}

describe("shadow desk read", () => {
  it("lets the desk, field, and office read one field-events list and one job price record", async () => {
    const root = mkdtempSync(join(tmpdir(), "tr-shadow-desk-"));
    seedSharedList(root, "local");
    const options = {
      cwd: root,
      now: NOW,
      folders: emptyFolders(root),
      alertConfig: defaultAlertConfig(),
      persistAlertState: false as const,
      persistLocalReports: false as const
    };
    const snapshot = buildOperatorSnapshot(options);
    const pair = shadowReadsFromSnapshot(snapshot);
    const field = readShadowDesk("field", options);
    const office = readShadowDesk("office", options);

    expect(pair.field.events).toBe(snapshot.fieldShell.events);
    expect(pair.office.events).toBe(snapshot.fieldShell.events);
    expect(pair.field.jobPrices).toBe(snapshot.jobPrices);
    expect(pair.office.jobPrices).toBe(snapshot.jobPrices);
    expect(field.events).toEqual(office.events);
    expect(field.jobPrices).toEqual(office.jobPrices);
    expect(field.eventsPath).toBe("data/runtime/local/field-events.jsonl");
    expect(office.eventsPath).toBe(field.eventsPath);
    expect(field.jobPrices.path).toBe("data/runtime/local/job-prices.json");
    expect(office.jobPrices.path).toBe(field.jobPrices.path);
    expect(field.events.map((event) => event.kind)).toEqual([
      "clock-in",
      "meal-start",
      "meal-end",
      "extended-drive",
      "clock-out"
    ]);
    expect(field.events.map((event) => event.label)).toEqual([
      "Clock in",
      "Start Meal",
      "End Meal",
      "Drive time home",
      "Clock out"
    ]);
    expect(field.events.every((event) => event.vendorWrite === false && event.liveGps === false)).toBe(true);

    const priced = field.jobPrices.jobs.find((job) => job.sheet.jobId === "job-9");
    if (!priced) throw new Error("missing job price");
    expect(priced.sheet.parts[0]?.costSource).toBe("typed");
    expect(priced.sheet.parts[0]?.cost).toBe(80);
    expect(priced.sheet.labor).toBe(40);
    expect(priced.sheet.tasks.map((task) => task.amount)).toEqual([10]);
    expect(priced.sheet.marginMultiplier).toBe(1.5);
    expect(priced.sheet.discounts.some((discount) => discount.locked && discount.applied)).toBe(true);
    expect(priced.price.immediate).toBe(155.5);
    expect(priced.livePriceConnected).toBe(false);
    expect(priced.ordersEnabled).toBe(false);
    expect(priced.price.vendorWrite).toBe(false);
    expect(office.jobPrices.jobs.find((job) => job.sheet.jobId === "job-9")).toEqual(priced);

    expect(field.live_backends).toBe(false);
    expect(office.pilot_started).toBe(false);
    expect(field.field_claim).toBe(false);
    expect(office.office_claim).toBe(false);
    expect(field.writes).toBe(false);
    expect(field.ordersEnabled).toBe(false);
    expect(field.version).toBe("1.0.0-local");
    expect(field.version).toBe(RUNTIME_MANIFEST.version);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(field.property.publicListingFacts).toBe(0);
    expect(field.property.zillowConnected).toBe(false);
    expect(field.property.redfinConnected).toBe(false);
    expect(field.property.assessorConnected).toBe(false);
    expect(field.property.permittedListingFeedWired).toBe(false);
    expect(office.property).toEqual(field.property);
    const text = JSON.stringify(field);
    expect(text).not.toContain("Field Softwares 1.0");
    expect(text).not.toContain("Office Softwares 1.0 is live");
    expect(field.note).toMatch(/no second event log/i);
    expect(field.note).toMatch(/does not invent a price/i);

    const runtimeFiles = readdirSync(join(root, "data", "runtime", "local")).sort();
    expect(runtimeFiles).toEqual(["field-events.jsonl", "job-prices.json"]);

    const desk = await startOperatorDesk({ ...options, port: 0 });
    try {
      const shell = (await fetch(`${desk.url}api/field`).then((response) => response.json())) as {
        path: string;
        events: unknown;
        pilot_started: boolean;
        live_backends: boolean;
        field_claim: boolean;
      };
      const board = (await fetch(`${desk.url}api/job-price`).then((response) => response.json())) as {
        path: string;
        jobs: unknown;
        ordersEnabled: boolean;
        live_backends: boolean;
        pilot_started: boolean;
      };
      expect(shell.events).toEqual(field.events);
      expect(shell.events).toEqual(office.events);
      expect(shell.path).toBe(field.eventsPath);
      expect(board).toEqual(field.jobPrices);
      expect(board).toEqual(office.jobPrices);
      expect(shell.pilot_started).toBe(false);
      expect(shell.live_backends).toBe(false);
      expect(shell.field_claim).toBe(false);
      expect(board.ordersEnabled).toBe(false);
      expect(board.pilot_started).toBe(false);
    } finally {
      await desk.close();
    }

    const afterDesk = readdirSync(join(root, "data", "runtime", "local")).filter((name) => name.endsWith(".jsonl"));
    expect(afterDesk).toEqual(["field-events.jsonl"]);
  });

  it("follows the desk instance id and does not invent a second log", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-shadow-shop-"));
    const instanceId = "shop-a";
    seedSharedList(root, instanceId);
    const options = {
      cwd: root,
      now: NOW,
      config: defaultLocalInboundConfig(instanceId),
      folders: emptyFolders(root),
      alertConfig: defaultAlertConfig(),
      persistAlertState: false as const,
      persistLocalReports: false as const
    };
    const field = readShadowDesk("field", options);
    const office = readShadowDesk("office", options);
    expect(field.eventsPath).toBe("data/runtime/shop-a/field-events.jsonl");
    expect(office.events).toEqual(field.events);
    expect(office.jobPrices).toEqual(field.jobPrices);
    expect(readdirSync(join(root, "data", "runtime", instanceId)).sort()).toEqual(["field-events.jsonl", "job-prices.json"]);
    expect(readdirSync(join(root, "data", "runtime"))).toEqual([instanceId]);
  });

  it("routes shadow:field and shadow:office through the same CLI read", () => {
    expect(planCli(["node", "cli.ts", "shadow-field", "--root", "/tmp/trades-box"])).toEqual({
      kind: "shadow-desk",
      role: "field",
      cwd: "/tmp/trades-box"
    });
    expect(planCli(["node", "cli.ts", "shadow-office", "--root", "/tmp/trades-box"])).toEqual({
      kind: "shadow-desk",
      role: "office",
      cwd: "/tmp/trades-box"
    });

    const root = mkdtempSync(join(tmpdir(), "tr-shadow-cli-"));
    seedSharedList(root, "local");
    const fieldText = execFileSync(tsx, ["src/cli.ts", "shadow-field", "--root", root], {
      cwd: rootDir,
      encoding: "utf8"
    });
    const officeText = execFileSync(tsx, ["src/cli.ts", "shadow-office", "--root", root], {
      cwd: rootDir,
      encoding: "utf8"
    });
    const field = JSON.parse(fieldText) as { role: string; events: unknown; jobPrices: unknown; eventsPath: string; pilot_started: boolean; live_backends: boolean };
    const office = JSON.parse(officeText) as { role: string; events: unknown; jobPrices: unknown; eventsPath: string };
    expect(field.role).toBe("field");
    expect(office.role).toBe("office");
    expect(field.eventsPath).toBe("data/runtime/local/field-events.jsonl");
    expect(office.events).toEqual(field.events);
    expect(office.jobPrices).toEqual(field.jobPrices);
    expect(field.pilot_started).toBe(false);
    expect(field.live_backends).toBe(false);
    expect(fieldText).not.toContain("Field Softwares 1.0");
    expect(officeText).not.toContain("Office Softwares 1.0 is live");
    expect(readdirSync(join(root, "data", "runtime", "local")).filter((name) => name.endsWith(".jsonl"))).toEqual([
      "field-events.jsonl"
    ]);
  });
});
