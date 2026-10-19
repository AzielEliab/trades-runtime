import { randomBytes } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, statSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { canonicalJson, sha256 } from "../core/hash.js";
import { DurableReceiptStore } from "../spine/durable-receipts.js";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";
import type { FetchLike } from "./backends.js";
import {
  isPermissionEnabled,
  loadPermissionSettings,
  skipsPrompt,
  type PermissionSettings,
  type WritePermission
} from "./permissions.js";
import { findWriteTool, type WriteToolContext, type WriteToolResult } from "./tools.js";

/**
 * The one approval gate for every write.
 *
 * A write tool call never runs directly. It becomes a pending approval request
 * (tool, target, payload summary). A local operator answers yes or no from the
 * loopback desk or `npm run approve -- <id> yes|no`. A yes runs that one call
 * once. A no refuses it. Approvals are single-use and expire.
 *
 * Every request and decision is appended to the hash-chained receipt store
 * (DurableReceiptStore) at data/runtime/<instanceId>/approvals.jsonl.
 */

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "executed" | "refused";
export type ApprovalDecision = "yes" | "no";
export type DeciderVia = "desk" | "cli" | "auto-approve";

export interface ApprovalRequest {
  approvalId: string;
  tool: string;
  permission: WritePermission;
  target: string;
  summary: string;
  payloadHash: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt: string;
  status: ApprovalStatus;
  decidedBy?: string;
  decidedVia?: DeciderVia;
  decidedAt?: string;
  result?: WriteToolResult;
  refusal?: string;
}

export class ApprovalRefused extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApprovalRefused";
    this.code = code;
  }
}

export function defaultApprovalLogPath(instanceId: string, root = "data/runtime"): string {
  return join(root, sanitizeInstanceId(instanceId), "approvals.jsonl");
}

interface LogBody {
  event: "requested" | "approved" | "denied" | "expired" | "executed" | "refused";
  approvalId: string;
  tool: string;
  permission: WritePermission;
  target: string;
  summary: string;
  payloadHash: string;
  requestedBy?: string;
  expiresAt?: string;
  args?: Record<string, unknown>;
  decidedBy?: string;
  decidedVia?: DeciderVia;
  result?: WriteToolResult;
  reason?: string;
  live_backends: false;
}

export interface ApprovalGateOptions {
  cwd: string;
  instanceId: string;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  /** Override the stored settings (tests). Production reads data/runtime/<instanceId>/permissions.json each call. */
  settings?: PermissionSettings;
}

export type WriteCallResult =
  | {
      status: "pending";
      approvalId: string;
      tool: string;
      permission: WritePermission;
      target: string;
      summary: string;
      expiresAt: string;
      approveWith: string;
      note: string;
    }
  | { status: "refused"; tool: string; permission: WritePermission | null; reason: string; approvalId?: string }
  | { status: "executed"; approvalId: string; tool: string; permission: WritePermission; result: WriteToolResult; autoApproved: true };

