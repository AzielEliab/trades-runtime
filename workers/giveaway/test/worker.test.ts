import { describe, expect, it } from "vitest";
import { AUTHOR, COMPATIBLE_AI_CLIENTS, VERSION } from "../src/identity.js";
import { handleRequest } from "../src/index.js";
import { isGzipTarball } from "../src/release.js";
import { gzipBytes, makeEnv, MemoryKV } from "./helpers.js";

const origin = "https://trades-runtime.vibelock.workers.dev";

async function hit(env: ReturnType<typeof makeEnv>, path: string, init?: RequestInit): Promise<Response> {
  return handleRequest(new Request(`${origin}${path}`, init), env);
}

describe("giveaway Worker routes", () => {
  it("serves landing HTML and increments views once per 200", async () => {
    const kv = new MemoryKV();
    const env = makeEnv({ kv });
    const first = await hit(env, "/");
    expect(first.status).toBe(200);
    const html = await first.text();
    expect(html).toContain("Trades-Runtime");
    expect(html).toContain(AUTHOR);
    expect(html).toContain("BYO");
    expect(html).toContain("not</strong> a hosted multi-tenant company OS");
    expect(html).toContain("live_backends false");
    expect(html).toContain("/download");

    const stats = await (await hit(env, "/v1/stats")).json() as { views: number; downloads: number; note: string };
    expect(stats.views).toBe(1);
    expect(stats.downloads).toBe(0);
    expect(stats.note).toMatch(/200 responses only/);

    await hit(env, "/");
    const again = await (await hit(env, "/stats")).json() as { views: number };
    expect(again.views).toBe(2);
  });

  it("does not count health, stats, cite, or health-check bots as views", async () => {
    const kv = new MemoryKV();
    const env = makeEnv({ kv });
    expect((await hit(env, "/v1/health")).status).toBe(200);
    expect((await hit(env, "/v1/stats")).status).toBe(200);
    expect((await hit(env, "/cite.json")).status).toBe(200);
    expect((await hit(env, "/llms.txt")).status).toBe(200);
    expect((await hit(env, "/robots.txt")).status).toBe(200);
    expect((await hit(env, "/openapi.json")).status).toBe(200);
    expect((await hit(env, "/v1/skill")).status).toBe(200);
    expect((await hit(env, "/", { headers: { "User-Agent": "kube-probe/1.0" } })).status).toBe(200);
    const stats = await (await hit(env, "/v1/stats")).json() as { views: number; downloads: number };
    expect(stats.views).toBe(0);
    expect(stats.downloads).toBe(0);
  });

  it("increments downloads only after a verified gzip 200", async () => {
    const kv = new MemoryKV();
    const env = makeEnv({ kv });
    const download = await hit(env, "/download");
    expect(download.status).toBe(200);
    const bytes = await download.arrayBuffer();
    expect(isGzipTarball(bytes)).toBe(true);
    expect(download.headers.get("Content-Disposition")).toContain("trades-runtime-0.3.3.tgz");
    const stats = await (await hit(env, "/v1/stats")).json() as { views: number; downloads: number };
    expect(stats.downloads).toBe(1);
    expect(stats.views).toBe(0);
  });

  it("does not increment downloads when the tarball is missing or not gzip", async () => {
    const missing = makeEnv({ release: null });
    const missingRes = await hit(missing, "/download");
    expect(missingRes.status).toBe(503);
    expect(((await missingRes.json()) as { note: string }).note).toMatch(/not incremented/);
    expect(((await (await hit(missing, "/v1/stats")).json()) as { downloads: number }).downloads).toBe(0);

    const bogusBytes = Uint8Array.from([0x6e, 0x6f, 0x74, 0x2d, 0x67, 0x7a]);
    const bogus = makeEnv({ release: bogusBytes.buffer.slice(bogusBytes.byteOffset, bogusBytes.byteOffset + bogusBytes.byteLength) });
    const bogusRes = await hit(bogus, "/download");
    expect(bogusRes.status).toBe(503);
    expect(((await (await hit(bogus, "/v1/stats")).json()) as { downloads: number }).downloads).toBe(0);
    expect(isGzipTarball(gzipBytes())).toBe(true);
  });

  it("exposes cite, OpenAPI clients, and read-only MCP without counting", async () => {
    const env = makeEnv();
    const cite = await (await hit(env, "/cite.json")).json() as {
      identity: string;
      version: string;
      live_backends: boolean;
      compatible_ai_clients: string[];
    };
    expect(cite.identity).toBe(AUTHOR);
    expect(cite.version).toBe(VERSION);
    expect(cite.live_backends).toBe(false);
    expect(cite.compatible_ai_clients).toEqual([...COMPATIBLE_AI_CLIENTS]);

    const openapi = await (await hit(env, "/openapi.json")).json() as {
      info: { "x-compatible-ai-clients": string[] };
    };
    expect(openapi.info["x-compatible-ai-clients"].length).toBeGreaterThan(10);

    const listed = await hit(env, "/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    const payload = (await listed.json()) as { result: { tools: Array<{ name: string }> } };
    expect(payload.result.tools.map((tool) => tool.name)).toContain("trades_runtime_stats");

    const stats = await (await hit(env, "/v1/stats")).json() as { views: number; downloads: number };
    expect(stats.views).toBe(0);
    expect(stats.downloads).toBe(0);
  });

  it("refuses unknown routes and does not claim ST write-back", async () => {
    const env = makeEnv();
    expect((await hit(env, "/v1/servicetitan/write")).status).toBe(404);
    const health = await (await hit(env, "/v1/health")).json() as {
      servicetitan_write: boolean;
      probooks_write: boolean;
      hosted_company_os: boolean;
    };
    expect(health.servicetitan_write).toBe(false);
    expect(health.probooks_write).toBe(false);
    expect(health.hosted_company_os).toBe(false);
  });
});
