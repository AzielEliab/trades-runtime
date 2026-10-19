import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_SPECS } from "../src/spine/platforms/catalog.js";
import { parsePlatformPullConfig, runPlatformPull, type PullFetch } from "../src/spine/platforms/live-pull.js";
import { mapPlatformDocument } from "../src/spine/platforms/mappings.js";
import { PULL_PLANS } from "../src/spine/platforms/pull-plans.js";
import { parseXml, xmlCollectionRows } from "../src/spine/platforms/xml.js";

const FIX = join(__dirname, "fixtures/platforms/kickserv-xml");
const xml = (name: string) => readFileSync(join(FIX, name), "utf8");
const RECEIVED = "2026-10-19T12:00:00.000Z";

describe("dependency-free XML reader", () => {
  it("follows Rails to_xml hints: arrays, nil, integer/decimal/boolean, CDATA, entities", () => {
    const parsed = parseXml(xml("jobs.xml"));
    const jobs = xmlCollectionRows(parsed.jobs);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ id: 90001, job_number: 1077, name: "Synthetic sewer line jetting & camera", total: 145, invoice_status: null, description: "Synthetic <main line> backup" });
    expect((jobs[0]!.employees as Array<Record<string, unknown>>)[0]).toMatchObject({ name: "Synthetic Tech K", tech: true });
    expect(jobs[1]!.total).toBeNull();
  });

  it("unwraps collections without a type hint and decodes numeric character references", () => {
    const rows = xmlCollectionRows(parseXml(xml("customers.xml")).customers);
    expect(rows.map((row) => row.name)).toEqual(["Synthetic Customer K", "Synthetic Customer L & Sons"]);
    expect(xmlCollectionRows(parseXml("<jobs><job><id>1</id></job></jobs>").jobs)).toEqual([{ id: "1" }]);
    expect(xmlCollectionRows(parseXml('<jobs type="array"></jobs>').jobs)).toEqual([]);
  });

  it("refuses DOCTYPE/ENTITY (no XXE, no entity expansion) and malformed input", () => {
    expect(() => parseXml('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>')).toThrow(/refused/);
    expect(() => parseXml('<!DOCTYPE x SYSTEM "file:///etc/passwd"><x/>')).toThrow(/refused/);
    expect(() => parseXml("<x>&bogus;</x>")).toThrow(/undefined entity/);
    expect(() => parseXml("<a><b></a>")).toThrow(/mismatched/);
    expect(() => parseXml("<a>")).toThrow(/unclosed/);
    expect(() => parseXml("<a/><b/>")).toThrow(/one root/);
    expect(() => parseXml("<a>" + "<b>".repeat(70) + "</b>".repeat(70) + "</a>")).toThrow(/too deep/);
  });
});

describe("Kickserv read-only XML pull (fake fetch only; never a live tenant)", () => {
  it("is documented as a live pull with Basic auth and GET-only XML requests", () => {
    expect(PLATFORM_SPECS.kickserv.api.livePull).toBe(true);
    expect(PLATFORM_SPECS.kickserv.api.defaultBaseUrl).toBe("https://app.kickserv.com");
    const plan = PULL_PLANS.kickserv!;
    expect(plan.authScheme).toBe("BasicTokenTwice");
    expect(plan.requiredFields).toEqual(["accountSlug"]);
    for (const request of plan.requests) {
      expect(request.method).toBe("GET");
      expect(request.format).toBe("xml");
      expect(request.path).toMatch(/^\/\{accountSlug\}\/[a-z_]+\.xml/);
    }
  });

  it("needs the account slug, refuses a bad one, and refuses an inline token", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tr-ks-"));
    const seen: string[] = [];
    const noSlug = await runPlatformPull({
      kind: "kickserv",
      cwd,
      config: parsePlatformPullConfig("kickserv", { tokenEnv: "TR_KS" }),
      env: { TR_KS: "synthetic" },
      fetchImpl: async (url) => {
        seen.push(url);
        return { ok: true, status: 200, text: async () => "" };
      }
    });
    expect(noSlug.outcome).toBe("no-pull-configured");
    expect(noSlug.detail).toMatch(/accountSlug/);
    expect(seen).toEqual([]);
    expect(() => parsePlatformPullConfig("kickserv", { tokenEnv: "TR_KS", accountSlug: "../evil" })).toThrow(/accountSlug/);
    expect(() => parsePlatformPullConfig("kickserv", { tokenEnv: "TR_KS", token: "inline" })).toThrow(/refuses inline token/);
  });

  it("pulls jobs, customers, employees, and items as XML and maps them", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tr-ks-"));
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const files: Record<string, string> = { "jobs.xml": "jobs.xml", "customers.xml": "customers.xml", "employees.xml": "employees.xml", "items.xml": "items.xml" };
    const fetchImpl: PullFetch = async (url, init) => {
      seen.push({ url, headers: init.headers });
      const name = Object.keys(files).find((key) => url.includes(`/${key}`));
      return { ok: Boolean(name), status: name ? 200 : 404, text: async () => (name ? xml(files[name]!) : "") };
    };
    const result = await runPlatformPull({
      kind: "kickserv",
      cwd,
      config: parsePlatformPullConfig("kickserv", { tokenEnv: "TR_KS", accountSlug: "synthetic-shop" }),
      env: { TR_KS: "synthetic-token" },
      fetchImpl,
      now: () => new Date(RECEIVED)
    });
    expect(result.outcome).toBe("pulled");
    expect(result.counts).toEqual({ jobs: 2, customers: 2, employees: 1, items: 1 });
    expect(seen[0]!.url).toBe("https://app.kickserv.com/synthetic-shop/jobs.xml?page=1&include=customer,employees");
    expect(seen[0]!.headers.Authorization).toBe(`Basic ${Buffer.from("synthetic-token:synthetic-token").toString("base64")}`);
    expect(seen[0]!.headers.Accept).toBe("application/xml");
    const written = readdirSync(join(cwd, "data/inbound/kickserv"));
    expect(written).toHaveLength(1);
    const doc = JSON.parse(readFileSync(join(cwd, "data/inbound/kickserv", written[0]!), "utf8")) as Record<string, unknown>;
    expect(doc).toMatchObject({ sourceKind: "kickserv", readOnly: true, livePull: true });
    const records = mapPlatformDocument("kickserv", doc);
    const job = records.find((row) => row.entity === "job" && row.externalId === "1077")!;
    expect(job.status).toBe("scheduled");
    expect(job.observedAt).toBe("2026-10-20T13:00:00Z");
    expect(job.raw).toMatchObject({ customerId: 201, customerName: "Synthetic Customer K", technicianName: "Synthetic Tech K", jobTotal: 145 });
    const unpriced = records.find((row) => row.entity === "job" && row.externalId === "1078")!;
    expect(unpriced.raw.jobTotal).toBeUndefined();
    expect(records.filter((row) => row.entity === "pricebook").map((row) => row.externalId)).toEqual(["8"]);
    expect(records.filter((row) => row.entity === "technician").map((row) => row.externalId)).toContain("7");
  });

  it("reports a vendor XML error per collection without faking success", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "tr-ks-"));
    const result = await runPlatformPull({
      kind: "kickserv",
      cwd,
      config: parsePlatformPullConfig("kickserv", { tokenEnv: "TR_KS", accountSlug: "synthetic-shop" }),
      env: { TR_KS: "synthetic-token" },
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => "<html><body>not xml" })
    });
    expect(result.outcome).toBe("vendor-error");
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors)).toEqual(["jobs", "customers", "employees", "items"]);
  });
});
