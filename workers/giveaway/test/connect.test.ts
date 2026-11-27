import { describe, expect, it } from "vitest";
import {
  MCP_URL,
  OPENAPI_URL,
  cursorInstallDocument,
  cursorInstallLink,
  lmStudioInstallDocument,
  mcpJsonDocument,
  oauthProtectedResource,
  serverCard,
  vscodeInstallDocument,
  vscodeInstallLink
} from "../src/connect.js";
import { handleRequest } from "../src/index.js";
import {
  DEFAULT_PROTOCOL_VERSION,
  LATEST_PROTOCOL_VERSION,
  PROTOCOL_VERSIONS
} from "../src/mcp.js";
import { makeEnv, MemoryKV } from "./helpers.js";

const origin = "https://trades-runtime.vibelock.workers.dev";
const TOOLS = [
  "trades_runtime_health",
  "trades_runtime_stats",
  "trades_runtime_cite",
  "trades_runtime_skill"
] as const;

function hit(env: ReturnType<typeof makeEnv>, path: string, init?: RequestInit): Promise<Response> {
  return handleRequest(new Request(`${origin}${path}`, init), env);
}

function rpc(method: string, id: number, params?: Record<string, unknown>, header?: string): RequestInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (header) headers["mcp-protocol-version"] = header;
  return {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} })
  };
}

