import { mkdirSync, mkdtempSync, readFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_KINDS, PLATFORM_SPECS, type PlatformKind } from "../src/spine/platforms/catalog.js";
import { WAVE2_KINDS } from "../src/spine/platforms/catalog-wave2.js";
import { mapPlatformDocument } from "../src/spine/platforms/mappings.js";
import { parsePlatformPullConfig, runPlatformPull, type PullFetch } from "../src/spine/platforms/live-pull.js";
import { PULL_PLANS } from "../src/spine/platforms/pull-plans.js";
import { admitDropInFile } from "../src/spine/drop-in.js";
import { ApprovalGate } from "../src/approvals/gate.js";
import { defaultPermissionSettings } from "../src/approvals/permissions.js";
import { buildCallbackRootCauseBoard } from "../src/modules/callback-root-cause.js";

const FIX = join(__dirname, "fixtures/platforms");
const RECEIVED = "2026-10-19T12:00:00.000Z";
const fixture = (kind: string) => JSON.parse(readFileSync(join(FIX, `${kind}-export.json`), "utf8")) as Record<string, unknown>;
const box = () => mkdtempSync(join(tmpdir(), "tr-wave2-"));

function byEntity(kind: PlatformKind) {
  const out: Record<string, ReturnType<typeof mapPlatformDocument>> = {};
  for (const record of mapPlatformDocument(kind, fixture(kind))) (out[record.entity] ??= []).push(record);
  return out;
}

const LIVE: PlatformKind[] = ["workiz", "servicetrade", "fieldpulse", "servicem8", "simpro", "commusoft", "kickserv"];
const FILE_ONLY: PlatformKind[] = ["successware", "buildops", "mhelpdesk", "wintac"];

