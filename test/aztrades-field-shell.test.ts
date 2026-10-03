import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_TITAN_WRITES_ENABLED } from "../src/spine/servicetitan-shadow.js";
import { PROBOOKS_WRITES_ENABLED } from "../src/spine/probooks-shadow.js";
import { summarizeDrive } from "../src/domain/drive-miles.js";
import { defaultAlertConfig } from "../src/desk/alerts.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { renderDeskPage } from "../src/desk/render.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { parseDeskHints, parseDeskRole } from "../src/desk/hint-prefs.js";
import { buildPropertyCard } from "../src/desk/property-card.js";
import { driveRunsLong, recordFieldEvent } from "../src/desk/field-time.js";
import {
  addDiscount,
  addTask,
  applyDiscount,
  attachPart,
  blankSheet,
  emptyJobPriceStore,
  lookupCatalogPrice,
  priceJob,
  saveDroppedImage,
  setLabor,
  setMargin,
  setPartCost,
  CATALOG_SOURCES
} from "../src/desk/job-price.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const NOW = "2026-09-25T18:00:00Z";

function emptyFolders(root: string) {
  return (["servicetitan", "probooks", "trades-app"] as const).map((preferClass) => {
    const dir = join(root, preferClass);
    return { dir, preferClass };
  });
}

