import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_KINDS, PLATFORM_SPECS, type PlatformKind } from "../src/spine/platforms/catalog.js";
import { mapPlatformDocument } from "../src/spine/platforms/mappings.js";
import { ingestPlatformShadow, mayWritePlatform, openPlatformShadowClient } from "../src/spine/platforms/shadow.js";
import { parsePlatformPullConfig, runPlatformPull, type PullFetch } from "../src/spine/platforms/live-pull.js";
import { PULL_PLANS } from "../src/spine/platforms/pull-plans.js";
import { admitDropInDocument, admitDropInFile, admitDropInFolder } from "../src/spine/drop-in.js";
import { admitInbound, FIRST_CLASS_SOURCE_KINDS } from "../src/spine/fraggate-inbound.js";
import { inboundDir } from "../src/spine/inbound-layout.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { ApprovalGate } from "../src/approvals/gate.js";
import { defaultPermissionSettings, WRITE_PERMISSIONS } from "../src/approvals/permissions.js";
import { WRITE_TOOLS } from "../src/approvals/tools.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const FIX = join(__dirname, "fixtures/platforms");
const RECEIVED = "2026-10-19T12:00:00.000Z";
const fixture = (name: string) => JSON.parse(readFileSync(join(FIX, name), "utf8")) as Record<string, unknown>;
const box = () => mkdtempSync(join(tmpdir(), "tr-platforms-"));

function byEntity(kind: PlatformKind, file: string) {
  const records = mapPlatformDocument(kind, fixture(file));
  const out: Record<string, typeof records> = {};
  for (const record of records) (out[record.entity] ??= []).push(record);
  return out;
}