describe("wave-2 platform catalog", () => {
  it("adds Successware plus ten researched platforms, each with a reason and sources, no usage figures", () => {
    expect(WAVE2_KINDS).toHaveLength(11);
    expect(WAVE2_KINDS[0]).toBe("successware");
    for (const kind of WAVE2_KINDS) {
      expect(PLATFORM_KINDS).toContain(kind);
      const spec = PLATFORM_SPECS[kind];
      expect(spec.selection?.reason.length).toBeGreaterThan(20);
      expect(spec.selection?.sources.length).toBeGreaterThan(0);
      for (const source of spec.selection!.sources) expect(source).toMatch(/^https:\/\//);
      expect(spec.selection!.reason).not.toMatch(/market share|\d+(\.\d+)?%/i);
      expect(spec.honesty).toContain("Not tested against a live tenant.");
      expect(spec.inboundDir).toBe(`data/inbound/${kind}`);
    }
  });

  it("ships live pull only for documented APIs; the rest are file drop only", () => {
    for (const kind of LIVE) {
      expect(PLATFORM_SPECS[kind].api.livePull, kind).toBe(true);
      expect(PULL_PLANS[kind], kind).toBeDefined();
      for (const request of PULL_PLANS[kind]!.requests) expect(request.method).toBe("GET");
    }
    for (const kind of FILE_ONLY) {
      expect(PLATFORM_SPECS[kind].api.livePull, kind).toBe(false);
      expect(PULL_PLANS[kind], kind).toBeUndefined();
    }
    expect(PLATFORM_SPECS.successware.api.status).toBe("partner-gated");
    expect(PLATFORM_SPECS.buildops.api.status).toBe("partner-gated");
    expect(PLATFORM_SPECS.mhelpdesk.api.status).toBe("no-public-api");
    expect(PLATFORM_SPECS.wintac.api.status).toBe("no-public-api");
    expect(PLATFORM_SPECS.kickserv.api.access).toMatch(/XML/);
  });
});

describe("wave-2 mappers (synthetic fixtures)", () => {
  it("maps each platform's jobs with ids, status, tech, customer, and money as named", () => {
    const expectations: Record<string, { id: string; status: string; tech?: string; customer?: string; total?: number }> = {
      successware: { id: "SYN-SW-C1", status: "Completed", tech: "Synthetic Tech S", customer: "SYN-SW-CU1", total: 412 },
      workiz: { id: "SYN-WZ-J1", status: "Submitted", tech: "Synthetic Tech W", customer: "SYN-WZ-CL1", total: 189.5 },
      servicetrade: { id: "91001", status: "scheduled", tech: "Synthetic Tech T", customer: "81", total: 1250 },
      buildops: { id: "SYN-BO-J1", status: "In Progress", tech: "Synthetic Tech B", customer: "SYN-BO-CU1", total: 3400 },
      fieldpulse: { id: "5501", status: "scheduled", tech: "Synthetic Tech F", customer: "4401", total: 275 },
      kickserv: { id: "SYN-KS-77", status: "Scheduled", tech: "Synthetic Tech K", customer: "SYN-KS-C1", total: 145 },
      mhelpdesk: { id: "SYN-MHD-T1", status: "Scheduled", tech: "Synthetic Tech M", customer: "SYN-MHD-C1", total: 99 },
      servicem8: { id: "SYN-SM8-J1", status: "Work Order", customer: "SYN-SM8-CO1", total: 320 },
      simpro: { id: "7001", status: "Scheduled", tech: "Synthetic Tech P", customer: "601", total: 990 },
      commusoft: { id: "3001", status: "open", tech: "Synthetic Engineer C", customer: "2001" },
      wintac: { id: "SYN-WT-5001", status: "Open", tech: "Synthetic Tech T", customer: "SYN-WT-C1", total: 260 }
    };
    for (const kind of WAVE2_KINDS) {
      const job = byEntity(kind).job?.[0];
      const want = expectations[kind]!;
      expect(job?.externalId, kind).toBe(want.id);
      expect(job?.status, kind).toBe(want.status);
      if (want.tech) expect(job?.raw.technicianName, kind).toBe(want.tech);
      if (want.customer) expect(String(job?.raw.customerId), kind).toBe(want.customer);
      if (want.total !== undefined) expect(job?.raw.jobTotal, kind).toBe(want.total);
      else expect(job?.raw.jobTotal, kind).toBeUndefined();
    }
  });

  it("converts ServiceTrade Unix-second windows and keeps only scheduled ServiceM8 activities", () => {
    expect(byEntity("servicetrade").job![0]!.observedAt).toBe("2026-10-24T12:00:00.000Z");
    const sm8 = byEntity("servicem8");
    expect(sm8.appointment!.map((row) => row.externalId)).toEqual(["SYN-SM8-A1"]);
    expect(sm8.appointment![0]!.raw).toMatchObject({ technicianId: "SYN-SM8-S1", jobId: "SYN-SM8-J1" });
  });

  it("reads a Wintac CSV export by header aliases", () => {
    const result = admitDropInFile(join(FIX, "wintac-workorders.csv"), { receivedAt: RECEIVED, preferClass: "wintac" });
    expect(result.result.ok).toBe(true);
    if (!result.result.ok) return;
    expect(result.result.peerClass).toBe("wintac");
    expect(result.result.profileId).toBe("wintac-csv");
    expect(result.result.records[0]!.externalId).toBe("SYN-WT-CSV-1");
    expect(result.result.records[0]!.verificationStatus).toBe("UNVERIFIED");
  });

  it("Commusoft recalls link to the parent job in the callback root-cause module", () => {
    const cwd = box();
    mkdirSync(join(cwd, "data/inbound/commusoft"), { recursive: true });
    copyFileSync(join(FIX, "commusoft-export.json"), join(cwd, "data/inbound/commusoft/commusoft-export.json"));
    const board = buildCallbackRootCauseBoard({ cwd, instanceId: "local", now: RECEIVED });
    expect(board.links).toHaveLength(1);
    expect(board.links[0]).toMatchObject({ callbackJobId: "3002", originalJobId: "3001", originalTechnicianName: "Synthetic Engineer C", daysBetween: 2 });
  });
});

function fakeFetch(responses: Record<string, unknown>, seen: Array<{ url: string; headers: Record<string, string> }>): PullFetch {
  return async (url, init) => {
    seen.push({ url, headers: init.headers });
    const match = Object.keys(responses).find((key) => url.includes(key));
    return { ok: Boolean(match), status: match ? 200 : 404, text: async () => JSON.stringify(match ? responses[match] : {}) };
  };
}

describe("wave-2 live pull (fake fetch only; never a live tenant)", () => {
  it("sends ServiceM8 and FieldPulse keys in their documented header, not Authorization", async () => {
    for (const [kind, header, responses] of [
      ["servicem8", "X-API-Key", { "job.json": [{ uuid: "J" }], "company.json": [], "jobactivity.json": [], "staff.json": [] }],
      ["fieldpulse", "x-api-key", { "/jobs": { response: [{ id: 1 }] }, "/customers": { response: [] }, "/invoices": { response: [] }, "/estimates": { response: [] } }]
    ] as const) {
      const cwd = box();
      const seen: Array<{ url: string; headers: Record<string, string> }> = [];
      const result = await runPlatformPull({
        kind,
        cwd,
        config: parsePlatformPullConfig(kind, { tokenEnv: "TR_TEST_KEY" }),
        env: { TR_TEST_KEY: "synthetic-key" },
        fetchImpl: fakeFetch(responses as Record<string, unknown>, seen),
        now: () => new Date(RECEIVED)
      });
      expect(result.outcome, kind).toBe("pulled");
      expect(result.counts.jobs).toBe(1);
      expect(seen[0]!.headers[header]).toBe("synthetic-key");
      expect(seen[0]!.headers.Authorization).toBeUndefined();
    }
  });

  it("Simpro needs the operator's build URL and company id; nothing is fetched without them", async () => {
    const cwd = box();
    const noBase = await runPlatformPull({ kind: "simpro", cwd, config: parsePlatformPullConfig("simpro", { tokenEnv: "T", companyId: "0" }), env: { T: "x" }, fetchImpl: fakeFetch({}, []) });
    expect(noBase.outcome).toBe("no-pull-configured");
    const noCompany = await runPlatformPull({ kind: "simpro", cwd, config: parsePlatformPullConfig("simpro", { tokenEnv: "T", baseUrl: "https://synthetic.simprosuite.com" }), env: { T: "x" }, fetchImpl: fakeFetch({}, []) });
    expect(noCompany.outcome).toBe("no-pull-configured");
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const ok = await runPlatformPull({
      kind: "simpro",
      cwd,
      config: parsePlatformPullConfig("simpro", { tokenEnv: "T", baseUrl: "https://synthetic.simprosuite.com", companyId: "0", pageSize: 25 }),
      env: { T: "x" },
      fetchImpl: fakeFetch({ "/companies/0/jobs/": [{ ID: 1 }] }, seen),
      now: () => new Date(RECEIVED)
    });
    expect(ok.outcome).toBe("pulled");
    expect(seen[0]!.url).toBe("https://synthetic.simprosuite.com/api/v1.0/companies/0/jobs/?pageSize=25");
    expect(seen[0]!.headers.Authorization).toBe("Bearer x");
  });

  it("file-drop-only platforms never fetch", async () => {
    for (const kind of FILE_ONLY) {
      const seen: Array<{ url: string; headers: Record<string, string> }> = [];
      const result = await runPlatformPull({ kind, cwd: box(), env: {}, fetchImpl: fakeFetch({}, seen) });
      expect(result.outcome, kind).toBe("file-drop-only");
      expect(seen).toHaveLength(0);
    }
  });
});

describe("wave-2 writeback stays behind the gate", () => {
  it("each platform has its own writeback permission, default off, and no backend means no-backend-configured", async () => {
    const cwd = box();
    const off = new ApprovalGate({ cwd, instanceId: "local" });
    const on = new ApprovalGate({ cwd, instanceId: "local", settings: { ...defaultPermissionSettings(), mode: "all" } });
    for (const kind of WAVE2_KINDS) {
      const tool = `trades_runtime_${kind}_writeback`;
      const refused = await off.requestWrite({ tool, args: { method: "POST", path: "/x" }, requestedBy: "mcp:a" });
      expect(refused.status, kind).toBe("refused");
      const pending = await on.requestWrite({ tool, args: { method: "POST", path: "/x" }, requestedBy: "mcp:a" });
      expect(pending.status, kind).toBe("pending");
      if (pending.status !== "pending") continue;
      const decided = await on.decide({ approvalId: pending.approvalId, decision: "yes", decidedBy: "cli:op", via: "cli" });
      expect(decided.result?.outcome, kind).toBe("no-backend-configured");
    }
  });
});
