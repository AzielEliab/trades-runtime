import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApprovalGate, ApprovalRefused, defaultApprovalLogPath } from "../src/approvals/gate.js";
import { handleLocalMcp } from "../src/approvals/local-mcp.js";
import {
  defaultPermissionSettings,
  enabledPermissions,
  loadPermissionSettings,
  parsePermissionSettings,
  savePermissionSettings,
  WRITE_PERMISSIONS,
  type PermissionSettings
} from "../src/approvals/permissions.js";
import { parseWriteBackends } from "../src/approvals/backends.js";
import { WRITE_TOOLS } from "../src/approvals/tools.js";
import { runApprovalCommand } from "../src/cli.js";
import { startOperatorDesk } from "../src/desk/server.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const INSTANCE = "local";

function box(): string {
  return mkdtempSync(join(tmpdir(), "tr-approval-"));
}

function clock(start = "2026-10-19T12:00:00.000Z") {
  let now = Date.parse(start);
  return {
    now: () => new Date(now),
    advance(seconds: number) {
      now += seconds * 1000;
    }
  };
}

function settings(partial: Partial<PermissionSettings>): PermissionSettings {
  return { ...defaultPermissionSettings(), ...partial };
}

const EVENT_ARGS = { kind: "clock-in", technicianId: "tech-1", at: "2026-10-19T12:00:00.000Z" };
const FLAG_ARGS = {
  flagId: "van-7-down",
  vanId: "van-7",
  kind: "vanDown",
  severity: "hold",
  note: "Van will not start",
  raisedAt: "2026-10-19T12:00:00.000Z",
  raisedBy: "tech-1"
};
const ST_ARGS = { method: "PATCH", path: "/jpm/v2/tenant/1/jobs/2", body: { summary: "x" } };

function eventsFile(cwd: string): string {
  return join(cwd, "data/runtime", INSTANCE, "field-events.jsonl");
}