describe("platform inbound classes", () => {
  it("are first-class FragGate source kinds with their own local folders", () => {
    for (const kind of PLATFORM_KINDS) {
      expect(FIRST_CLASS_SOURCE_KINDS).toContain(kind);
      expect(inboundDir(kind)).toBe(`data/inbound/${kind}`);
      const admitted = admitInbound({ sourceKind: kind, sourceId: `${kind}:x`, receivedAt: RECEIVED, body: { a: 1 }, treatAsVerified: true });
      expect(admitted.ok).toBe(true);
      if (admitted.ok) {
        expect(admitted.verificationStatus).toBe("UNVERIFIED");
        expect(admitted.packet.trust).toBe("MEDIUM");
        expect(admitted.write).toBe(false);
      }
      expect(mayWritePlatform(kind)).toBe(false);
      expect(openPlatformShadowClient(kind).writes).toBe(false);
    }
  });

  it("maps Jobber GraphQL objects (Job, Visit, Client, Invoice, Quote, PaymentRecord, User)", () => {
    const m = byEntity("jobber", "jobber-export.json");
    const job = m.job![0]!;
    expect(job.externalId).toBe("SYN-JB-JOB-1");
    expect(job.status).toBe("requires_invoicing");
    expect(job.observedAt).toBe("2026-10-13T14:00:00Z");
    expect(job.raw).toMatchObject({ technicianId: "SYN-JB-USR-1", technicianName: "Synthetic Tech A", customerId: "SYN-JB-CL-1", jobTotal: 489.5 });
    expect(m.appointment![0]!.externalId).toBe("SYN-JB-VIS-1");
    expect(m.customer!.map((row) => row.externalId)).toEqual(["SYN-JB-CL-1"]);
    expect(m.invoice![0]!.raw.invoiceTotal).toBe(489.5);
    expect(m.estimate![0]!.raw.jobTotal).toBe(7200);
    expect(m.payment![0]!.raw.amount).toBe(100);
    expect(m.technician![0]!.raw.technicianName).toBe("Synthetic Tech A");
    expect(m.pricebook![0]!.externalId).toBe("SYN-JB-LI-1");
  });

  it("maps Housecall Pro objects and converts documented cents to dollars", () => {
    const m = byEntity("housecallpro", "housecallpro-export.json");
    expect(m.job![0]!.raw).toMatchObject({ jobTotal: 325, technicianId: "SYN-HCP-EMP-1", customerId: "SYN-HCP-CUS-1" });
    expect(m.job![0]!.status).toBe("completed");
    expect(m.appointment![0]!.observedAt).toBe("2026-10-13T16:00:00Z");
    expect(m.estimate![0]!.raw.jobTotal).toBe(6500);
    expect(m.invoice![0]!.raw).toMatchObject({ invoiceTotal: 325, balance: 0 });
    expect(m.technician).toHaveLength(1);
  });

  it("maps Square without inventing jobs", () => {
    const m = byEntity("square", "square-export.json");
    expect(m.job).toBeUndefined();
    expect(m.appointment![0]!.raw.technicianId).toBe("SYN-SQ-TM-1");
    expect(m.payment![0]!.raw.amount).toBe(125.5);
    expect(m.invoice![0]!.raw.invoiceTotal).toBe(250);
    expect(m.technician![0]!.externalId).toBe("SYN-SQ-TM-1");
  });

  it("maps QuickBooks Online query responses", () => {
    const m = byEntity("quickbooks", "quickbooks-export.json");
    expect(m.invoice![0]!.raw).toMatchObject({ invoiceTotal: 362.07, customerId: "SYN-QB-C-1" });
    expect(m.payment![0]!.raw.amount).toBe(362.07);
    expect(m.estimate![0]!.status).toBe("Pending");
    expect(m.technician![0]!.raw.technicianName).toBe("Synthetic Tech E");
    expect(m.pricebook![0]!.raw.price).toBe(24);
    expect(m.job).toBeUndefined();
  });

  it("maps FieldEdge work orders (file drop) and Service Fusion jobs", () => {
    const fe = byEntity("fieldedge", "fieldedge-export.json");
    expect(fe.job![0]!.raw).toMatchObject({ technicianId: "SYN-FE-T-1", jobTotal: 275 });
    expect(fe.appointment![0]!.observedAt).toBe("2026-10-13T13:00:00Z");
    expect(fe.equipment![0]!.externalId).toBe("SYN-FE-EQ-1");
    const sf = byEntity("servicefusion", "servicefusion-export.json");
    expect(sf.job![0]!.raw).toMatchObject({ technicianId: "SYN-SF-TECH-1", technicianName: "Synthetic Tech G", jobTotal: 610 });
    expect(sf.estimate![0]!.raw.jobTotal).toBe(2200);
    expect(sf.invoice![0]!.status).toBe("Paid");
  });

  it("admits a platform folder under its own sourceKind, MEDIUM, UNVERIFIED, no write", () => {
    for (const kind of PLATFORM_KINDS) {
      const result = admitDropInDocument(fixture(`${kind}-export.json`), { receivedAt: RECEIVED, preferClass: kind });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.peerClass).toBe(kind);
      expect(result.write).toBe(false);
      for (const record of result.records) {
        expect(record.sourceId.startsWith(`${PLATFORM_SPECS[kind].idPrefix}:`)).toBe(true);
        expect(record.verificationStatus).toBe("UNVERIFIED");
        expect(record.trust).toBe("MEDIUM");
      }
    }
    const jobber = admitDropInDocument(fixture("jobber-export.json"), { receivedAt: RECEIVED, preferClass: "jobber" });
    const job = jobber.ok ? jobber.records.find((row) => row.entity === "job") : undefined;
    expect(job).toMatchObject({ technicianId: "SYN-JB-USR-1", technicianName: "Synthetic Tech A", lane: "hvac" });
    const hcp = admitDropInDocument(fixture("housecallpro-export.json"), { receivedAt: RECEIVED, preferClass: "housecallpro" });
    const hcpJob = hcp.ok ? hcp.records.find((row) => row.entity === "job") : undefined;
    expect(hcpJob?.callClass?.callback).toBe("yes");
  });

  it("reads a platform CSV export by file name and header aliases", () => {
    const result = admitDropInFile(join(FIX, "jobber-jobs.csv"), { receivedAt: RECEIVED, preferClass: "jobber" });
    expect(result.result.ok).toBe(true);
    if (!result.result.ok) return;
    expect(result.result.profileId).toBe("jobber-csv");
    expect(result.result.synthetic).toBe(true);
    expect(result.result.records[0]).toMatchObject({ entity: "job", externalId: "1002", technicianName: "Synthetic Tech B", status: "Active" });
  });

  it("keeps a clearly ServiceTitan file on the ServiceTitan peer and refuses scrape drops", () => {
    const st = JSON.parse(readFileSync(join(__dirname, "fixtures/byo/servicetitan-export.json"), "utf8"));
    const kept = admitDropInDocument(st, { receivedAt: RECEIVED, preferClass: "jobber" });
    expect(kept.ok && kept.peerClass).toBe("servicetitan");
    const scraped = admitDropInDocument({ sourceKind: "listing-scrape", jobs: [{ id: 1 }] }, { receivedAt: RECEIVED, preferClass: "square" });
    expect(scraped.ok).toBe(false);
  });

  it("the desk snapshot reads every platform folder", () => {
    const cwd = box();
    for (const kind of PLATFORM_KINDS) {
      mkdirSync(join(cwd, inboundDir(kind)), { recursive: true });
      copyFileSync(join(FIX, `${kind}-export.json`), join(cwd, inboundDir(kind), `${kind}-export.json`));
    }
    const snapshot = buildOperatorSnapshot({ cwd, now: RECEIVED, persistAlertState: false, persistLocalReports: false });
    const classes = new Set(snapshot.inbound.map((row) => row.peerClass));
    for (const kind of PLATFORM_KINDS) expect(classes.has(kind)).toBe(true);
    expect(snapshot.dataLabel).toBe("byo-admitted-synthetic");
  });

  it("ingest refuses unknown entities and empty ids", () => {
    expect(() => ingestPlatformShadow({ kind: "square", entity: "job", externalId: "", receivedAt: RECEIVED, payload: {} })).toThrow();
    expect(() => ingestPlatformShadow({ kind: "square", entity: "nope" as never, externalId: "1", receivedAt: RECEIVED, payload: {} })).toThrow();
  });
});