describe("AZTrades field shell", () => {
  it("keeps the honesty flags false", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-az-flags-"));
    const snapshot = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders: emptyFolders(root),
      alertConfig: defaultAlertConfig(),
      persistAlertState: false,
      persistLocalReports: false
    });
    expect(snapshot.live_backends).toBe(false);
    expect(snapshot.writes).toBe(false);
    expect(snapshot.pilot_started).toBe(false);
    expect(snapshot.fieldShell.field_claim).toBe(false);
    expect(snapshot.fieldShell.pilot_started).toBe(false);
    expect(snapshot.fieldShell.live_backends).toBe(false);
    expect(snapshot.fieldShell.liveGps).toBe(false);
    expect(snapshot.fieldShell.servicetitanWrite).toBe(false);
    expect(snapshot.fieldShell.jobberWrite).toBe(false);
    expect(snapshot.jobPrices.ordersEnabled).toBe(false);
    expect(snapshot.jobPrices.field_claim).toBe(false);
    expect(snapshot.jobPrices.live_backends).toBe(false);
    expect(SERVICE_TITAN_WRITES_ENABLED).toBe(false);
    expect(PROBOOKS_WRITES_ENABLED).toBe(false);
    expect(RUNTIME_MANIFEST.field_claim).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
  });

  it("records clock, meal, and drive-time-home events the other roles can read", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-az-time-"));
    const roster = ["tech-maya"];
    recordFieldEvent({
      cwd: root,
      instanceId: "local",
      kind: "clock-in",
      at: "2026-09-25T14:00:00Z",
      technicianId: "tech-maya",
      technicianName: "Maya Chen",
      jobId: "SYN-DESK-HVAC-1",
      rosterIds: roster
    });
    recordFieldEvent({
      cwd: root,
      instanceId: "local",
      kind: "extended-drive",
      at: "2026-09-25T14:05:00Z",
      technicianId: "tech-maya",
      jobId: "SYN-DESK-HVAC-1",
      rosterIds: roster
    });
    recordFieldEvent({
      cwd: root,
      instanceId: "local",
      kind: "meal-start",
      at: "2026-09-25T16:00:00Z",
      technicianId: "tech-maya",
      rosterIds: roster
    });
    expect(() =>
      recordFieldEvent({
        cwd: root,
        instanceId: "local",
        kind: "clock-out",
        at: "2026-09-25T16:10:00Z",
        technicianId: "tech-maya",
        rosterIds: roster
      })
    ).toThrow(/End Meal/);
    recordFieldEvent({
      cwd: root,
      instanceId: "local",
      kind: "meal-end",
      at: "2026-09-25T16:30:00Z",
      technicianId: "tech-maya",
      rosterIds: roster
    });
    recordFieldEvent({
      cwd: root,
      instanceId: "local",
      kind: "clock-out",
      at: "2026-09-25T17:00:00Z",
      technicianId: "tech-maya",
      rosterIds: roster
    });
    expect(() =>
      recordFieldEvent({
        cwd: root,
        instanceId: "local",
        kind: "meal-start",
        at: "2026-09-25T17:05:00Z",
        technicianId: "tech-maya",
        rosterIds: roster
      })
    ).toThrow(/Clock in/);

    const snapshot = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders: emptyFolders(root),
      alertConfig: defaultAlertConfig(),
      persistAlertState: false,
      persistLocalReports: false
    });
    expect(snapshot.fieldShell.events.map((event) => event.kind)).toEqual([
      "clock-in",
      "extended-drive",
      "meal-start",
      "meal-end",
      "clock-out"
    ]);
    expect(snapshot.fieldShell.events.every((event) => event.vendorWrite === false && event.liveGps === false)).toBe(true);
    expect(snapshot.fieldShell.todayJob?.id).toBeTruthy();
  });

  it("alerts when drive minutes per stop run above the desk measure and stays quiet when the measure is unknown", () => {
    const drive = summarizeDrive({
      source: "local-file",
      path: null,
      rows: [
        { day: "2026-09-25", technicianId: "tech-a", technicianName: "A", miles: 10, driveMinutes: 40, stops: 1 },
        { day: "2026-09-25", technicianId: "tech-b", technicianName: "B", miles: 10, driveMinutes: 10, stops: 1 }
      ],
      completedJobs: 2
    });
    const alerts = driveRunsLong(drive);
    expect(alerts.map((alert) => alert.technicianId)).toEqual(["tech-a"]);
    expect(alerts[0]?.liveGps).toBe(false);
    expect(alerts[0]?.telematicsVendor).toBe(false);
    const unknown = summarizeDrive({
      source: "local-file",
      path: null,
      rows: [{ day: "2026-09-25", technicianId: "tech-a", technicianName: "A", miles: 10, driveMinutes: null, stops: 1 }],
      completedJobs: 1
    });
    expect(driveRunsLong(unknown)).toEqual([]);
  });

  it("says listing sites are not connected and does not invent a listing number", () => {
    const empty = buildPropertyCard({ jobId: "job-1", address: null, lane: "hvac", status: "scheduled" });
    expect(empty.serviceAddress).toBeNull();
    expect(empty.zillowConnected).toBe(false);
    expect(empty.redfinConnected).toBe(false);
    expect(empty.assessorConnected).toBe(false);
    expect(empty.publicListingFacts).toEqual([]);
    expect(empty.livePull).toBe(false);
    expect(empty.scraped).toBe(false);
    expect(empty.note).toMatch(/not connected/i);

    const named = buildPropertyCard({
      jobId: "job-2",
      address: "100 Synthetic Ave",
      lane: "plumbing",
      status: "scheduled"
    });
    expect(named.addressSource).toBe("company-service-history");
    expect(named.serviceAddress).toBe("100 Synthetic Ave");
    expect(named.publicListingFacts).toEqual([]);
    expect(named.zillowConnected).toBe(false);
    expect(named.assessorConnected).toBe(false);
    expect(named.verifiedPropertyFact).toBe(false);
    expect(JSON.stringify(named)).not.toMatch(/\$\d/);
  });

  it("prices a job from typed cost, labor, tasks, and margin, and locks a discount", () => {
    let store = emptyJobPriceStore();
    const attached = attachPart(store, { jobId: "job-9", sku: "COND-14", name: "Contactor" });
    store = setPartCost(attached.store, { jobId: "job-9", partId: attached.part.partId, cost: 80 });
    store = setLabor(store, "job-9", 40);
    store = addTask(store, { jobId: "job-9", label: "ladder setup", amount: 10 });
    store = setMargin(store, "job-9", 1.5);
    const sheet = store.jobs.find((job) => job.jobId === "job-9");
    if (!sheet) throw new Error("missing sheet");
    expect(sheet.parts[0]?.costSource).toBe("typed");
    expect(sheet.parts[0]?.imageSource).toBe("missing");
    expect(priceJob(sheet).immediate).toBe(195);

    const percent = addDiscount(store, { jobId: "job-9", kind: "percent", value: 10, locked: false });
    store = applyDiscount(percent.store, {
      jobId: "job-9",
      discountId: percent.discount.discountId,
      role: "technician",
      actorId: "tech-maya"
    });
    const manager = addDiscount(store, {
      jobId: "job-9",
      kind: "manager",
      value: 20,
      locked: true,
      allowedRoles: ["manager", "operator"]
    });
    expect(() =>
      applyDiscount(manager.store, {
        jobId: "job-9",
        discountId: manager.discount.discountId,
        role: "technician",
        actorId: "tech-maya"
      })
    ).toThrow(/locked/);
    store = applyDiscount(manager.store, {
      jobId: "job-9",
      discountId: manager.discount.discountId,
      role: "manager",
      actorId: "mgr-1"
    });
    const priced = store.jobs.find((job) => job.jobId === "job-9");
    if (!priced) throw new Error("missing priced sheet");
    expect(priceJob(priced).immediate).toBe(155.5);
    expect(priceJob(priced).ordersEnabled).toBe(false);
    expect(priceJob(priced).vendorWrite).toBe(false);

    const lookup = lookupCatalogPrice("supplyhouse", "COND-14");
    expect(lookup.price).toBeNull();
    expect(lookup.stock).toBeNull();
    expect(lookup.imageUrl).toBeNull();
    expect(lookup.ordersEnabled).toBe(false);
    expect(lookup.scraped).toBe(false);
    expect(CATALOG_SOURCES.every((source) => source.priceConnected === false && source.ordersEnabled === false)).toBe(true);
    expect(priceJob(blankSheet("empty")).immediate).toBeNull();
  });

  it("keeps a dropped image and does not invent one", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-az-img-"));
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const saved = saveDroppedImage({
      cwd: root,
      instanceId: "local",
      jobId: "job-9",
      partId: "part-1",
      mediaType: "image/png",
      bytes: png
    });
    expect(saved.relativePath).toMatch(/job-images/);
    expect(() =>
      saveDroppedImage({
        cwd: root,
        instanceId: "local",
        jobId: "job-9",
        partId: "part-2",
        mediaType: "image/png",
        bytes: Buffer.from("not-a-photo")
      })
    ).toThrow(/png, jpeg, webp, or gif/);
  });

  it("persists help hints and the desk role for the operator", () => {
    expect(parseDeskHints(null)).toEqual({ v: 1, on: true });
    expect(parseDeskHints(JSON.stringify({ v: 1, on: false }))).toEqual({ v: 1, on: false });
    expect(parseDeskRole("field")).toBe("field");
    expect(parseDeskRole(null)).toBe("office");
  });

  it("renders the field controls, the honest property card, and the empty price state", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-az-html-"));
    const snapshot = buildOperatorSnapshot({
      cwd: root,
      now: NOW,
      folders: emptyFolders(root),
      alertConfig: defaultAlertConfig(),
      persistAlertState: false,
      persistLocalReports: false
    });
    const html = renderDeskPage(snapshot);
    expect(html).toContain("Clock in");
    expect(html).toContain("Clock out");
    expect(html).toContain("Start Meal");
    expect(html).toContain("End Meal");
    expect(html).toContain("Drive time home");
    expect(html).toContain("Help hints");
    expect(html).toContain("trades-desk-hints");
    expect(html).toContain("Image is missing");
    expect(html).toContain("does not order");
    expect(html).toContain("not a Field 1.0 claim");
    expect(html).toContain("not Office Softwares 1.0");
    expect(html).toContain("Zillow connected false");
    expect(html).toContain("Redfin connected false");
    expect(html).toContain("No public listing facts");
    expect(html).toContain("Drive time runs long");
    expect(html).toContain("pilot_started false");
    expect(html).toContain("live_backends false");
    expect(html).not.toContain("Field Softwares 1.0");
    expect(html).not.toContain("Office Softwares 1.0 is live");
    for (const source of ["supplyhouse.com", "johnstone.com", "carrier.com", "Home Depot", "Gustave A. Larson"]) {
      expect(html).toContain(source);
    }
  });

  it("serves field and price actions on the local desk", async () => {
    const root = mkdtempSync(join(tmpdir(), "tr-az-http-"));
    writeFileSync(join(root, "keep"), "x");
    const desk = await startOperatorDesk({
      cwd: root,
      port: 0,
      folders: emptyFolders(root),
      alertConfig: defaultAlertConfig(),
      persistAlertState: false,
      persistLocalReports: false
    });
    try {
      const clock = await fetch(`${desk.url}api/field/event`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "clock-in", technicianId: "tech-maya", jobId: "SYN-DESK-HVAC-1" })
      });
      expect(clock.status).toBe(200);
      const clockBody = (await clock.json()) as { event: { kind: string; liveGps: boolean; vendorWrite: boolean }; pilot_started: boolean };
      expect(clockBody.event.kind).toBe("clock-in");
      expect(clockBody.event.liveGps).toBe(false);
      expect(clockBody.event.vendorWrite).toBe(false);
      expect(clockBody.pilot_started).toBe(false);

      const shell = (await (await fetch(`${desk.url}api/field`)).json()) as {
        events: { kind: string }[];
        field_claim: boolean;
        live_backends: boolean;
      };
      expect(shell.events.map((event) => event.kind)).toContain("clock-in");
      expect(shell.field_claim).toBe(false);
      expect(shell.live_backends).toBe(false);

      const attach = await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "attach-part", jobId: "SYN-DESK-HVAC-1", sku: "COND-14", name: "Contactor" })
      });
      expect(attach.status).toBe(200);
      const board = (await (await fetch(`${desk.url}api/job-price`)).json()) as {
        ordersEnabled: boolean;
        vendorWrite: boolean;
        jobs: {
          sheet: { jobId: string; parts: { partId: string; cost: number | null; imageSource: string }[] };
          parts: { areaStockKnown: boolean | null; supplierStock: null }[];
        }[];
      };
      expect(board.ordersEnabled).toBe(false);
      expect(board.vendorWrite).toBe(false);
      const job = board.jobs.find((row) => row.sheet.jobId === "SYN-DESK-HVAC-1");
      expect(job?.sheet.parts[0]?.cost).toBeNull();
      expect(job?.sheet.parts[0]?.imageSource).toBe("missing");
      expect(job?.parts[0]?.supplierStock).toBeNull();
      expect(job?.parts[0]?.areaStockKnown).toBe(true);

      const partId = job?.sheet.parts[0]?.partId;
      const lookup = await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "lookup",
          jobId: "SYN-DESK-HVAC-1",
          sourceId: "rheem",
          sku: "COND-14",
          role: "technician"
        })
      });
      const lookupBody = (await lookup.json()) as { lookup: { price: null; ordersEnabled: boolean }; note: string };
      expect(lookupBody.lookup.price).toBeNull();
      expect(lookupBody.lookup.ordersEnabled).toBe(false);
      expect(lookupBody.note).toMatch(/does not place an order/i);

      await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-cost", jobId: "SYN-DESK-HVAC-1", partId, cost: 50 })
      });
      await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-labor", jobId: "SYN-DESK-HVAC-1", labor: 50 })
      });
      await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-margin", jobId: "SYN-DESK-HVAC-1", margin: 2 })
      });
      const added = await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add-discount", jobId: "SYN-DESK-HVAC-1", kind: "manager", value: 10, locked: false })
      });
      expect(added.status).toBe(200);
      const afterAdd = (await (await fetch(`${desk.url}api/job-price`)).json()) as {
        jobs: { sheet: { jobId: string; discounts: { discountId: string; locked: boolean }[] }; price: { immediate: number | null } }[];
      };
      const priced = afterAdd.jobs.find((row) => row.sheet.jobId === "SYN-DESK-HVAC-1");
      const discountId = priced?.sheet.discounts[0]?.discountId;
      expect(priced?.sheet.discounts[0]?.locked).toBe(true);
      expect(priced?.price.immediate).toBe(200);
      const refused = await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply-discount",
          jobId: "SYN-DESK-HVAC-1",
          discountId,
          role: "technician",
          actorId: "tech-maya"
        })
      });
      expect(refused.status).toBe(400);
      const applied = await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply-discount",
          jobId: "SYN-DESK-HVAC-1",
          discountId,
          role: "manager",
          actorId: "mgr-1"
        })
      });
      expect(applied.status).toBe(200);
      const finalBoard = (await (await fetch(`${desk.url}api/job-price`)).json()) as {
        jobs: { sheet: { jobId: string }; price: { immediate: number | null; vendorWrite: boolean } }[];
      };
      expect(finalBoard.jobs.find((row) => row.sheet.jobId === "SYN-DESK-HVAC-1")?.price.immediate).toBe(190);
      expect(finalBoard.jobs.find((row) => row.sheet.jobId === "SYN-DESK-HVAC-1")?.price.vendorWrite).toBe(false);
    } finally {
      await desk.close();
    }
  });
});