function summarize(args: Record<string, unknown>): string {
  const text = canonicalJson(args);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const MCP_PREFIX = "mcp:";

export function isMcpCaller(id: string): boolean {
  return id.startsWith(MCP_PREFIX);
}

export function mcpCallerId(sessionId: string): string {
  return `${MCP_PREFIX}${sessionId}`;
}

export class ApprovalGate {
  readonly cwd: string;
  readonly instanceId: string;
  readonly logPath: string;
  private readonly now: () => Date;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly fetchImpl?: FetchLike;
  private readonly fixedSettings?: PermissionSettings;

  constructor(options: ApprovalGateOptions) {
    this.cwd = options.cwd;
    this.instanceId = sanitizeInstanceId(options.instanceId);
    const rel = defaultApprovalLogPath(this.instanceId);
    this.logPath = isAbsolute(rel) ? rel : join(this.cwd, rel);
    this.now = options.now ?? (() => new Date());
    this.env = options.env;
    this.fetchImpl = options.fetchImpl;
    this.fixedSettings = options.settings;
  }

  settings(): PermissionSettings {
    return this.fixedSettings ?? loadPermissionSettings(this.cwd, this.instanceId).settings;
  }

  private store(): DurableReceiptStore {
    return new DurableReceiptStore(this.logPath);
  }

  /** Cross-process lock so two writers never fork the hash chain or double-decide one approval. */
  private withLock<T>(fn: () => T): T {
    const lockPath = `${this.logPath}.lock`;
    mkdirSync(dirname(lockPath), { recursive: true });
    let fd: number | undefined;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        fd = openSync(lockPath, "wx");
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > 30_000) unlinkSync(lockPath);
        } catch {
          /* lock released between checks */
        }
        sleepSync(10);
      }
    }
    if (fd === undefined) throw new ApprovalRefused("busy", "approval log is busy; try again");
    try {
      return fn();
    } finally {
      closeSync(fd);
      try {
        unlinkSync(lockPath);
      } catch {
        /* already gone */
      }
    }
  }

  private append(body: LogBody): void {
    const at = this.now().toISOString();
    this.store().appendKind("lifecycle", `${body.approvalId}:${body.event}:${at}`, at, { approval: true, ...body });
  }

  private records(): LogBody[] {
    if (!existsSync(this.logPath)) return [];
    return this.store()
      .load()
      .receipts.filter((receipt) => receipt.body.approval === true)
      .map((receipt) => ({ ...(receipt.body as unknown as LogBody), at: receipt.at }) as LogBody & { at: string });
  }

  private requestArgs(approvalId: string): Record<string, unknown> | undefined {
    return this.records().find((row) => row.approvalId === approvalId && row.event === "requested")?.args;
  }

  /** Replay the append-only log into current request state. Pending past expiry reads as expired. */
  list(options: { includeClosed?: boolean } = {}): ApprovalRequest[] {
    const byId = new Map<string, ApprovalRequest>();
    for (const row of this.records() as Array<LogBody & { at: string }>) {
      if (row.event === "requested") {
        byId.set(row.approvalId, {
          approvalId: row.approvalId,
          tool: row.tool,
          permission: row.permission,
          target: row.target,
          summary: row.summary,
          payloadHash: row.payloadHash,
          requestedBy: row.requestedBy ?? "unknown",
          requestedAt: row.at,
          expiresAt: row.expiresAt ?? row.at,
          status: "pending"
        });
        continue;
      }
      const current = byId.get(row.approvalId);
      if (!current) {
        if (row.event === "refused") {
          byId.set(row.approvalId, {
            approvalId: row.approvalId,
            tool: row.tool,
            permission: row.permission,
            target: row.target,
            summary: row.summary,
            payloadHash: row.payloadHash,
            requestedBy: row.requestedBy ?? "unknown",
            requestedAt: row.at,
            expiresAt: row.at,
            status: "refused",
            refusal: row.reason
          });
        }
        continue;
      }
      current.status = row.event;
      if (row.decidedBy) current.decidedBy = row.decidedBy;
      if (row.decidedVia) current.decidedVia = row.decidedVia;
      if (row.event === "approved" || row.event === "denied") current.decidedAt = row.at;
      if (row.result) current.result = row.result;
      if (row.reason) current.refusal = row.reason;
    }
    const nowMs = this.now().getTime();
    const out = [...byId.values()].map((request) =>
      request.status === "pending" && Date.parse(request.expiresAt) <= nowMs ? { ...request, status: "expired" as const } : request
    );
    return options.includeClosed ? out : out.filter((request) => request.status === "pending");
  }

  get(approvalId: string): ApprovalRequest | undefined {
    return this.list({ includeClosed: true }).find((request) => request.approvalId === approvalId);
  }

  private context(): WriteToolContext {
    return { cwd: this.cwd, instanceId: this.instanceId, now: this.now, env: this.env, fetchImpl: this.fetchImpl };
  }

  /** Entry point for every write tool call. Never runs the write unless the operator turned on autoApprove in all mode. */
  async requestWrite(args: { tool: string; args: Record<string, unknown>; requestedBy: string }): Promise<WriteCallResult> {
    const spec = findWriteTool(args.tool);
    if (!spec) return { status: "refused", tool: args.tool, permission: null, reason: `unknown write tool ${args.tool}` };
    const settings = this.settings();
    const approvalId = `apr_${randomBytes(9).toString("hex")}`;
    const payloadHash = sha256(args.args);
    const base = {
      approvalId,
      tool: spec.name,
      permission: spec.permission,
      target: "",
      summary: summarize(args.args),
      payloadHash,
      requestedBy: args.requestedBy,
      live_backends: false as const
    };
    if (!isPermissionEnabled(settings, spec.permission)) {
      const reason =
        `permission ${spec.permission} is off on this machine. Writes require operator approval; default off. ` +
        `The operator can enable it in desk settings or ${join("data/runtime", this.instanceId, "permissions.json")}.`;
      let target = "(not validated)";
      try {
        target = spec.validate(args.args);
      } catch {
        /* the refusal reason is the permission, not the payload */
      }
      this.withLock(() => this.append({ ...base, target, event: "refused", reason }));
      return { status: "refused", tool: spec.name, permission: spec.permission, reason, approvalId };
    }
    try {
      base.target = spec.validate(args.args);
    } catch (error) {
      return {
        status: "refused",
        tool: spec.name,
        permission: spec.permission,
        reason: `invalid call: ${error instanceof Error ? error.message : String(error)}`
      };
    }
    const target = base.target;
    const expiresAt = new Date(this.now().getTime() + settings.approvalTtlSeconds * 1000).toISOString();
    if (skipsPrompt(settings)) {
      this.withLock(() => {
        this.append({ ...base, event: "requested", expiresAt, args: args.args });
        this.append({ ...base, event: "approved", decidedBy: "auto-approve", decidedVia: "auto-approve" });
      });
      const result = await this.safeExecute(spec.name, args.args);
      this.withLock(() => this.append({ ...base, event: "executed", decidedBy: "auto-approve", decidedVia: "auto-approve", result }));
      return { status: "executed", approvalId, tool: spec.name, permission: spec.permission, result, autoApproved: true };
    }
    this.withLock(() => this.append({ ...base, event: "requested", expiresAt, args: args.args }));
    return {
      status: "pending",
      approvalId,
      tool: spec.name,
      permission: spec.permission,
      target,
      summary: base.summary,
      expiresAt,
      approveWith: `npm run approve -- ${approvalId} yes|no  (or the Approvals panel on the loopback desk)`,
      note: "Nothing has been written. A local operator must answer yes or no. You cannot approve your own request."
    };
  }

  private async safeExecute(tool: string, args: Record<string, unknown>): Promise<WriteToolResult> {
    const spec = findWriteTool(tool);
    if (!spec) return { ok: false, outcome: "unknown-tool", detail: `unknown write tool ${tool}` };
    try {
      return await spec.execute(args, this.context());
    } catch (error) {
      return { ok: false, outcome: "error", detail: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Operator yes/no. `decidedBy` names the human surface (desk or CLI).
   * An MCP caller can never decide, and nobody can decide their own request.
   */
  async decide(args: {
    approvalId: string;
    decision: ApprovalDecision;
    decidedBy: string;
    via: "desk" | "cli";
  }): Promise<ApprovalRequest> {
    if (args.decision !== "yes" && args.decision !== "no") {
      throw new ApprovalRefused("bad-decision", "decision must be yes or no");
    }
    const decidedBy = args.decidedBy.trim();
    if (!decidedBy) throw new ApprovalRefused("no-decider", "a decision needs a named local operator");
    if (isMcpCaller(decidedBy)) {
      throw new ApprovalRefused("mcp-caller", "an MCP caller cannot approve or deny; the local operator decides on the desk or CLI");
    }
    const claimed = this.withLock(() => {
      const request = this.get(args.approvalId);
      if (!request) throw new ApprovalRefused("not-found", `no approval ${args.approvalId}`);
      if (request.requestedBy === decidedBy) {
        throw new ApprovalRefused("self-approval", "the caller that requested a write cannot approve it");
      }
      const base = {
        approvalId: request.approvalId,
        tool: request.tool,
        permission: request.permission,
        target: request.target,
        summary: request.summary,
        payloadHash: request.payloadHash,
        decidedBy,
        decidedVia: args.via,
        live_backends: false as const
      };
      if (request.status === "expired") {
        const stored = this.records().some((row) => row.approvalId === request.approvalId && row.event === "expired");
        if (!stored) this.append({ ...base, event: "expired", reason: "approval window closed before a decision" });
        throw new ApprovalRefused("expired", `approval ${request.approvalId} expired at ${request.expiresAt}`);
      }
      if (request.status !== "pending") {
        throw new ApprovalRefused("already-used", `approval ${request.approvalId} is ${request.status}; approvals are single-use`);
      }
      if (args.decision === "no") {
        this.append({ ...base, event: "denied", reason: "operator answered no" });
        return { request, base, run: false };
      }
      if (!isPermissionEnabled(this.settings(), request.permission)) {
        this.append({ ...base, event: "refused", reason: `permission ${request.permission} was turned off before approval` });
        return { request, base, run: false };
      }
      this.append({ ...base, event: "approved" });
      return { request, base, run: true };
    });
    if (claimed.run) {
      const callArgs = this.requestArgs(claimed.request.approvalId) ?? {};
      if (sha256(callArgs) !== claimed.request.payloadHash) {
        const result: WriteToolResult = { ok: false, outcome: "tampered", detail: "stored payload no longer matches its hash. Nothing was written." };
        this.withLock(() => this.append({ ...claimed.base, event: "executed", result }));
      } else {
        const result = await this.safeExecute(claimed.request.tool, callArgs);
        this.withLock(() => this.append({ ...claimed.base, event: "executed", result }));
      }
    }
    return this.get(claimed.request.approvalId)!;
  }

  verify(): boolean {
    return existsSync(this.logPath) ? this.store().verify() : true;
  }
}

export function openApprovalGate(options: ApprovalGateOptions): ApprovalGate {
  return new ApprovalGate(options);
}
