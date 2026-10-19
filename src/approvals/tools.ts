import { acknowledgeStoredAlert, defaultAlertStatePath } from "../desk/alerts.js";
import { FIELD_FLAG_KINDS, fieldFlagsDirectory, parseFieldFlag, writeFieldFlagFile } from "../desk/field-flags.js";
import { FIELD_EVENT_KINDS, recordFieldEvent, type FieldEventKind } from "../desk/field-time.js";
import { parseWriteBackRequest, runWriteBack, type FetchLike, type WriteBackendKind } from "./backends.js";
import type { WritePermission } from "./permissions.js";
import { PLATFORM_KINDS, PLATFORM_SPECS } from "../spine/platforms/catalog.js";
import { MODULE_WRITE_TOOLS } from "../modules/write-tools.js";

/**
 * Every write the local runtime can perform from a tool call.
 * Each tool maps to exactly one permission and one real write path.
 * Nothing here runs except through the approval gate (src/approvals/gate.ts).
 */

export interface WriteToolContext {
  cwd: string;
  instanceId: string;
  now: () => Date;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}

export interface WriteToolResult {
  ok: boolean;
  outcome: string;
  detail: string;
  data?: Record<string, unknown>;
}

export interface WriteToolSpec {
  name: string;
  permission: WritePermission;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Throws on a malformed call so no approval is created for it. Returns a short target label. */
  validate(args: Record<string, unknown>): string;
  execute(args: Record<string, unknown>, ctx: WriteToolContext): Promise<WriteToolResult>;
}

const writeBackSchema = {
  type: "object",
  required: ["method", "path"],
  properties: {
    method: { type: "string", enum: ["POST", "PUT", "PATCH"] },
    path: { type: "string", description: "Vendor API path under the configured baseUrl." },
    body: { description: "JSON body sent to the vendor." }
  },
  additionalProperties: false
};

