import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_KINDS, PLATFORM_SPECS } from "../src/spine/platforms/catalog.js";
import { MAPPING_VERIFICATION } from "../src/spine/platforms/mapping-verification.js";
import { mapPlatformDocument } from "../src/spine/platforms/mappings.js";
import { parsePlatformPullConfig, runPlatformPull, type PullFetch } from "../src/spine/platforms/live-pull.js";
import { PULL_PLANS } from "../src/spine/platforms/pull-plans.js";
import { admitDropInFile, parseCsv } from "../src/spine/drop-in.js";
import { renderPlatformPeersPanel } from "../src/desk/modules-render.js";

const CSV = join(__dirname, "fixtures/platforms/csv");
const RECEIVED = "2026-10-19T12:00:00.000Z";
const csvDoc = (name: string) => ({ records: parseCsv(readFileSync(join(CSV, name), "utf8")).rows });

describe("per-platform mapping confidence", () => {
  it("every platform names documented / partial / guessed with https sources and a note", () => {
    for (const kind of PLATFORM_KINDS) {
      const spec = PLATFORM_SPECS[kind];
      expect(["documented", "partial", "guessed"], kind).toContain(spec.mappingConfidence);
      expect(spec.mappingSources.length, kind).toBeGreaterThan(0);
      for (const url of spec.mappingSources) expect(url, kind).toMatch(/^https?:\/\//);
      expect(spec.mappingNote.length, kind).toBeGreaterThan(40);
      expect(spec.mappingConfidence).toBe(MAPPING_VERIFICATION[kind].mappingConfidence);
    }
  });

  it("only schema-checked mappers are documented, and platforms without a published field list stay guessed", () => {
    const by = (level: string) => PLATFORM_KINDS.filter((kind) => PLATFORM_SPECS[kind].mappingConfidence === level);
    expect(by("documented")).toEqual(["fieldedge", "workiz", "servicetrade"]);
    expect(by("guessed")).toEqual(["successware", "buildops", "wintac"]);
    expect(PLATFORM_SPECS.fieldedge.mappingSources.every((url) => url.startsWith("https://docs-dev.fieldedge.com/"))).toBe(true);
    expect(PLATFORM_SPECS.workiz.mappingSources).toContain("https://developer.workiz.com/v2/");
    expect(PLATFORM_SPECS.servicetrade.mappingSources).toContain("https://api.servicetrade.com/openapi/openapi.json");
    for (const kind of by("guessed")) expect(PLATFORM_SPECS[kind].mappingNote, kind).toMatch(/real .*export/);
  });

  it("the desk platform list shows the confidence and flags what needs a real export", () => {
    const html = renderPlatformPeersPanel();
    for (const kind of PLATFORM_KINDS) expect(html).toContain(`data-platform="${kind}" data-mapping-confidence="${PLATFORM_SPECS[kind].mappingConfidence}"`);
    expect(html).toContain("Needs a real export to confirm");
    expect(html).toContain("None of these has been tested against a live tenant.");
  });
});

describe("mapper corrections from published sources", () => {
  it("Workiz reads the documented v2 camelCase fields and pulls from the documented server", async () => {
    expect(PLATFORM_SPECS.workiz.api.defaultBaseUrl).toBe("https://api.workiz.com/crm/api");
    const seen: string[] = [];
    const fetchImpl: PullFetch = async (url) => {
      seen.push(url);
      return { ok: true, status: 200, text: async () => JSON.stringify({ pageSize: 50, page: 1, totalResults: 1, hasMore: false, data: [{ uuid: "SYN-WZ-9", status: "Pending", totalPrice: 80, team: [{ id: "u", name: "Synthetic Tech" }] }] }) };
    };
    const result = await runPlatformPull({ kind: "workiz", cwd: mkdtempSync(join(tmpdir(), "tr-wz-")), config: parsePlatformPullConfig("workiz", { tokenEnv: "T" }), env: { T: "synthetic" }, fetchImpl, now: () => new Date(RECEIVED) });
    expect(result.outcome).toBe("pulled");
    expect(seen[0]).toBe("https://api.workiz.com/crm/api/v2/jobs?pageSize=50&page=1");
    expect(seen.map((url) => url.split("?")[0]!.split("/").pop())).toEqual(["jobs", "clients", "invoices", "estimates"]);
    const job = mapPlatformDocument("workiz", { jobs: [{ uuid: "SYN-WZ-9", status: "Pending", totalPrice: 80, team: [{ id: "u", name: "Synthetic Tech" }] }] })[0]!;
    expect(job.raw).toMatchObject({ jobTotal: 80, technicianName: "Synthetic Tech", technicianId: "u" });
    // The earlier PascalCase guesses are no longer read.
    const legacy = mapPlatformDocument("workiz", { jobs: [{ UUID: "X", JobTotalPrice: 5 }] })[0]!;
    expect(legacy.externalId).not.toBe("X");
    expect(legacy.raw.jobTotal).toBeUndefined();
  });

  it("ServiceTrade pulls every documented list (data.<collection>) and links invoices and appointments to jobs", async () => {
    const plan = PULL_PLANS.servicetrade!;
    expect(plan.requests.map((r) => r.collect)).toEqual(["data.jobs", "data.appointments", "data.locations", "data.companies", "data.invoices", "data.quotes", "data.users", "data.assets"]);
    const bodies: Record<string, unknown> = {
      "/api/job?": { data: { totalPages: 1, page: 1, jobs: [{ id: 1, number: 9, status: "scheduled", scheduledDate: 1792843200, customer: { id: 81, name: "Synthetic Co" } }] } },
      "/api/appointment?": { data: { totalPages: 1, page: 1, appointments: [{ id: 5, status: "scheduled", windowStart: 1792843200, job: { id: 1 }, techs: [{ id: 61, name: "Synthetic Tech T" }] }] } },
      "/api/location?": { data: { totalPages: 1, page: 1, locations: [] } },
      "/api/company?": { data: { totalPages: 1, page: 1, companies: [{ id: 81, name: "Synthetic Co" }] } },
      "/api/invoice?": { data: { totalPages: 1, page: 1, invoices: [{ id: 7, invoiceNumber: "SYN-I7", status: "ok", totalPrice: 410.5, transactionDate: 1792843200, customer: { id: 81 }, job: { id: 1 } }] } },
      "/api/quote?": { data: { totalPages: 1, page: 1, quotes: [{ id: 3, status: "new", totalPrice: "999.00", customer: { id: 81 } }] } },
      "/api/user?": { data: { totalPages: 1, page: 1, users: [{ id: 61, name: "Synthetic Tech T", isTech: true }] } },
      "/api/asset?": { data: { totalPages: 1, page: 1, assets: [{ id: 2, location: { id: 71 } }] } }
    };
    const fetchImpl: PullFetch = async (url) => {
      const key = Object.keys(bodies).find((k) => url.includes(k));
      return { ok: Boolean(key), status: key ? 200 : 404, text: async () => JSON.stringify(key ? bodies[key] : {}) };
    };
    const cwd = mkdtempSync(join(tmpdir(), "tr-st-"));
    const result = await runPlatformPull({ kind: "servicetrade", cwd, config: parsePlatformPullConfig("servicetrade", { tokenEnv: "T" }), env: { T: "synthetic" }, fetchImpl, now: () => new Date(RECEIVED) });
    expect(result.outcome).toBe("pulled");
    expect(result.counts).toEqual({ jobs: 1, appointments: 1, locations: 0, companies: 1, invoices: 1, quotes: 1, users: 1, assets: 1 });
    const doc = JSON.parse(readFileSync(result.file!, "utf8")) as Record<string, unknown>;
    const records = mapPlatformDocument("servicetrade", doc);
    const invoice = records.find((r) => r.entity === "invoice")!;
    expect(invoice.raw).toMatchObject({ invoiceTotal: 410.5, customerId: 81, jobId: 1 });
    expect(invoice.observedAt).toBe("2026-10-24T12:00:00.000Z");
    expect(records.find((r) => r.entity === "appointment")!.raw).toMatchObject({ jobId: 1, technicianName: "Synthetic Tech T" });
    expect(records.find((r) => r.entity === "estimate")!.raw.jobTotal).toBe(999);
    expect(records.filter((r) => r.entity === "customer").map((r) => r.externalId)).toContain("81");
  });

  it("FieldEdge reads the documented work-order and assignment fields", () => {
    const records = mapPlatformDocument("fieldedge", {
      workOrders: [{ workOrderId: "W1", workOrderNumber: "100", customerId: "C1", scheduledStart: "2026-10-20T13:00:00Z", primaryAssignment: { employeeId: "E1", name: "Synthetic Tech" }, invoiceId: "I1" }],
      assignments: [{ assignmentId: "A1", workOrderId: "W1", technicianId: "E1", technicianName: "Synthetic Tech", scheduleDateTime: "2026-10-20T13:00:00Z", status: "Dispatched" }],
      invoices: [{ invoiceId: "I1", workOrderId: "W1", customerId: "C1", customerName: "Synthetic", dateAdded: "2026-10-20" }]
    });
    const job = records.find((r) => r.entity === "job")!;
    expect(job).toMatchObject({ externalId: "W1", observedAt: "2026-10-20T13:00:00Z" });
    expect(job.raw).toMatchObject({ customerId: "C1", technicianId: "E1", technicianName: "Synthetic Tech", invoiceId: "I1" });
    expect(job.raw.jobTotal).toBeUndefined();
    expect(records.find((r) => r.entity === "appointment")).toMatchObject({ externalId: "A1", status: "Dispatched" });
    expect(records.find((r) => r.entity === "invoice")!.raw).toMatchObject({ jobId: "W1", customerName: "Synthetic" });
  });
});

describe("published CSV columns", () => {
  it("FieldPulse Job Report columns map to id, status, tech, customer, total", () => {
    const [job] = mapPlatformDocument("fieldpulse", csvDoc("fieldpulse-job-report.csv"), "fieldpulse-job-report.csv");
    expect(job).toMatchObject({ entity: "job", externalId: "SYN-FP-1001", status: "Completed", observedAt: "2026-10-14 09:00" });
    expect(job!.raw).toMatchObject({ technicianName: "Synthetic Tech F", customerName: "Synthetic Customer F", serviceAddress: "4 Synthetic Ln", jobTotal: 275 });
    const admitted = admitDropInFile(join(CSV, "fieldpulse-job-report.csv"), { receivedAt: RECEIVED, preferClass: "fieldpulse" });
    expect(admitted.result.ok).toBe(true);
    if (admitted.result.ok) expect(admitted.result.records[0]!.verificationStatus).toBe("UNVERIFIED");
  });

  it("mHelpDesk InvoiceList.csv keys on Invoice Number (not Ticket ID); CustomerList.csv on ID", () => {
    const [invoice] = mapPlatformDocument("mhelpdesk", csvDoc("InvoiceList.csv"), "InvoiceList.csv");
    expect(invoice).toMatchObject({ entity: "invoice", externalId: "SYN-MHD-INV-77", observedAt: "2026-10-12" });
    expect(invoice!.raw).toMatchObject({ customerName: "Synthetic Customer M", amount: 99 });
    const [customer] = mapPlatformDocument("mhelpdesk", csvDoc("CustomerList.csv"), "CustomerList.csv");
    expect(customer).toMatchObject({ entity: "customer", externalId: "SYN-MHD-C-5", observedAt: "2026-01-05" });
    expect(customer!.raw).toMatchObject({ customerName: "Synthetic Customer M", serviceAddress: "5 Synthetic Way" });
  });
});
