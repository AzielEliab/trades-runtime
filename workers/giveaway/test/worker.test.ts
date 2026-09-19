import { describe, expect, it } from "vitest";
import type { FleetStats } from "../src/counters.js";
import { AUTHOR, COMPATIBLE_AI_CLIENTS, VERSION } from "../src/identity.js";
import { handleRequest } from "../src/index.js";
import { isGzipTarball } from "../src/release.js";
import { gzipBytes, makeEnv, MemoryKV, requestWithCf } from "./helpers.js";

const origin = "https://trades-runtime.vibelock.workers.dev";

async function hit(env: ReturnType<typeof makeEnv>, path: string, init?: RequestInit): Promise<Response> {
  return handleRequest(new Request(`${origin}${path}`, init), env);
}

function counterFields(stats: FleetStats) {
  return {
    views: stats.views,
    downloads: stats.downloads,
    total: stats.total,
    views_human: stats.views_human,
    views_bot: stats.views_bot,
    downloads_human: stats.downloads_human,
    downloads_bot: stats.downloads_bot,
    human: stats.human,
    bot: stats.bot
  };
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
    expect(html).toContain("local-first software you run on your own machine");
    expect(html).toContain("live_backends false");
    expect(html).toContain("/download");

    const stats = await (await hit(env, "/v1/stats")).json() as FleetStats;
    expect(stats.views).toBe(1);
    expect(stats.downloads).toBe(0);
    expect(stats.total).toBe(0);
    expect(stats.views_human).toBe(1);
    expect(stats.views_bot).toBe(0);
    expect(stats.views).toBe(stats.views_human + stats.views_bot);
    expect(stats.downloads).toBe(stats.downloads_human + stats.downloads_bot);
    expect(stats.note).toMatch(/200 responses only/);
    expect(stats.note).toMatch(/views_human\/views_bot/);
    expect(stats.classification.note).toMatch(/Author Aziel Eliab/);
    expect(stats.project).toBe("trades-runtime");
    expect(stats.classification.bot_score_threshold).toBe(30);
    expect(stats.classification.method).toBe("ua+healthcheck");

    await hit(env, "/");
    const again = await (await hit(env, "/stats")).json() as { views: number };
    expect(again.views).toBe(2);
  });

  it("does not count health, stats, cite, or health-check bots as views", async () => {
    const kv = new MemoryKV();
    const env = makeEnv({ kv });
    expect((await hit(env, "/v1/health")).status).toBe(200);
    expect((await hit(env, "/v1/stats")).status).toBe(200);
    expect((await hit(env, "/count")).status).toBe(200);
    expect((await hit(env, "/cite.json")).status).toBe(200);
    expect((await hit(env, "/llms.txt")).status).toBe(200);
    expect((await hit(env, "/ai.txt")).status).toBe(200);
    expect((await hit(env, "/humans.txt")).status).toBe(200);
    expect((await hit(env, "/robots.txt")).status).toBe(200);
    expect((await hit(env, "/sitemap.xml")).status).toBe(200);
    expect((await hit(env, "/person.jsonld")).status).toBe(200);
    expect((await hit(env, "/graph.jsonld")).status).toBe(200);
    expect((await hit(env, "/.well-known/mcp.json")).status).toBe(200);
    expect((await hit(env, "/openapi.json")).status).toBe(200);
    expect((await hit(env, "/v1/skill")).status).toBe(200);
    expect((await hit(env, "/", { headers: { "User-Agent": "kube-probe/1.0" } })).status).toBe(200);
    expect((await hit(env, "/download", { method: "HEAD" })).status).toBe(200);
    const stats = await (await hit(env, "/v1/stats")).json() as FleetStats;
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
    expect(download.headers.get("Content-Disposition")).toContain("trades-runtime-0.3.4.tgz");
    const stats = await (await hit(env, "/v1/stats")).json() as FleetStats;
    expect(stats.downloads).toBe(1);
    expect(stats.downloads_human).toBe(1);
    expect(stats.downloads_bot).toBe(0);
    expect(stats.total).toBe(1);
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
      pages: string;
      person_id: string;
      sameAs: string[];
      keywords: string[];
      how_to_cite: string;
      compatible_ai_clients: string[];
      honesty: string;
      not?: unknown;
    };
    expect(cite.identity).toBe(AUTHOR);
    expect(cite.version).toBe(VERSION);
    expect(cite.live_backends).toBe(false);
    expect(cite.pages).toBe("off");
    expect(cite.person_id).toBe("https://www.azieleliab.com/#aziel");
    expect(cite.sameAs).toContain("https://github.com/AzielEliab/trades-runtime");
    expect(cite.sameAs).toContain("https://www.azielcorpuslibrary.net/software");
    expect(cite.sameAs).not.toContain("https://glama.ai");
    expect(cite.keywords.join(" ")).toMatch(/trades-runtime/);
    expect(cite.keywords.join(" ")).toMatch(/HVAC/);
    expect(cite.how_to_cite).toMatch(/Eliab, Aziel/);
    expect(cite.compatible_ai_clients).toEqual([...COMPATIBLE_AI_CLIENTS]);
    expect(cite.honesty).toMatch(/Local-first BYO runtime/);
    expect(cite.not).toBeUndefined();
    expect(JSON.stringify(cite)).not.toMatch(/Not aziel-runtime/);
    expect(JSON.stringify(cite)).not.toMatch(/Not a FragGate/);
    expect(JSON.stringify(cite)).not.toMatch(/Zenodo/);

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

    const stats = await (await hit(env, "/v1/stats")).json() as FleetStats;
    expect(stats.views).toBe(0);
    expect(stats.downloads).toBe(0);
  });

  it("does not bump views for health-check UA, bots increment views_bot, humans increment views_human", async () => {
    const kv = new MemoryKV();
    const env = makeEnv({ kv });
    expect((await hit(env, "/", { headers: { "User-Agent": "GoogleHC/1.0" } })).status).toBe(200);
    expect((await hit(env, "/", { headers: { "User-Agent": "GPTBot/1.0" } })).status).toBe(200);
    expect((await hit(env, "/", { headers: { "User-Agent": "Mozilla/5.0" } })).status).toBe(200);
    const stats = (await (await hit(env, "/v1/stats")).json()) as FleetStats;
    expect(stats.views).toBe(2);
    expect(stats.views_human).toBe(1);
    expect(stats.views_bot).toBe(1);
    expect(stats.views).toBe(stats.views_human + stats.views_bot);
  });

  it("treats cf.botManagement verifiedBot and low score as bot views", async () => {
    const kv = new MemoryKV();
    const env = makeEnv({ kv });
    const verified = requestWithCf(`${origin}/`, { headers: { "User-Agent": "Mozilla/5.0" } }, { verifiedBot: true, score: 99 });
    expect((await handleRequest(verified, env)).status).toBe(200);
    const low = requestWithCf(`${origin}/`, { headers: { "User-Agent": "Mozilla/5.0" } }, { verifiedBot: false, score: 1 });
    expect((await handleRequest(low, env)).status).toBe(200);
    const human = requestWithCf(`${origin}/`, { headers: { "User-Agent": "Mozilla/5.0" } }, { verifiedBot: false, score: 95 });
    expect((await handleRequest(human, env)).status).toBe(200);
    const stats = (await handleRequest(requestWithCf(`${origin}/v1/stats`, undefined, { verifiedBot: false, score: 95 }), env)).json();
    const body = (await stats) as FleetStats;
    expect(body.views).toBe(3);
    expect(body.views_bot).toBe(2);
    expect(body.views_human).toBe(1);
    expect(body.views).toBe(body.views_human + body.views_bot);
    expect(body.classification.method).toBe("cf.botManagement+ua");
    expect(body.classification.bot_score_threshold).toBe(30);
  });

  it("serves /count with the same counter fields as /v1/stats", async () => {
    const kv = new MemoryKV();
    const env = makeEnv({ kv });
    await hit(env, "/", { headers: { "User-Agent": "Mozilla/5.0" } });
    await hit(env, "/", { headers: { "User-Agent": "bingbot" } });
    const v1 = (await (await hit(env, "/v1/stats")).json()) as FleetStats;
    const count = (await (await hit(env, "/count")).json()) as FleetStats;
    const alias = (await (await hit(env, "/stats")).json()) as FleetStats;
    expect(counterFields(count)).toEqual(counterFields(v1));
    expect(counterFields(alias)).toEqual(counterFields(v1));
    expect(v1.views).toBe(v1.views_human + v1.views_bot);
    expect(v1.downloads).toBe(v1.downloads_human + v1.downloads_bot);
  });

  it("serves Growth-ON crawl routes with 200 and key strings", async () => {
    const env = makeEnv();
    const robots = await (await hit(env, "/robots.txt")).text();
    expect(robots).toMatch(/User-agent: \*/);
    expect(robots).toMatch(/Allow: \//);
    expect(robots).toMatch(/Content-Signal: search=yes, ai-input=yes, ai-train=yes/);
    expect(robots).toMatch(/HVAC, plumbing, electrical, sewer/);
    expect(robots).toMatch(/User-agent: GPTBot/);
    expect(robots).toMatch(/User-agent: Google-Extended/);
    expect(robots).toMatch(/User-agent: Googlebot/);
    expect(robots).toMatch(/User-agent: ClaudeBot/);
    expect(robots).toMatch(/User-agent: PerplexityBot/);
    expect(robots).toMatch(/User-agent: OAI-SearchBot/);
    expect(robots).toMatch(/User-agent: Meta-ExternalAgent/);
    expect(robots).toMatch(/User-agent: Applebot-Extended/);
    expect(robots).toMatch(/User-agent: DuckAssistBot/);
    expect(robots).toMatch(/User-agent: NeevaBot/);
    expect(robots).toMatch(/Sitemap: https:\/\/trades-runtime\.vibelock\.workers\.dev\/sitemap\.xml/);
    expect(robots).not.toMatch(/Disallow:/);

    const sitemap = await (await hit(env, "/sitemap.xml")).text();
    for (const path of [
      "/",
      "/download",
      "/cite.json",
      "/llms.txt",
      "/ai.txt",
      "/humans.txt",
      "/openapi.json",
      "/robots.txt",
      "/v1/health",
      "/v1/stats",
      "/count",
      "/v1/skill",
      "/mcp",
      "/.well-known/mcp.json",
      "/person.jsonld",
      "/graph.jsonld"
    ]) {
      expect(sitemap).toContain(`https://trades-runtime.vibelock.workers.dev${path === "/" ? "/" : path}`);
    }
    expect((await hit(env, "/sitemap-index.xml")).status).toBe(404);

    const ai = await (await hit(env, "/ai.txt")).text();
    expect(ai).toMatch(/HVAC/);
    expect(ai).toMatch(/live_backends: false/);
    expect(ai).toMatch(/https:\/\/www\.azieleliab\.com\/#aziel/);
    expect(ai).toMatch(/local-first TypeScript runtime/);
    expect(ai).toMatch(/POST /);
    expect(ai).toContain("/mcp");
    expect(ai).not.toMatch(/What this is not/i);
    expect(ai).not.toMatch(/Not aziel-runtime/);
    expect(ai).not.toMatch(/Not a FragGate/);
    expect(ai).not.toMatch(/Zenodo/);
    expect(ai).not.toMatch(/blocked from/i);
    expect(ai).not.toMatch(/node-meshed orchestration suite of MCP-connected software/);

    const humans = await (await hit(env, "/humans.txt")).text();
    expect(humans).toContain("Aziel Eliab");
    expect(humans).toContain("/download");
    expect(humans).toContain(AUTHOR);

    const person = await (await hit(env, "/person.jsonld")).json() as {
      "@id": string;
      disambiguatingDescription: string;
    };
    expect(person["@id"]).toBe("https://www.azieleliab.com/#aziel");
    expect(person.disambiguatingDescription).toMatch(/1 Chronicles 15:20/);

    const graph = await (await hit(env, "/graph.jsonld")).json() as {
      "@graph": Array<{ "@type": string }>;
    };
    const types = graph["@graph"].map((node) => node["@type"]);
    expect(types).toContain("Person");
    expect(types).toContain("SoftwareApplication");
    expect(types).toContain("WebSite");

    const mcp = await (await hit(env, "/.well-known/mcp.json")).json() as {
      mcpServers: { "trades-runtime": { url: string; type: string } };
      openapi: string;
      person_id: string;
    };
    expect(mcp.mcpServers["trades-runtime"].url).toBe("https://trades-runtime.vibelock.workers.dev/mcp");
    expect(mcp.openapi).toBe("https://trades-runtime.vibelock.workers.dev/openapi.json");
    expect(mcp.person_id).toBe("https://www.azieleliab.com/#aziel");

    const home = await (await hit(env, "/")).text();
    expect(home).toContain("og:title");
    expect(home).toContain("Trades-Runtime by Aziel Eliab");
    expect(home).toContain("application/ld+json");
    expect(home).toContain("local-first software you run on your own machine");
    expect(home).not.toMatch(/Not a FragGate/);
    expect(home).toMatch(/1 Chronicles 15:20/);
    const visible = home.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "");
    expect(visible).not.toMatch(/1 Chronicles/);
    expect(visible).not.toMatch(/15:20/);

    const llms = await (await hit(env, "/llms.txt")).text();
    expect(llms).toContain("/ai.txt");
    expect(llms).toContain("sitemap.xml");
    expect(llms).toContain("robots.txt");
    expect(llms).toContain("azielcorpuslibrary.net/software");
    expect(llms).toContain("POST ");
    expect(llms).toContain("/mcp");
    expect(llms).toContain("live_backends false");
    expect(llms).toContain("local BYO runtime");
    expect(llms).not.toMatch(/^## Not$/m);
    expect(llms).not.toMatch(/Not aziel-runtime/);
    expect(llms).not.toMatch(/Not a FragGate/);
    expect(llms).not.toMatch(/Zenodo/);
    expect(llms).not.toMatch(/blocked from/i);

    const stats = await (await hit(env, "/v1/stats")).json() as { views: number; downloads: number };
    expect(stats.views).toBe(1);
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