describe("public MCP connect", () => {
  it("echoes 2025-11-25 when requested and keeps older protocol versions", async () => {
    const env = makeEnv();
    for (const version of PROTOCOL_VERSIONS) {
      const res = await hit(env, "/mcp", rpc("initialize", 1, { protocolVersion: version }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { result: { protocolVersion: string } };
      expect(body.result.protocolVersion).toBe(version);
      expect(res.headers.get("mcp-protocol-version")).toBe(version);
    }

    const omitted = await hit(env, "/mcp", rpc("initialize", 2));
    const omittedBody = (await omitted.json()) as { result: { protocolVersion: string } };
    expect(omittedBody.result.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);

    const headerOnly = await hit(env, "/mcp", rpc("initialize", 3, {}, "2025-06-18"));
    const headerBody = (await headerOnly.json()) as { result: { protocolVersion: string } };
    expect(headerBody.result.protocolVersion).toBe("2025-06-18");

    const newer = await hit(env, "/mcp", rpc("initialize", 4, { protocolVersion: "2026-07-28" }));
    const newerBody = (await newer.json()) as { result: { protocolVersion: string } };
    expect(newer.status).toBe(200);
    expect(newerBody.result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
    expect(LATEST_PROTOCOL_VERSION).toBe("2025-11-25");
  });

  it("rejects an unsupported MCP-Protocol-Version on requests after initialize", async () => {
    const env = makeEnv();
    const bad = await hit(env, "/mcp", rpc("tools/list", 9, {}, "1999-01-01"));
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: { code: number; message: string } };
    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toMatch(/1999-01-01/);
    expect(body.error.message).toMatch(/2025-11-25/);

    const ok = await hit(env, "/mcp", rpc("tools/list", 10, {}, "2025-11-25"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("mcp-protocol-version")).toBe("2025-11-25");
  });

  it("marks all four tools readOnlyHint and does not write", async () => {
    const kv = new MemoryKV();
    const env = makeEnv({ kv });
    const listed = await hit(env, "/mcp", rpc("tools/list", 1));
    const payload = (await listed.json()) as {
      result: {
        tools: Array<{
          name: string;
          annotations: { readOnlyHint: boolean; destructiveHint: boolean };
        }>;
      };
    };
    expect(payload.result.tools.map((tool) => tool.name)).toEqual([...TOOLS]);
    for (const tool of payload.result.tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
    }

    for (const name of TOOLS) {
      const called = await hit(env, "/mcp", rpc("tools/call", 2, { name, arguments: {} }));
      expect(called.status).toBe(200);
      const body = (await called.json()) as { result: { content: Array<{ type: string; text: string }> } };
      expect(body.result.content[0]?.type).toBe("text");
      expect(body.result.content[0]?.text.length).toBeGreaterThan(0);
    }

    expect(kv.store.size).toBe(0);
    const stats = (await (await hit(env, "/v1/stats")).json()) as { views: number; downloads: number };
    expect(stats.views).toBe(0);
    expect(stats.downloads).toBe(0);
  });

  it("allows the MCP CORS headers and exposes Mcp-Session-Id", async () => {
    const env = makeEnv();
    const preflight = await hit(env, "/mcp", {
      method: "OPTIONS",
      headers: {
        Origin: "https://claude.ai",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, MCP-Protocol-Version, Authorization"
      }
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "Accept, Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Authorization"
    );
    expect(preflight.headers.get("access-control-expose-headers")).toBe("Mcp-Session-Id");
    expect(preflight.headers.get("access-control-allow-methods")).toMatch(/POST/);

    const posted = await hit(env, "/mcp", rpc("ping", 1));
    expect(posted.headers.get("access-control-allow-origin")).toBe("*");
    expect(posted.headers.get("access-control-expose-headers")).toBe("Mcp-Session-Id");
  });

  it("serves /connect with copy buttons and per-client steps without counting a view", async () => {
    const kv = new MemoryKV();
    const env = makeEnv({ kv });
    const page = await hit(env, "/connect");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toMatch(/^text\/html/);
    const html = await page.text();

    expect(html).toContain(`data-copy="${MCP_URL}"`);
    expect(html).toContain(`data-copy="${OPENAPI_URL}"`);
    expect(html).toContain("Copy MCP URL");
    expect(html).toContain("Copy OpenAPI URL");
    expect(html).toContain("Plugins → Add custom MCP server → No authentication.");
    expect(html).toContain("Connectors → Add custom connector.");
    expect(html).toContain("https://grok.com/connectors");
    expect(html).toContain("grok.com/connectors");
    expect(html).toContain("AI Studio, Enterprise, and CLI only.");
    expect(html).toContain(cursorInstallLink().replaceAll("&", "&amp;"));
    expect(html).toContain(vscodeInstallLink());
    expect(html).toContain("vscode:mcp/install?");
    expect(html).toContain("LM Studio");
    expect(html).toContain(MCP_URL);
    expect(html).toContain('href="/install/cursor.json"');
    expect(html).toContain('href="/install/vscode.json"');
    expect(html).toContain('href="/install/claude-desktop.json"');
    expect(html).toContain("authorization_servers: []");
    expect(html).toContain('content="width=device-width, initial-scale=1, viewport-fit=cover"');
    expect(html).toContain("min-height: 44px");
    expect(html).not.toMatch(/\bverified\b/i);

    const cursorConfig = new URL(cursorInstallLink()).searchParams.get("config");
    expect(JSON.parse(atob(cursorConfig || ""))).toEqual({ url: MCP_URL });
    const vscodeJson = JSON.parse(decodeURIComponent(vscodeInstallLink().slice("vscode:mcp/install?".length))) as {
      name: string;
      type: string;
      url: string;
    };
    expect(vscodeJson).toEqual({ name: "trades-runtime", type: "http", url: MCP_URL });

    const head = await hit(env, "/connect", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await hit(env, "/connect", { method: "POST" })).status).toBe(405);

    const stats = (await (await hit(env, "/v1/stats")).json()) as { views: number; downloads: number };
    expect(stats.views).toBe(0);
    expect(stats.downloads).toBe(0);
    expect(kv.store.size).toBe(0);
  });

  it("publishes install documents, the server card, and empty OAuth servers", async () => {
    const env = makeEnv();
    expect(await (await hit(env, "/install/cursor.json")).json()).toEqual(cursorInstallDocument());
    expect(await (await hit(env, "/install/vscode.json")).json()).toEqual(vscodeInstallDocument());
    expect(((await (await hit(env, "/install/claude-desktop.json")).json()) as { mcpServers: Record<string, { url: string }> }).mcpServers["trades-runtime"]?.url).toBe(MCP_URL);
    expect(await (await hit(env, "/mcp.json")).json()).toEqual(mcpJsonDocument());
    expect(lmStudioInstallDocument().mcpServers["trades-runtime"]?.url).toBe(MCP_URL);

    const cardRes = await hit(env, "/.well-known/mcp/server-card.json");
    expect(cardRes.status).toBe(200);
    expect(cardRes.headers.get("content-type")).toMatch(/application\/mcp-server-card\+json/);
    expect(await cardRes.json()).toEqual(serverCard());
    const card = serverCard();
    expect(card.name).toBe("com.azieleliab/trades-runtime");
    expect(card.$schema).toBe("https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json");
    const remotes = card.remotes as Array<{ type: string; url: string; supportedProtocolVersions: string[] }>;
    expect(remotes[0]?.type).toBe("streamable-http");
    expect(remotes[0]?.url).toBe(MCP_URL);
    expect(remotes[0]?.supportedProtocolVersions[0]).toBe("2025-11-25");
    expect(remotes[0]?.supportedProtocolVersions).toContain("2024-11-05");

    const oauth = await hit(env, "/.well-known/oauth-protected-resource");
    expect(oauth.status).toBe(200);
    expect(await oauth.json()).toEqual(oauthProtectedResource());
    const oauthBody = oauthProtectedResource();
    expect(oauthBody.authorization_servers).toEqual([]);
    expect(oauthBody.resource).toBe(MCP_URL);
    expect(await (await hit(env, "/.well-known/oauth-protected-resource/mcp")).json()).toEqual(oauthBody);

    const home = await (await hit(makeEnv(), "/")).text();
    expect(home).toContain('href="/connect"');
    const llms = await (await hit(env, "/llms.txt")).text();
    expect(llms).toContain(`${origin}/connect`);
    const sitemap = await (await hit(env, "/sitemap.xml")).text();
    expect(sitemap).toContain(`${origin}/connect`);
    expect(sitemap).toContain(`${origin}/.well-known/mcp/server-card.json`);
    expect(sitemap).toContain(`${origin}/.well-known/oauth-protected-resource`);
  });
});
