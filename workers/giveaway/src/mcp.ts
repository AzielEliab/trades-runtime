import { citeBody, healthBody, skillMarkdown, statsBody } from "./catalog.js";
import type { CountStore } from "./counters.js";
import { readCount } from "./counters.js";
import { AUTHOR, PRODUCT, VERSION } from "./identity.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

const TOOLS = [
  {
    name: "trades_runtime_health",
    description: "Trades-Runtime giveaway health. Read-only. Does not increment counters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "trades_runtime_stats",
    description: "Honest KV view/download counts. Read-only. Does not increment counters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "trades_runtime_cite",
    description: "Public cite.json for Trades-Runtime. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "trades_runtime_skill",
    description: "Agent skill markdown for the public giveaway Worker.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
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
    return rpcResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: PRODUCT, version: VERSION, author: AUTHOR }
    });
  }
  if (body.method === "notifications/initialized" || body.method === "ping") {
    return rpcResult(id, {});
  }
  if (body.method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }
  if (body.method === "tools/call") {
    const name = body.params?.name;
    if (name === "trades_runtime_health") {
      return rpcTool(id, healthBody(releaseReady, releaseBytes));
    }
    if (name === "trades_runtime_stats") {
      return rpcTool(id, statsBody(await readCount(kv, "views"), await readCount(kv, "downloads")));
    }
    if (name === "trades_runtime_cite") {
      return rpcTool(id, citeBody());
    }
    if (name === "trades_runtime_skill") {
      return rpcTool(id, skillMarkdown(), "text/markdown");
    }
    return rpcError(id, -32601, `Unknown tool: ${name ?? ""}`);
  }
  return rpcError(id, -32601, `Unknown method: ${body.method ?? ""}`);
}

function rpcResult(id: string | number | null, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n", {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function rpcError(id: string | number | null, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n", {
    status: 400,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function rpcTool(id: string | number | null, payload: unknown, mimeType = "application/json"): Response {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return rpcResult(id, {
    content: [{ type: "text", text, mimeType }]
  });
}
