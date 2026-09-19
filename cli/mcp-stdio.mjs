#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * trades-runtime stdio MCP — Glama / Claude Desktop / Cursor entrypoint.
 *
 *   node cli/mcp-stdio.mjs
 *   npm run mcp
 *
 * Bridges stdin/stdout JSON-RPC to POST $TRADES_RUNTIME_URL/mcp
 * (default https://trades-runtime.vibelock.workers.dev/mcp).
 * User-Agent is Mozilla/5.0. Logs go to stderr. Stdout is MCP only.
 *
 * This is a remote-bridge stdio adapter, not a hosted company OS and
 * not a FragGate true-engine. live_backends remains false on the Worker.
 *
 * Author: Aziel Eliab. Identity is Aziel Eliab only.
 */

export const DEFAULT_RUNTIME_URL = "https://trades-runtime.vibelock.workers.dev";
export const DEFAULT_UA = "Mozilla/5.0";
export const PROTOCOL = "2024-11-05";

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const INTERNAL_ERROR = -32603;
const UPSTREAM_ERROR = -32000;

export function resolveRuntimeUrl(flags = {}, env = process.env) {
  const raw = (flags.url || env.TRADES_RUNTIME_URL || DEFAULT_RUNTIME_URL).trim();
  return raw.replace(/\/$/, "");
}

export function parseCliArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--url") flags.url = argv[++i];
    else if (a.startsWith("--")) flags[a.slice(2)] = argv[++i] ?? true;
    else rest.push(a);
  }
  return { flags, rest };
}

export function usage() {
  return `trades-runtime-mcp — stdio MCP (Aziel Eliab)

Glama and Claude Desktop need a stdio process. This CLI speaks MCP
JSON-RPC on stdin/stdout and bridges to the public giveaway Worker.

Usage:
  node cli/mcp-stdio.mjs
  node cli/mcp-stdio.mjs --url https://trades-runtime.vibelock.workers.dev

Env:
  TRADES_RUNTIME_URL                 Worker origin (default ${DEFAULT_RUNTIME_URL})
  TRADES_RUNTIME_MCP_TIMEOUT_MS      upstream timeout (default 30000)

Read-only tools on the Worker: trades_runtime_health, trades_runtime_stats,
trades_runtime_cite, trades_runtime_skill. Not a hosted company OS.
`;
}

export function serializeMessage(message) {
  return JSON.stringify(message) + "\n";
}

export function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id: id === undefined ? null : id, error };
}

export function isNotification(message) {
  return !message || message.id === undefined;
}

/**
 * Buffer stdin chunks into discrete JSON-RPC messages.
 * Accepts official newline-delimited JSON and LSP Content-Length framing.
 */
export class ReadBuffer {
  constructor() {
    this._buf = Buffer.alloc(0);
  }

  append(chunk) {
    const add = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this._buf = this._buf.length ? Buffer.concat([this._buf, add]) : add;
  }

  readMessage() {
    this._trimLeadingSpace();
    if (!this._buf.length) return null;
    const peek = this._buf.toString("utf8", 0, Math.min(this._buf.length, 48)).toLowerCase();
    if (peek.startsWith("content-length:")) return this._readContentLength();
    return this._readNdjson();
  }

  _trimLeadingSpace() {
    let i = 0;
    while (i < this._buf.length) {
      const c = this._buf[i];
      if (c === 0x20 || c === 0x09 || c === 0x0d || c === 0x0a) i++;
      else break;
    }
    if (i) this._buf = this._buf.subarray(i);
  }

  _readNdjson() {
    const idx = this._buf.indexOf(0x0a);
    if (idx === -1) return null;
    const line = this._buf.toString("utf8", 0, idx).replace(/\r$/, "");
    this._buf = this._buf.subarray(idx + 1);
    if (!line.trim()) return this.readMessage();
    return JSON.parse(line);
  }

  _readContentLength() {
    const ascii = this._buf.toString("utf8");
    let sep = ascii.indexOf("\r\n\r\n");
    let sepLen = 4;
    if (sep === -1) {
      sep = ascii.indexOf("\n\n");
      sepLen = 2;
    }
    if (sep === -1) return null;
    const headers = ascii.slice(0, sep);
    const match = headers.match(/content-length:\s*(\d+)/i);
    if (!match) throw new SyntaxError("Content-Length header missing");
    const len = Number(match[1]);
    const bodyStart = sep + sepLen;
    if (this._buf.length < bodyStart + len) return null;
    const body = this._buf.subarray(bodyStart, bodyStart + len).toString("utf8");
    this._buf = this._buf.subarray(bodyStart + len);
    return JSON.parse(body);
  }
}