describe("approval-gated writes", () => {
  it("lists only permissions that map to a real write tool", () => {
    expect([...WRITE_PERMISSIONS]).toEqual([
      "servicetitan.writeback",
      "probooks.writeback",
      "tradesapp.writeback",
      "jobber.writeback",
      "housecallpro.writeback",
      "square.writeback",
      "quickbooks.writeback",
      "fieldedge.writeback",
      "servicefusion.writeback",
      "successware.writeback",
      "workiz.writeback",
      "servicetrade.writeback",
      "buildops.writeback",
      "fieldpulse.writeback",
      "kickserv.writeback",
      "mhelpdesk.writeback",
      "servicem8.writeback",
      "simpro.writeback",
      "commusoft.writeback",
      "wintac.writeback",
      "alerts.ack",
      "field_flags.write",
      "field_events.write",
      "refrigerant.write",
      "permits.write",
      "agreements.write",
      "warranty_claims.write",
      "truck_stock.write",
      "callbacks.write"
    ]);
    for (const permission of WRITE_PERMISSIONS) {
      expect(WRITE_TOOLS.filter((tool) => tool.permission === permission)).toHaveLength(1);
    }
  });

  it("default config refuses every write and writes nothing", async () => {
    const cwd = box();
    const gate = new ApprovalGate({ cwd, instanceId: INSTANCE });
    expect(loadPermissionSettings(cwd, INSTANCE).settings).toEqual(defaultPermissionSettings());
    expect(enabledPermissions(gate.settings())).toEqual([]);
    const calls: Record<string, Record<string, unknown>> = {
      trades_runtime_servicetitan_writeback: ST_ARGS,
      trades_runtime_probooks_writeback: { method: "POST", path: "/items" },
      trades_runtime_tradesapp_writeback: { method: "PUT", path: "/jobs/1" },
      trades_runtime_alert_ack: { id: "capacity" },
      trades_runtime_field_flag_raise: FLAG_ARGS,
      trades_runtime_field_event_record: EVENT_ARGS
    };
    for (const tool of WRITE_TOOLS) {
      const result = await gate.requestWrite({ tool: tool.name, args: calls[tool.name] ?? { method: "POST", path: "/x" }, requestedBy: "mcp:a" });
      expect(result.status).toBe("refused");
      if (result.status === "refused") expect(result.reason).toMatch(/is off on this machine/);
    }
    expect(gate.list()).toEqual([]);
    expect(gate.list({ includeClosed: true }).every((row) => row.status === "refused")).toBe(true);
    expect(existsSync(eventsFile(cwd))).toBe(false);
    expect(existsSync(join(cwd, "data/runtime", INSTANCE, "field-flags"))).toBe(false);
    expect(gate.verify()).toBe(true);
  });

  it("selected mode allows only the chosen permissions", async () => {
    const cwd = box();
    savePermissionSettings(cwd, INSTANCE, { mode: "selected", selected: ["field_events.write"] });
    const gate = new ApprovalGate({ cwd, instanceId: INSTANCE });
    const event = await gate.requestWrite({ tool: "trades_runtime_field_event_record", args: EVENT_ARGS, requestedBy: "mcp:a" });
    expect(event.status).toBe("pending");
    const flag = await gate.requestWrite({ tool: "trades_runtime_field_flag_raise", args: FLAG_ARGS, requestedBy: "mcp:a" });
    expect(flag.status).toBe("refused");
    expect(existsSync(eventsFile(cwd))).toBe(false);
  });

  it("a denied call does not run and the refusal is recorded", async () => {
    const cwd = box();
    const gate = new ApprovalGate({ cwd, instanceId: INSTANCE, settings: settings({ selected: ["field_events.write"] }) });
    const pending = await gate.requestWrite({ tool: "trades_runtime_field_event_record", args: EVENT_ARGS, requestedBy: "mcp:a" });
    if (pending.status !== "pending") throw new Error("expected pending");
    const denied = await gate.decide({ approvalId: pending.approvalId, decision: "no", decidedBy: "desk:operator", via: "desk" });
    expect(denied.status).toBe("denied");
    expect(existsSync(eventsFile(cwd))).toBe(false);
    await expect(
      gate.decide({ approvalId: pending.approvalId, decision: "yes", decidedBy: "desk:operator", via: "desk" })
    ).rejects.toThrow(/single-use/);
    const log = readFileSync(join(cwd, defaultApprovalLogPath(INSTANCE)), "utf8");
    expect(log).toContain('"event":"denied"');
  });

  it("an approval runs the call exactly once", async () => {
    const cwd = box();
    const gate = new ApprovalGate({ cwd, instanceId: INSTANCE, settings: settings({ selected: ["field_events.write"] }) });
    const pending = await gate.requestWrite({ tool: "trades_runtime_field_event_record", args: EVENT_ARGS, requestedBy: "mcp:a" });
    if (pending.status !== "pending") throw new Error("expected pending");
    const done = await gate.decide({ approvalId: pending.approvalId, decision: "yes", decidedBy: "desk:operator", via: "desk" });
    expect(done.status).toBe("executed");
    expect(done.result?.ok).toBe(true);
    expect(readFileSync(eventsFile(cwd), "utf8").trim().split("\n")).toHaveLength(1);
    await expect(
      gate.decide({ approvalId: pending.approvalId, decision: "yes", decidedBy: "cli:someone-else", via: "cli" })
    ).rejects.toMatchObject({ code: "already-used" });
    expect(readFileSync(eventsFile(cwd), "utf8").trim().split("\n")).toHaveLength(1);
    expect(gate.verify()).toBe(true);
  });

  it("expired approvals fail and are logged", async () => {
    const cwd = box();
    const time = clock();
    const gate = new ApprovalGate({
      cwd,
      instanceId: INSTANCE,
      now: time.now,
      settings: settings({ selected: ["field_events.write"], approvalTtlSeconds: 60 })
    });
    const pending = await gate.requestWrite({ tool: "trades_runtime_field_event_record", args: EVENT_ARGS, requestedBy: "mcp:a" });
    if (pending.status !== "pending") throw new Error("expected pending");
    time.advance(61);
    expect(gate.list()).toEqual([]);
    expect(gate.get(pending.approvalId)?.status).toBe("expired");
    await expect(
      gate.decide({ approvalId: pending.approvalId, decision: "yes", decidedBy: "desk:operator", via: "desk" })
    ).rejects.toMatchObject({ code: "expired" });
    expect(existsSync(eventsFile(cwd))).toBe(false);
    expect(readFileSync(join(cwd, defaultApprovalLogPath(INSTANCE)), "utf8")).toContain('"event":"expired"');
  });

  it("the caller can never approve its own request", async () => {
    const cwd = box();
    const gate = new ApprovalGate({ cwd, instanceId: INSTANCE, settings: settings({ selected: ["field_events.write"] }) });
    const viaMcp = await gate.requestWrite({ tool: "trades_runtime_field_event_record", args: EVENT_ARGS, requestedBy: "mcp:s1" });
    if (viaMcp.status !== "pending") throw new Error("expected pending");
    await expect(
      gate.decide({ approvalId: viaMcp.approvalId, decision: "yes", decidedBy: "mcp:s1", via: "desk" })
    ).rejects.toBeInstanceOf(ApprovalRefused);
    await expect(
      gate.decide({ approvalId: viaMcp.approvalId, decision: "yes", decidedBy: "mcp:other", via: "desk" })
    ).rejects.toMatchObject({ code: "mcp-caller" });

    const local = await gate.requestWrite({ tool: "trades_runtime_field_event_record", args: EVENT_ARGS, requestedBy: "cli:bob" });
    if (local.status !== "pending") throw new Error("expected pending");
    await expect(
      gate.decide({ approvalId: local.approvalId, decision: "yes", decidedBy: "cli:bob", via: "cli" })
    ).rejects.toMatchObject({ code: "self-approval" });

    // The MCP surface has no approve tool, and operator-only names are refused.
    const reply = (await handleLocalMcp(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "trades_runtime_approve", arguments: { approvalId: viaMcp.approvalId } } },
      gate,
      "s1"
    )) as { result: { isError: boolean } };
    expect(reply.result.isError).toBe(true);
    expect(gate.get(viaMcp.approvalId)?.status).toBe("pending");
    expect(existsSync(eventsFile(cwd))).toBe(false);
  });

  it("all mode enables every permission but still prompts without autoApprove", async () => {
    const cwd = box();
    const gate = new ApprovalGate({ cwd, instanceId: INSTANCE, settings: settings({ mode: "all" }) });
    expect(enabledPermissions(gate.settings())).toEqual([...WRITE_PERMISSIONS]);
    const result = await gate.requestWrite({ tool: "trades_runtime_field_event_record", args: EVENT_ARGS, requestedBy: "mcp:a" });
    expect(result.status).toBe("pending");
    expect(existsSync(eventsFile(cwd))).toBe(false);

    const auto = new ApprovalGate({ cwd: box(), instanceId: INSTANCE, settings: settings({ mode: "all", autoApprove: true }) });
    const ran = await auto.requestWrite({ tool: "trades_runtime_field_event_record", args: EVENT_ARGS, requestedBy: "mcp:a" });
    expect(ran.status).toBe("executed");
    expect(auto.get((ran as { approvalId: string }).approvalId)?.decidedBy).toBe("auto-approve");

    // autoApprove is ignored in selected mode.
    const selectedAuto = new ApprovalGate({
      cwd: box(),
      instanceId: INSTANCE,
      settings: settings({ mode: "selected", selected: ["field_events.write"], autoApprove: true })
    });
    const stillAsks = await selectedAuto.requestWrite({ tool: "trades_runtime_field_event_record", args: EVENT_ARGS, requestedBy: "mcp:a" });
    expect(stillAsks.status).toBe("pending");
  });

  it("backend write-back without a configured backend returns no-backend-configured, never success", async () => {
    const cwd = box();
    const gate = new ApprovalGate({ cwd, instanceId: INSTANCE, settings: settings({ selected: ["servicetitan.writeback"] }), env: {} });
    const pending = await gate.requestWrite({ tool: "trades_runtime_servicetitan_writeback", args: ST_ARGS, requestedBy: "mcp:a" });
    if (pending.status !== "pending") throw new Error("expected pending");
    const done = await gate.decide({ approvalId: pending.approvalId, decision: "yes", decidedBy: "desk:operator", via: "desk" });
    expect(done.status).toBe("executed");
    expect(done.result).toMatchObject({ ok: false, outcome: "no-backend-configured" });

    // Configured backend but no credential in the environment: still honest.
    mkdirSync(join(cwd, "data/runtime", INSTANCE), { recursive: true });
    writeFileSync(
      join(cwd, "data/runtime", INSTANCE, "write-backends.json"),
      JSON.stringify({ servicetitan: { baseUrl: "https://api.example.invalid", tokenEnv: "TR_TEST_ST_TOKEN" } })
    );
    const second = await gate.requestWrite({ tool: "trades_runtime_servicetitan_writeback", args: ST_ARGS, requestedBy: "mcp:a" });
    if (second.status !== "pending") throw new Error("expected pending");
    const noCred = await gate.decide({ approvalId: second.approvalId, decision: "yes", decidedBy: "desk:operator", via: "desk" });
    expect(noCred.result).toMatchObject({ ok: false, outcome: "no-backend-configured" });

    // Configured + credential: the vendor answer is reported as-is.
    const seen: Array<{ url: string; method: string; auth: string | undefined }> = [];
    const configured = new ApprovalGate({
      cwd,
      instanceId: INSTANCE,
      settings: settings({ selected: ["servicetitan.writeback"] }),
      env: { TR_TEST_ST_TOKEN: "local-test-token" },
      fetchImpl: async (url, init) => {
        seen.push({ url, method: init.method, auth: init.headers.Authorization });
        return { status: 403, ok: false, text: async () => "forbidden" };
      }
    });
    const third = await configured.requestWrite({ tool: "trades_runtime_servicetitan_writeback", args: ST_ARGS, requestedBy: "mcp:a" });
    if (third.status !== "pending") throw new Error("expected pending");
    const vendor = await configured.decide({ approvalId: third.approvalId, decision: "yes", decidedBy: "desk:operator", via: "desk" });
    expect(vendor.result).toMatchObject({ ok: false, outcome: "vendor-error" });
    expect(seen).toEqual([{ url: "https://api.example.invalid/jpm/v2/tenant/1/jobs/2", method: "PATCH", auth: "Bearer local-test-token" }]);
    expect(readFileSync(join(cwd, defaultApprovalLogPath(INSTANCE)), "utf8")).not.toContain("local-test-token");
  });

  it("refuses inline credentials and non-https backends", () => {
    expect(() => parseWriteBackends({ servicetitan: { baseUrl: "https://x.test", tokenEnv: "A", token: "secret" } })).toThrow(/inline token/);
    expect(() => parseWriteBackends({ probooks: { baseUrl: "http://example.com", tokenEnv: "A" } })).toThrow(/https/);
    expect(() => parsePermissionSettings({ mode: "selected", selected: ["jobs.write"] })).toThrow(/unknown write permission/);
  });

  it("serves the local MCP, approvals, and settings on the loopback desk", async () => {
    const cwd = box();
    const desk = await startOperatorDesk({ cwd, port: 0, persistAlertState: false, persistLocalReports: false });
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      fetch(new URL(path, desk.url), { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    try {
      const listed = (await (await post("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" })).json()) as {
        result: { tools: Array<{ name: string; requiresApproval?: boolean; permissionEnabled?: boolean }> };
      };
      const st = listed.result.tools.find((tool) => tool.name === "trades_runtime_servicetitan_writeback");
      expect(st).toMatchObject({ requiresApproval: true, permissionEnabled: false });
      expect(listed.result.tools.some((tool) => /approve|deny/.test(tool.name))).toBe(false);

      // Default: refused.
      const call = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "trades_runtime_field_event_record", arguments: EVENT_ARGS } };
      const refused = (await (await post("/mcp", call, { "mcp-session-id": "agent-1" })).json()) as {
        result: { structuredContent: { status: string } };
      };
      expect(refused.result.structuredContent.status).toBe("refused");

      // Settings change needs the desk token and no MCP session.
      expect((await post("/api/permissions", { mode: "selected", selected: ["field_events.write"] })).status).toBe(403);
      expect(
        (
          await post(
            "/api/permissions",
            { mode: "selected", selected: ["field_events.write"] },
            { "x-trades-desk-token": desk.deskToken, "mcp-session-id": "agent-1" }
          )
        ).status
      ).toBe(403);
      expect(
        (await post("/api/permissions", { mode: "selected", selected: ["field_events.write"] }, { "x-trades-desk-token": desk.deskToken, origin: "https://evil.example" })).status
      ).toBe(403);
      const saved = await post("/api/permissions", { mode: "selected", selected: ["field_events.write"] }, { "x-trades-desk-token": desk.deskToken });
      expect(saved.status).toBe(200);

      const pending = (await (await post("/mcp", call, { "mcp-session-id": "agent-1" })).json()) as {
        result: { structuredContent: { status: string; approvalId: string } };
      };
      expect(pending.result.structuredContent.status).toBe("pending");
      const approvalId = pending.result.structuredContent.approvalId;

      const queue = (await (await fetch(new URL("/api/approvals", desk.url))).json()) as { approvals: Array<{ approvalId: string }> };
      expect(queue.approvals.map((row) => row.approvalId)).toEqual([approvalId]);

      // The MCP caller cannot reach the decide endpoint with its session, or without the token.
      expect((await post("/api/approvals/decide", { approvalId, decision: "yes" }, { "mcp-session-id": "agent-1", "x-trades-desk-token": desk.deskToken })).status).toBe(403);
      expect((await post("/api/approvals/decide", { approvalId, decision: "yes" })).status).toBe(403);
      expect(existsSync(eventsFile(cwd))).toBe(false);

      const decided = (await (await post("/api/approvals/decide", { approvalId, decision: "yes" }, { "x-trades-desk-token": desk.deskToken })).json()) as {
        approval: { status: string; decidedBy: string };
      };
      expect(decided.approval).toMatchObject({ status: "executed", decidedBy: "desk:operator" });
      expect(existsSync(eventsFile(cwd))).toBe(true);
      const again = await post("/api/approvals/decide", { approvalId, decision: "yes" }, { "x-trades-desk-token": desk.deskToken });
      expect(again.status).toBe(409);

      const page = await (await fetch(desk.url)).text();
      expect(page).toContain('id="approvals-board"');
      expect(page).toContain("All permissions");
      expect(page).toContain("Selected permissions");
    } finally {
      await desk.close();
    }
  });

  it("the local CLI approves and changes permissions", async () => {
    const cwd = box();
    const lines: string[] = [];
    await runApprovalCommand({ kind: "permissions", cwd, enable: ["field_flags.write"], disable: [] }, (text) => lines.push(text));
    expect(loadPermissionSettings(cwd, INSTANCE).settings.selected).toEqual(["field_flags.write"]);
    const gate = new ApprovalGate({ cwd, instanceId: INSTANCE });
    const pending = await gate.requestWrite({ tool: "trades_runtime_field_flag_raise", args: FLAG_ARGS, requestedBy: "mcp:a" });
    if (pending.status !== "pending") throw new Error("expected pending");
    await runApprovalCommand({ kind: "approve", cwd, approvalId: pending.approvalId, decision: "yes", by: "aziel" }, (text) => lines.push(text));
    expect(gate.get(pending.approvalId)).toMatchObject({ status: "executed", decidedBy: "cli:aziel", decidedVia: "cli" });
    expect(existsSync(join(cwd, "data/runtime", INSTANCE, "field-flags", "van-7-down.json"))).toBe(true);
  });

  it("keeps catalog honesty flags", () => {
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
  });
});
