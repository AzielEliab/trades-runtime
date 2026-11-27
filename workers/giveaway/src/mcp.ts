import { citeBody, healthBody, skillMarkdown, statsBody } from "./catalog.js";
import type { CountStore } from "./counters.js";
import { classificationMethodForRequest, readFleetStats } from "./counters.js";
import { AUTHOR, PRODUCT, PUBLIC_ORIGIN, VERSION } from "./identity.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    protocolVersion?: unknown;
  };
}

/** Newest first. initialize echoes a requested version from this list. */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export type ProtocolVersion = (typeof PROTOCOL_VERSIONS)[number];
export const LATEST_PROTOCOL_VERSION: ProtocolVersion = PROTOCOL_VERSIONS[0];
/** Answer when initialize omits protocolVersion. Keeps the original public handshake. */
export const DEFAULT_PROTOCOL_VERSION: ProtocolVersion = "2024-11-05";

const INSTRUCTIONS =
  "Public read-only Trades-Runtime giveaway. Tools return health, stats, cite, and skill. No authentication. This Worker holds no tenant data and does not write.";

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
} as const;

export function isProtocolVersion(value: unknown): value is ProtocolVersion {
  return typeof value === "string" && (PROTOCOL_VERSIONS as readonly string[]).includes(value);
}

/**
 * Echo a supported client version. An omitted version stays on 2024-11-05.
 * An unsupported requested version gets the newest version this server speaks.
 * A supported MCP-Protocol-Version header is used only when the body omits the version.
 */
export function negotiateProtocolVersion(requested: unknown, header = ""): ProtocolVersion {
  if (isProtocolVersion(requested)) return requested;
  const missing = requested === undefined || requested === null || requested === "";
  if (missing && isProtocolVersion(header)) return header;
  if (missing) return DEFAULT_PROTOCOL_VERSION;
  return LATEST_PROTOCOL_VERSION;
}

const TOOLS = [
  {
    name: "trades_runtime_health",
    description:
      "Trades-Runtime giveaway health. Read-only. Does not increment counters. This public Worker holds no tenant data and never writes. Writes exist only in the local runtime on the operator machine, where each write requires operator approval and is off by default.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { ...READ_ONLY_ANNOTATIONS }
  },
  {
    name: "trades_runtime_stats",
    description: "Honest KV view/download counts with human/bot split. Read-only. Does not increment counters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { ...READ_ONLY_ANNOTATIONS }
  },
  {
    name: "trades_runtime_cite",
    description:
      "Public cite.json for Trades-Runtime. Read-only. Includes local_package: the local runtime's modules (refrigerant log, permits, agreements, warranty claims, truck stock, callback root cause) and platform peers (Jobber, Housecall Pro, Square, QuickBooks Online, FieldEdge, Service Fusion, Successware, Workiz, ServiceTrade, BuildOps, FieldPulse, Kickserv, mHelpDesk, ServiceM8, Simpro, Commusoft, Wintac) with each peer's mode and mappingConfidence. They run only on the operator machine; this Worker holds no tenant data and was not tested against a live tenant.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { ...READ_ONLY_ANNOTATIONS }
  },
  {
    name: "trades_runtime_skill",
    description:
      "Agent skill markdown for the public giveaway Worker, including what the local package carries: modules, platform peers (file drop or optional read-only pull), and mapping confidence (documented / partial / guessed). Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { ...READ_ONLY_ANNOTATIONS }
  }
];

export async function handleMcp(
  request: Request,
  kv: CountStore,
  releaseReady: boolean,
  releaseBytes: number | null
): Promise<Response> {
  if (request.method === "GET") {
    return new Response(
      JSON.stringify(
        {
          product: PRODUCT,
          version: VERSION,
          author: AUTHOR,
          transport: "JSON-RPC over HTTP POST /mcp",
          auth: "public, no OAuth",
          protocolVersions: [...PROTOCOL_VERSIONS],
          connect: `${PUBLIC_ORIGIN}/connect`,
          tools: TOOLS.map((tool) => tool.name)
        },
        null,
        2
      ) + "\n",
      { headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
  if (request.method !== "POST") {
    return new Response("method not allowed\n", { status: 405 });
  }

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const id = body.id ?? null;
  if (body.method === "initialize") {
    const protocolVersion = negotiateProtocolVersion(body.params?.protocolVersion, protocolHeader(request));
    return rpcResult(
      id,
      {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: PRODUCT, version: VERSION, author: AUTHOR },
        instructions: INSTRUCTIONS
      },
      protocolVersion
    );
  }

  const rejected = rejectUnsupportedProtocol(request, id);
  if (rejected) return rejected;
  const echoed = echoedProtocol(request);

  if (body.method === "notifications/initialized" || body.method === "ping") {
    return rpcResult(id, {}, echoed);
  }
  if (body.method === "tools/list") {
    return rpcResult(id, { tools: TOOLS }, echoed);
  }
  if (body.method === "tools/call") {
    const name = body.params?.name;
    if (name === "trades_runtime_health") {
      return rpcTool(id, healthBody(releaseReady, releaseBytes), echoed);
    }
    if (name === "trades_runtime_stats") {
      return rpcTool(id, statsBody(await readFleetStats(kv, classificationMethodForRequest(request))), echoed);
    }
    if (name === "trades_runtime_cite") {
      return rpcTool(id, citeBody(), echoed);
    }
    if (name === "trades_runtime_skill") {
      return rpcTool(id, skillMarkdown(), echoed, "text/markdown");
    }
    return rpcError(id, -32601, `Unknown tool: ${name ?? ""}`);
  }
  return rpcError(id, -32601, `Unknown method: ${body.method ?? ""}`);
}

function protocolHeader(request: Request): string {
  return (request.headers.get("mcp-protocol-version") || "").trim();
}

function echoedProtocol(request: Request): ProtocolVersion | undefined {
  const header = protocolHeader(request);
  return isProtocolVersion(header) ? header : undefined;
}

/** Subsequent requests with an unsupported MCP-Protocol-Version are 400. initialize negotiates in the body. */
function rejectUnsupportedProtocol(request: Request, id: string | number | null): Response | null {
  const header = protocolHeader(request);
  if (!header || isProtocolVersion(header)) return null;
  return rpcError(
    id,
    -32600,
    `Unsupported MCP-Protocol-Version: ${header}. Supported: ${PROTOCOL_VERSIONS.join(", ")}`
  );
}

function rpcResult(id: string | number | null, result: unknown, protocolVersion?: string): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" };
  if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n", { headers });
}

function rpcError(id: string | number | null, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n", {
    status: 400,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function rpcTool(
  id: string | number | null,
  payload: unknown,
  protocolVersion?: string,
  mimeType = "application/json"
): Response {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return rpcResult(
    id,
    {
      content: [{ type: "text", text, mimeType }]
    },
    protocolVersion
  );
}