export function mcpRequestHeaders(ctx) {
  const headers = {
    "User-Agent": DEFAULT_UA,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (ctx.protocolVersion) headers["MCP-Protocol-Version"] = ctx.protocolVersion;
  if (ctx.sessionId) headers["mcp-session-id"] = ctx.sessionId;
  return headers;
}

export function createBridgeContext(options = {}, env = process.env) {
  const flags = options.flags || {};
  return {
    url: resolveRuntimeUrl(flags, env),
    protocolVersion: options.protocolVersion || PROTOCOL,
    sessionId: options.sessionId || "",
    timeoutMs: Number(options.timeoutMs || env.TRADES_RUNTIME_MCP_TIMEOUT_MS || 30000),
    log: options.log || ((line) => process.stderr.write(String(line) + "\n")),
    fetchImpl: options.fetchImpl || globalThis.fetch.bind(globalThis)
  };
}

function rememberSession(res, ctx) {
  if (!res || typeof res.headers?.get !== "function") return;
  const sid = res.headers.get("mcp-session-id");
  if (sid) ctx.sessionId = sid;
  const pv = res.headers.get("MCP-Protocol-Version") || res.headers.get("mcp-protocol-version");
  if (pv) ctx.protocolVersion = pv;
}

function rememberFromMessage(message, ctx) {
  if (message && message.method === "initialize" && message.params && message.params.protocolVersion) {
    ctx.protocolVersion = String(message.params.protocolVersion);
  }
}

function rememberFromRpc(body, ctx) {
  if (body && body.result && body.result.protocolVersion) {
    ctx.protocolVersion = String(body.result.protocolVersion);
  }
}

export async function responseToRpc(res, message, ctx) {
  rememberSession(res, ctx);
  if (!res) {
    if (isNotification(message)) return null;
    return rpcError(message && message.id, UPSTREAM_ERROR, "Upstream MCP returned no response");
  }
  if (res.status === 204 || res.status === 202) return null;
  let text = "";
  try {
    text = await res.text();
  } catch (err) {
    if (isNotification(message)) return null;
    return rpcError(message && message.id, UPSTREAM_ERROR, `Upstream read failed: ${err.message || err}`);
  }
  if (!String(text).trim()) {
    if (isNotification(message) || res.ok) return null;
    return rpcError(message && message.id, UPSTREAM_ERROR, `Upstream HTTP ${res.status}`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    if (isNotification(message)) return null;
    return rpcError(message && message.id, UPSTREAM_ERROR, `Upstream returned non-JSON (HTTP ${res.status})`, {
      snippet: String(text).slice(0, 200)
    });
  }
  rememberFromRpc(body, ctx);
  if (body && typeof body === "object" && (body.jsonrpc || "result" in body || "error" in body)) {
    return body;
  }
  if (!res.ok) {
    if (isNotification(message)) return null;
    const msg = (body && (body.error || body.message)) || `Upstream HTTP ${res.status}`;
    return rpcError(message && message.id, UPSTREAM_ERROR, String(msg));
  }
  return body;
}

export async function sendBridgeHttp(message, ctx) {
  const url = String(ctx.url).replace(/\/$/, "") + "/mcp";
  const headers = mcpRequestHeaders(ctx);
  return ctx.fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(ctx.timeoutMs)
  });
}

export async function dispatchMcp(message, ctx) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(null, INVALID_REQUEST, "Invalid Request");
  }
  rememberFromMessage(message, ctx);
  try {
    const res = await sendBridgeHttp(message, ctx);
    return responseToRpc(res, message, ctx);
  } catch (err) {
    if (isNotification(message)) return null;
    return rpcError(message.id, UPSTREAM_ERROR, `Upstream MCP failed: ${err && err.message ? err.message : err}`);
  }
}

/**
 * Run the stdio loop. stdout = MCP messages only.
 */
export async function runStdioLoop(options = {}) {
  const ctx = options.ctx || createBridgeContext(options);
  const input = options.stdin || process.stdin;
  const output = options.stdout || process.stdout;
  const buf = new ReadBuffer();
  let queue = Promise.resolve();

  function write(msg) {
    if (!msg) return;
    output.write(serializeMessage(msg));
  }

  async function handleOne(message) {
    try {
      write(await dispatchMcp(message, ctx));
    } catch (err) {
      if (!isNotification(message)) {
        write(rpcError(message && message.id, INTERNAL_ERROR, String(err && err.message ? err.message : err)));
      }
    }
  }

  function enqueue(fn) {
    queue = queue.then(fn, fn);
    return queue;
  }

  function drain() {
    return enqueue(async () => {
      for (;;) {
        let message;
        try {
          message = buf.readMessage();
        } catch (err) {
          write(rpcError(null, PARSE_ERROR, "Parse error", { detail: String(err.message || err) }));
          continue;
        }
        if (!message) break;
        await handleOne(message);
      }
    });
  }

  input.on("data", (chunk) => {
    buf.append(chunk);
    drain();
  });

  await new Promise((resolve) => {
    input.on("end", resolve);
    input.on("close", resolve);
    if (input.readableEnded) resolve();
  });
  await queue;
}

export async function main(argv = process.argv.slice(2)) {
  const { flags } = parseCliArgs(argv);
  if (flags.help) {
    process.stderr.write(usage());
    process.exit(0);
  }
  const ctx = createBridgeContext({ flags });
  ctx.log(`trades-runtime-mcp bridge ${ctx.url}/mcp`);
  process.stdin.resume();
  await runStdioLoop({ ctx });
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  main().catch((err) => {
    process.stderr.write(String(err && err.stack ? err.stack : err) + "\n");
    process.exit(1);
  });
}
