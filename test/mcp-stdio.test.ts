import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUNTIME_URL,
  DEFAULT_UA,
  ReadBuffer,
  createBridgeContext,
  dispatchMcp,
  mcpRequestHeaders,
  serializeMessage
} from "../cli/mcp-stdio.mjs";

describe("stdio MCP bridge", () => {
  it("parses newline-delimited JSON-RPC and Content-Length frames", () => {
    const nd = new ReadBuffer();
    nd.append('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    expect(nd.readMessage()).toEqual({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(nd.readMessage()).toBeNull();

    const body = '{"jsonrpc":"2.0","id":2,"method":"tools/list"}';
    const framed = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    const cl = new ReadBuffer();
    cl.append(framed);
    expect(cl.readMessage()).toEqual({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  });

  it("sends Mozilla/5.0 to the Worker /mcp URL", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const ctx = createBridgeContext({
      fetchImpl: async (url, init) => {
        seen.url = String(url);
        seen.init = init;
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { tools: [{ name: "trades_runtime_health" }] }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    });
    const out = await dispatchMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
    expect(seen.url).toBe(`${DEFAULT_RUNTIME_URL}/mcp`);
    expect(seen.init?.method).toBe("POST");
    const headers = seen.init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(DEFAULT_UA);
    expect(headers["User-Agent"]).toBe("Mozilla/5.0");
    expect(mcpRequestHeaders(ctx)["User-Agent"]).toBe("Mozilla/5.0");
    expect(out).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "trades_runtime_health" }] }
    });
  });

  it("serializes stdout as newline-delimited JSON", () => {
    expect(serializeMessage({ jsonrpc: "2.0", id: 1, result: {} })).toBe(
      '{"jsonrpc":"2.0","id":1,"result":{}}\n'
    );
  });

  it("bridges initialize + tools/list through the live Worker", async () => {
    const child = spawn("node", ["cli/mcp-stdio.mjs"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));

    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "trades-runtime-test", version: "0.3.3" }
      }
    };
    const list = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
    child.stdin?.write(JSON.stringify(initialize) + "\n");
    child.stdin?.write(JSON.stringify(list) + "\n");
    child.stdin?.end();

    const exit = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("stdio MCP live bridge timed out"));
      }, 20000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code ?? 1);
      });
    });

    expect(exit).toBe(0);
    const text = Buffer.concat(stdout).toString("utf8").trim();
    const lines = text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
      id?: number;
      result?: { serverInfo?: { name?: string; version?: string }; tools?: { name: string }[] };
      error?: unknown;
    });
    expect(lines.some((line) => line.error)).toBe(false);
    const init = lines.find((line) => line.id === 1);
    const tools = lines.find((line) => line.id === 2);
    expect(init?.result?.serverInfo?.name).toBe("trades-runtime");
    expect(init?.result?.serverInfo?.version).toBe("0.3.4");
    const names = (tools?.result?.tools ?? []).map((tool) => tool.name).sort();
    expect(names).toEqual([
      "trades_runtime_cite",
      "trades_runtime_health",
      "trades_runtime_skill",
      "trades_runtime_stats"
    ]);
    expect(Buffer.concat(stderr).toString("utf8")).toMatch(/trades-runtime-mcp bridge/);
  });
});