function fakeFetch(responses: Record<string, unknown>, seen: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }>): PullFetch {
  return async (url, init) => {
    seen.push({ url, ...init });
    const match = Object.keys(responses).find((key) => url.includes(key));
    const body = match ? responses[match] : {};
    return { ok: Boolean(match), status: match ? 200 : 404, text: async () => JSON.stringify(body) };
  };
}

describe("platform live pull (read-only, documented APIs)", () => {
  it("ships no live pull for FieldEdge (partner-gated) and fetches nothing", async () => {
    const seen: unknown[] = [];
    const result = await runPlatformPull({ kind: "fieldedge", cwd: box(), fetchImpl: async () => { seen.push(1); throw new Error("no"); } });
    expect(result.outcome).toBe("file-drop-only");
    expect(seen).toHaveLength(0);
    expect(PULL_PLANS.fieldedge).toBeUndefined();
  });

  it("does nothing without a local pull config or a token in the named env var", async () => {
    const cwd = box();
    const none = await runPlatformPull({ kind: "jobber", cwd, fetchImpl: async () => { throw new Error("must not fetch"); } });
    expect(none.outcome).toBe("no-pull-configured");
    const config = parsePlatformPullConfig("jobber", { tokenEnv: "TR_TEST_JOBBER", graphqlVersion: "2026-09-25" });
    const empty = await runPlatformPull({ kind: "jobber", cwd, config, env: {}, fetchImpl: async () => { throw new Error("must not fetch"); } });
    expect(empty.outcome).toBe("no-pull-configured");
    expect(readdirSync(cwd)).toEqual([]);
  });

  it("refuses inline credentials and non-https base URLs", () => {
    expect(() => parsePlatformPullConfig("square", { tokenEnv: "X", token: "abc" })).toThrow(/refuses inline token/);
    expect(() => parsePlatformPullConfig("square", { tokenEnv: "X", baseUrl: "http://example.com" })).toThrow(/https/);
    expect(parsePlatformPullConfig("square", { tokenEnv: "X", baseUrl: "http://127.0.0.1:9" }).baseUrl).toBe("http://127.0.0.1:9");
  });

  it("only plans GETs, GraphQL queries, and documented read-only searches", () => {
    for (const plan of Object.values(PULL_PLANS)) {
      for (const request of plan!.requests) {
        if (request.method !== "GET") expect(request.readOnlyPost).toBe(true);
        const query = request.body?.query;
        if (typeof query === "string") {
          expect(query.startsWith("query ")).toBe(true);
          expect(query).not.toMatch(/mutation/i);
        }
      }
    }
  });

  it("Jobber pull sends GraphQL queries with the version header and writes a local file the desk admits", async () => {
    const cwd = box();
    const seen: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
    const jobs = fixture("jobber-export.json").jobs;
    const fetchImpl: PullFetch = async (url, init) => {
      seen.push({ url, ...init });
      const query = JSON.parse(init.body ?? "{}").query as string;
      const data = query.includes("jobs(") ? { jobs } : query.includes("users(") ? { users: { nodes: [{ id: "U1", name: { full: "Synthetic" } }] } } : {};
      return { ok: true, status: 200, text: async () => JSON.stringify({ data }) };
    };
    const config = parsePlatformPullConfig("jobber", { tokenEnv: "TR_TEST_JOBBER", graphqlVersion: "2026-09-25", pageSize: 10 });
    const result = await runPlatformPull({ kind: "jobber", cwd, config, env: { TR_TEST_JOBBER: "tkn" }, fetchImpl, now: () => new Date(RECEIVED) });
    expect(result.ok).toBe(true);
    expect(result.counts.jobs).toBe(1);
    expect(seen.every((call) => call.url === "https://api.getjobber.com/api/graphql" && call.method === "POST")).toBe(true);
    expect(seen[0]!.headers["X-JOBBER-GRAPHQL-VERSION"]).toBe("2026-09-25");
    expect(seen[0]!.headers.Authorization).toBe("Bearer tkn");
    expect(JSON.parse(seen[0]!.body!).query).toContain("jobs(first: 10)");
    const written = readFileSync(result.file!, "utf8");
    expect(written).not.toContain("tkn");
    const folder = admitDropInFolder(join(cwd, "data/inbound/jobber"), { preferClass: "jobber" });
    const admitted = folder.files[0]!.result;
    expect(admitted.ok && admitted.peerClass).toBe("jobber");
    expect(admitted.ok && admitted.records.some((row) => row.entity === "job")).toBe(true);
  });

  it("Housecall Pro, Square, QuickBooks, and Service Fusion pulls call documented read paths", async () => {
    const cases: Array<[PlatformKind, Record<string, unknown>, Record<string, unknown>, string, RegExp]> = [
      ["housecallpro", { tokenEnv: "T" }, { "/jobs?": { jobs: [{ id: "J" }] } }, "Token tkn", /^https:\/\/api\.housecallpro\.com\/(jobs|customers|employees|estimates|invoices)\?page=1&page_size=50$/],
      ["square", { tokenEnv: "T", squareVersion: "2026-09-16" }, { "/v2/payments": { payments: [{ id: "P" }] } }, "Bearer tkn", /^https:\/\/connect\.squareup\.com\/v2\/(customers|payments|bookings|team-members\/search)/],
      ["quickbooks", { tokenEnv: "T", realmId: "123", minorVersion: "75" }, { "from%20Invoice": { QueryResponse: { Invoice: [{ Id: "1" }] } } }, "Bearer tkn", /^https:\/\/quickbooks\.api\.intuit\.com\/v3\/company\/123\/query\?query=select%20\*%20from%20\w+%20maxresults%2050&minorversion=75$/],
      ["servicefusion", { tokenEnv: "T" }, { "/v1/jobs": { items: [{ id: "S", number: "1" }] } }, "Bearer tkn", /^https:\/\/api\.servicefusion\.com\/v1\/(jobs\?sort=-start_date&|customers\?|techs\?|estimates\?|invoices\?)per-page=50$/]
    ];
    for (const [kind, raw, responses, auth, pattern] of cases) {
      const cwd = box();
      const seen: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
      const result = await runPlatformPull({ kind, cwd, config: parsePlatformPullConfig(kind, raw), env: { T: "tkn" }, fetchImpl: fakeFetch(responses, seen), now: () => new Date(RECEIVED) });
      expect(result.outcome, kind).toBe("partial");
      for (const call of seen) {
        expect(call.url, kind).toMatch(pattern);
        expect(call.headers.Authorization).toBe(auth);
        if (call.method !== "GET") expect(call.url).toContain("/team-members/search");
      }
      if (kind === "square") {
        expect(seen[0]!.headers["Square-Version"]).toBe("2026-09-16");
        expect(result.errors.invoices).toMatch(/locationId/);
      }
    }
  });

  it("missing vendor-required settings stop the pull before any fetch", async () => {
    const stop = async () => { throw new Error("must not fetch"); };
    const qbo = await runPlatformPull({ kind: "quickbooks", cwd: box(), config: parsePlatformPullConfig("quickbooks", { tokenEnv: "T" }), env: { T: "x" }, fetchImpl: stop });
    expect(qbo.outcome).toBe("no-pull-configured");
    const sq = await runPlatformPull({ kind: "square", cwd: box(), config: parsePlatformPullConfig("square", { tokenEnv: "T" }), env: { T: "x" }, fetchImpl: stop });
    expect(sq.detail).toMatch(/squareVersion/);
  });

  it("reads platforms.<kind>.pull from the gitignored local.json", async () => {
    const cwd = box();
    mkdirSync(join(cwd, "data/inbound"), { recursive: true });
    writeFileSync(join(cwd, "data/inbound/local.json"), JSON.stringify({ platforms: { servicefusion: { pull: { tokenEnv: "SF_T" } } } }));
    const seen: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const result = await runPlatformPull({ kind: "servicefusion", cwd, env: { SF_T: "abc" }, fetchImpl: fakeFetch({ "/v1/jobs": { items: [{ id: "1", number: "2" }] } }, seen), now: () => new Date(RECEIVED) });
    expect(result.ok).toBe(true);
    expect(result.file).toContain(join(cwd, "data/inbound/servicefusion"));
  });
});

