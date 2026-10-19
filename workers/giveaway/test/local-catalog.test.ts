import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/index.js";
import { LOCAL_MODULES, LOCAL_PLATFORM_PEERS } from "../src/local-catalog.js";
import { makeEnv } from "./helpers.js";

const origin = "https://trades-runtime.vibelock.workers.dev";
const hit = (env: ReturnType<typeof makeEnv>, path: string, init?: RequestInit) => handleRequest(new Request(`${origin}${path}`, init), env);

describe("read-only tools describe the local package's modules and platform peers", () => {
  it("cite.json carries local_package with modules and 17 platform peers, none running here", async () => {
    const env = makeEnv();
    const cite = (await (await hit(env, "/cite.json")).json()) as {
      live_backends: boolean;
      local_package: { runs_here: boolean; note: string; modules: Array<{ slug: string }>; platform_peers: Array<{ kind: string; mode: string; mappingConfidence: string }> };
    };
    expect(cite.live_backends).toBe(false);
    expect(cite.local_package.runs_here).toBe(false);
    expect(cite.local_package.note).toMatch(/Not tested against a live tenant/);
    expect(cite.local_package.modules.map((m) => m.slug)).toEqual(["refrigerant-log", "permits-board", "agreements-board", "warranty-claims", "truck-stock-tomorrow", "callback-root-cause"]);
    expect(cite.local_package.platform_peers).toHaveLength(17);
    const kickserv = cite.local_package.platform_peers.find((p) => p.kind === "kickserv")!;
    expect(kickserv).toMatchObject({ mode: "file-drop+read-pull", mappingConfidence: "partial" });
    for (const peer of cite.local_package.platform_peers) expect(["documented", "partial", "guessed"]).toContain(peer.mappingConfidence);
  });

  it("skill, llms.txt, and MCP tool descriptions name the modules and peers, read-only", async () => {
    const env = makeEnv();
    const skill = await (await hit(env, "/v1/skill")).text();
    for (const peer of LOCAL_PLATFORM_PEERS) expect(skill).toContain(peer.label);
    for (const mod of LOCAL_MODULES) expect(skill).toContain(mod.slug);
    expect(skill).toContain("not on this Worker");
    const llms = await (await hit(env, "/llms.txt")).text();
    expect(llms).toContain("mapping guessed");
    const listed = await hit(env, "/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    const tools = ((await listed.json()) as { result: { tools: Array<{ name: string; description: string }> } }).result.tools;
    expect(tools.map((t) => t.name)).toEqual(["trades_runtime_health", "trades_runtime_stats", "trades_runtime_cite", "trades_runtime_skill"]);
    const cite = tools.find((t) => t.name === "trades_runtime_cite")!;
    expect(cite.description).toMatch(/Read-only/);
    expect(cite.description).toMatch(/Successware/);
    expect(cite.description).toMatch(/mappingConfidence/);
    expect(tools.find((t) => t.name === "trades_runtime_skill")!.description).toMatch(/mapping confidence/);
  });
});