function writeBackTool(kind: WriteBackendKind, permission: WritePermission, label: string): WriteToolSpec {
  return {
    name: `trades_runtime_${kind}_writeback`,
    permission,
    description:
      `Write back to ${label} through the operator's locally configured backend. Requires operator approval (yes/no per call). ` +
      `Without data/runtime/<instanceId>/write-backends.json and a credential in the named env var it returns no-backend-configured and writes nothing.`,
    inputSchema: writeBackSchema,
    validate(args) {
      const request = parseWriteBackRequest(args);
      return `${kind} ${request.method} ${request.path}`;
    },
    async execute(args, ctx) {
      const result = await runWriteBack({
        kind,
        request: parseWriteBackRequest(args),
        cwd: ctx.cwd,
        instanceId: ctx.instanceId,
        env: ctx.env,
        fetchImpl: ctx.fetchImpl
      });
      return {
        ok: result.ok,
        outcome: result.outcome,
        detail: result.detail,
        data: { backend: result.backend, status: result.status ?? null, response: result.response ?? null }
      };
    }
  };
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

export const WRITE_TOOLS: readonly WriteToolSpec[] = [
  writeBackTool("servicetitan", "servicetitan.writeback", "ServiceTitan"),
  writeBackTool("probooks", "probooks.writeback", "ProBooks"),
  writeBackTool("tradesapp", "tradesapp.writeback", "another trades app without its own platform peer"),
  ...PLATFORM_KINDS.map((kind) => writeBackTool(kind, PLATFORM_SPECS[kind].writebackPermission, PLATFORM_SPECS[kind].label)),
  {
    name: "trades_runtime_alert_ack",
    permission: "alerts.ack",
    description: "Acknowledge a firing local desk alert on this machine. Requires operator approval (yes/no per call).",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, by: { type: "string" } },
      additionalProperties: false
    },
    validate(args) {
      return `alert ${stringArg(args, "id")}`;
    },
    async execute(args, ctx) {
      const id = stringArg(args, "id");
      const by = typeof args.by === "string" && args.by.trim() ? args.by.trim().slice(0, 80) : "operator-approved tool call";
      const result = acknowledgeStoredAlert(
        defaultAlertStatePath(ctx.cwd, ctx.instanceId),
        id,
        by,
        ctx.now().toISOString()
      );
      return result.found
        ? { ok: true, outcome: "written", detail: `alert ${id} acknowledged on this machine`, data: { ...result } }
        : { ok: false, outcome: "not-found", detail: `no active alert ${id} on this machine. Nothing was written.` };
    }
  },
  {
    name: "trades_runtime_field_flag_raise",
    permission: "field_flags.write",
    description: "Raise a local field flag file under data/runtime/<instanceId>/field-flags/. Requires operator approval (yes/no per call). Not Field 1.0.",
    inputSchema: {
      type: "object",
      required: ["flagId", "vanId", "kind", "severity", "note", "raisedAt", "raisedBy"],
      properties: {
        flagId: { type: "string" },
        vanId: { type: "string" },
        kind: { type: "string", enum: [...FIELD_FLAG_KINDS] },
        severity: { type: "string", enum: ["info", "watch", "hold"] },
        note: { type: "string" },
        raisedAt: { type: "string" },
        raisedBy: { type: "string" },
        jobId: { type: "string" }
      }
    },
    validate(args) {
      const flag = parseFieldFlag(args, "requested field flag");
      return `field flag ${flag.flagId} (${flag.kind})`;
    },
    async execute(args, ctx) {
      const raised = writeFieldFlagFile(fieldFlagsDirectory(ctx.cwd, ctx.instanceId), args);
      return {
        ok: true,
        outcome: "written",
        detail: `field flag ${raised.flag.flagId} written on this machine`,
        data: { flagId: raised.flag.flagId, kind: raised.flag.kind, severity: raised.flag.severity }
      };
    }
  },
  {
    name: "trades_runtime_field_event_record",
    permission: "field_events.write",
    description: "Record a clock-in / clock-out / meal / extended-drive event in data/runtime/<instanceId>/field-events.jsonl. Requires operator approval (yes/no per call). Not GPS. Not a provider write.",
    inputSchema: {
      type: "object",
      required: ["kind", "technicianId"],
      properties: {
        kind: { type: "string", enum: [...FIELD_EVENT_KINDS] },
        technicianId: { type: "string" },
        technicianName: { type: "string" },
        jobId: { type: "string" },
        at: { type: "string", description: "ISO time. Defaults to the time the call runs." }
      },
      additionalProperties: false
    },
    validate(args) {
      const kind = stringArg(args, "kind");
      if (!(FIELD_EVENT_KINDS as readonly string[]).includes(kind)) {
        throw new Error(`kind must be one of ${FIELD_EVENT_KINDS.join(", ")}`);
      }
      if (args.at !== undefined && (typeof args.at !== "string" || !Number.isFinite(Date.parse(args.at)))) {
        throw new Error("at must be an ISO time");
      }
      return `${kind} for ${stringArg(args, "technicianId")}`;
    },
    async execute(args, ctx) {
      const event = recordFieldEvent({
        cwd: ctx.cwd,
        instanceId: ctx.instanceId,
        kind: stringArg(args, "kind") as FieldEventKind,
        at: typeof args.at === "string" ? args.at : ctx.now().toISOString(),
        technicianId: stringArg(args, "technicianId"),
        technicianName: typeof args.technicianName === "string" ? args.technicianName : null,
        jobId: typeof args.jobId === "string" ? args.jobId : null
      });
      return { ok: true, outcome: "written", detail: `${event.label} recorded on this machine`, data: { eventId: event.id } };
    }
  },
  ...MODULE_WRITE_TOOLS
];

export function findWriteTool(name: string): WriteToolSpec | undefined {
  return WRITE_TOOLS.find((tool) => tool.name === name);
}

export function writeToolForPermission(permission: WritePermission): WriteToolSpec | undefined {
  return WRITE_TOOLS.find((tool) => tool.permission === permission);
}