describe("platform write-back through the approval gate", () => {
  it("adds one write-back permission and tool per platform, default off", async () => {
    const cwd = box();
    for (const kind of PLATFORM_KINDS) {
      const permission = `${kind}.writeback`;
      expect(WRITE_PERMISSIONS).toContain(permission);
      expect(WRITE_TOOLS.filter((tool) => tool.permission === permission)).toHaveLength(1);
    }
    const gate = new ApprovalGate({ cwd, instanceId: "local" });
    const refused = await gate.requestWrite({ tool: "trades_runtime_jobber_writeback", args: { method: "POST", path: "/api/graphql" }, requestedBy: "mcp:x" });
    expect(refused.status).toBe("refused");
  });

  it("an approved platform write without a local backend returns no-backend-configured and writes nothing", async () => {
    const cwd = box();
    const settings = { ...defaultPermissionSettings(), selected: ["square.writeback" as const] };
    const calls: string[] = [];
    const gate = new ApprovalGate({ cwd, instanceId: "local", settings, fetchImpl: async (url) => { calls.push(url); return { ok: true, status: 200, text: async () => "" }; } });
    const pending = await gate.requestWrite({ tool: "trades_runtime_square_writeback", args: { method: "POST", path: "/v2/invoices" }, requestedBy: "mcp:x" });
    expect(pending.status).toBe("pending");
    if (pending.status !== "pending") return;
    const decided = await gate.decide({ approvalId: pending.approvalId, decision: "yes", decidedBy: "cli:operator", via: "cli" });
    expect(decided.result?.outcome).toBe("no-backend-configured");
    expect(decided.result?.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("a configured Housecall Pro backend uses the documented Token scheme and static headers only after yes", async () => {
    const cwd = box();
    mkdirSync(join(cwd, "data/runtime/local"), { recursive: true });
    writeFileSync(
      join(cwd, "data/runtime/local/write-backends.json"),
      JSON.stringify({ housecallpro: { baseUrl: "https://api.housecallpro.com", tokenEnv: "HCP_T", authScheme: "Token", headers: { "X-Test": "1" } } })
    );
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const gate = new ApprovalGate({
      cwd,
      instanceId: "local",
      env: { HCP_T: "k" },
      settings: { ...defaultPermissionSettings(), selected: ["housecallpro.writeback"] },
      fetchImpl: async (url, init) => { calls.push({ url, headers: init.headers }); return { ok: true, status: 201, text: async () => "{}" }; }
    });
    const pending = await gate.requestWrite({ tool: "trades_runtime_housecallpro_writeback", args: { method: "POST", path: "/jobs/1/notes", body: { content: "x" } }, requestedBy: "mcp:y" });
    expect(calls).toHaveLength(0);
    if (pending.status !== "pending") throw new Error("expected pending");
    const denied = await gate.decide({ approvalId: pending.approvalId, decision: "no", decidedBy: "cli:op", via: "cli" });
    expect(denied.status).toBe("denied");
    expect(calls).toHaveLength(0);
    const again = await gate.requestWrite({ tool: "trades_runtime_housecallpro_writeback", args: { method: "POST", path: "/jobs/1/notes" }, requestedBy: "mcp:y" });
    if (again.status !== "pending") throw new Error("expected pending");
    const done = await gate.decide({ approvalId: again.approvalId, decision: "yes", decidedBy: "cli:op", via: "cli" });
    expect(done.result?.outcome).toBe("written");
    expect(calls[0]!.headers.Authorization).toBe("Token k");
    expect(calls[0]!.headers["X-Test"]).toBe("1");
  });

  it("refuses credential-looking static headers", async () => {
    const { parseWriteBackends } = await import("../src/approvals/backends.js");
    expect(() => parseWriteBackends({ square: { baseUrl: "https://connect.squareup.com", tokenEnv: "T", headers: { Authorization: "Bearer x" } } })).toThrow(/credential header/);
  });

  it("keeps catalog honesty flags", () => {
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.version).toBe("1.0.0");
  });
});
