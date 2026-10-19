import { healthLocal } from "../spine/health-local.js";
import { RUNTIME_MANIFEST } from "../manifest.js";
import { ApprovalGate, mcpCallerId } from "./gate.js";
import { enabledPermissions, PERMISSIONS_NOTE, skipsPrompt, WRITE_PERMISSIONS } from "./permissions.js";
import { WRITE_TOOLS } from "./tools.js";
import { PLATFORM_KINDS, PLATFORM_SPECS } from "../spine/platforms/catalog.js";
import { MODULE_READ_TOOLS } from "../modules/registry.js";

/**
 * Local MCP JSON-RPC surface for the operator machine (POST /mcp on the
 * loopback desk, http://127.0.0.1:4174/mcp). The stdio bridge reaches it with
 * TRADES_RUNTIME_URL=http://127.0.0.1:4174 npm run mcp.
 *
 * Write tools never run on call. They return a pending approval id.
 * There is deliberately no approve or deny tool here: the local operator
 * decides on the desk or with `npm run approve -- <id> yes|no`.
 */

export const LOCAL_MCP_PROTOCOL = "2024-11-05";

const READ_TOOLS = [
  {
    name: "trades_runtime_platforms",
    description: "Platform inbound peers on this runtime (Jobber, Housecall Pro, Square, QuickBooks Online, FieldEdge, Service Fusion): drop folder, live-pull status, write-back permission. Read-only. Not tested against a live tenant.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }
  },
  {
    name: "trades_runtime_health_local",
    description: "Local honesty card for this operator machine. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }
  },
  {
    name: "trades_runtime_permissions",
    description: "Current write-permission settings (mode, enabled permissions, autoApprove). Read-only. Changing them is operator-only on the loopback desk or the local config file.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }
  },
  {
    name: "trades_runtime_approvals_list",
    description: "List write approvals. Pending by default; includeClosed true for history. Read-only. Approving is operator-only.",
    inputSchema: { type: "object", properties: { includeClosed: { type: "boolean" } }, additionalProperties: false },
    annotations: { readOnlyHint: true }
  },
  {
    name: "trades_runtime_approval_status",
    description: "Status and result of one approval id (pending, approved, denied, expired, executed, refused). Read-only.",
    inputSchema: {
      type: "object",
      required: ["approvalId"],
      properties: { approvalId: { type: "string" } },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  }
] as const;

const OPERATOR_ONLY = new Set(["trades_runtime_approve", "trades_runtime_deny", "trades_runtime_approval_decide", "trades_runtime_permissions_set"]);

interface RpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function ok(id: RpcMessage["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(id: RpcMessage["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function textResult(value: unknown, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError };
}

export function localToolsList(gate: ApprovalGate) {
  const settings = gate.settings();
  const enabled = enabledPermissions(settings);
  return [
    ...READ_TOOLS,
    ...MODULE_READ_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true }
    })),
    ...WRITE_TOOLS.map((tool) => ({
      name: tool.name,
      description: `${tool.description} Permission: ${tool.permission} (${enabled.includes(tool.permission) ? "on" : "off"}).`,
      inputSchema: tool.inputSchema,
      requiresApproval: !skipsPrompt(settings),
      permission: tool.permission,
      permissionEnabled: enabled.includes(tool.permission),
      annotations: { readOnlyHint: false, destructiveHint: true, requiresApproval: !skipsPrompt(settings) }
    }))
  ];
}

/**
 * Handle one JSON-RPC message. `sessionId` identifies the MCP caller; every
 * write it requests is recorded as `mcp:<sessionId>`, which the gate never
 * accepts as an approver.
 */
export async function handleLocalMcp(message: RpcMessage, gate: ApprovalGate, sessionId: string): Promise<unknown | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) return fail(null, -32600, "Invalid Request");
  const { id, method } = message;
  const notification = id === undefined;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: LOCAL_MCP_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "trades-runtime-local", version: RUNTIME_MANIFEST.version },
      instructions:
        "Local operator runtime. Writes require operator approval; default off. Write tools return a pending approval id. " +
        "A human operator answers yes or no on the loopback desk or with npm run approve. You cannot approve your own request."
    });
  }
  if (notification) return null;
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: localToolsList(gate) });
  if (method !== "tools/call") return fail(id, -32601, `Method not found: ${String(method)}`);

  const params = message.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";
  const args =
    params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
      ? (params.arguments as Record<string, unknown>)
      : {};

  if (OPERATOR_ONLY.has(name)) {
    return ok(
      id,
      textResult(
        {
          refused: true,
          reason:
            "Approving, denying, and changing permissions are operator-only. Use the Approvals and Settings panels on the loopback desk or npm run approve -- <id> yes|no."
        },
        true
      )
    );
  }
  if (name === "trades_runtime_platforms") {
    return ok(
      id,
      textResult({
        platforms: PLATFORM_KINDS.map((kind) => {
          const spec = PLATFORM_SPECS[kind];
          return {
            kind,
            label: spec.label,
            folder: spec.inboundDir,
            livePull: spec.api.livePull,
            apiStatus: spec.api.status,
            docs: spec.api.docsUrl,
            writebackPermission: spec.writebackPermission,
            honesty: spec.honesty
          };
        }),
        live_backends: false
      })
    );
  }
  const moduleTool = MODULE_READ_TOOLS.find((tool) => tool.name === name);
  if (moduleTool) {
    return ok(id, textResult(moduleTool.build({ cwd: gate.cwd, instanceId: gate.instanceId, now: new Date().toISOString() })));
  }
  if (name === "trades_runtime_health_local") return ok(id, textResult(healthLocal({ cwd: gate.cwd, instanceId: gate.instanceId })));
  if (name === "trades_runtime_permissions") {
    const settings = gate.settings();
    return ok(
      id,
      textResult({
        mode: settings.mode,
        enabled: enabledPermissions(settings),
        known: WRITE_PERMISSIONS,
        autoApprove: settings.autoApprove,
        perCallApproval: !skipsPrompt(settings),
        approvalTtlSeconds: settings.approvalTtlSeconds,
        note: PERMISSIONS_NOTE,
        live_backends: false
      })
    );
  }
  if (name === "trades_runtime_approvals_list") {
    return ok(id, textResult({ approvals: gate.list({ includeClosed: args.includeClosed === true }) }));
  }
  if (name === "trades_runtime_approval_status") {
    const approvalId = typeof args.approvalId === "string" ? args.approvalId : "";
    const found = gate.get(approvalId);
    return ok(id, textResult(found ?? { error: `no approval ${approvalId}` }, !found));
  }
  if (WRITE_TOOLS.some((tool) => tool.name === name)) {
    const result = await gate.requestWrite({ tool: name, args, requestedBy: mcpCallerId(sessionId) });
    return ok(id, textResult(result, result.status === "refused"));
  }
  return fail(id, -32602, `Unknown tool: ${name}`);
}
