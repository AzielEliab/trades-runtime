import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const PRODUCT = "0.3.3";
const IDENTITY = "Aziel Eliab";
const PRODUCT_SURFACES = [
  "README.md",
  "IDENTITY.md",
  "package.json",
  "src/manifest.ts",
  "src/cli.ts",
  "docs/cite.json",
  "docs/v1/runtime.json",
  "docs/llms.txt",
  "docs/index.html",
  "docs/GLAMA.md",
  "glama.json",
  "cli/mcp-stdio.mjs",
  "workers/giveaway/src/identity.ts",
  "workers/giveaway/wrangler.jsonc"
];

describe("TR-AUDIT-2026-09-18B Option C scaffold + identity version lockstep", () => {
  it("keeps package, manifest, and catalog on 0.3.3", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      version: string;
      author: string;
      scripts?: { mcp?: string };
    };
    const runtime = JSON.parse(readFileSync("docs/v1/runtime.json", "utf8")) as {
      version: string;
      runtime_version: string;
      property_intelligence: string;
      live_backends: boolean;
      pages?: string;
      honesty?: string;
      author?: string;
      identity?: string;
      launch_options?: {
        C?: { status: string; software?: string; pilot?: string };
        D?: { status: string };
      };
    };
    const cite = JSON.parse(readFileSync("docs/cite.json", "utf8")) as {
      version: string;
      author: string;
      identity: string;
    };

    expect(pkg.version).toBe(PRODUCT);
    expect(RUNTIME_MANIFEST.version).toBe(PRODUCT);
    expect(runtime.version).toBe(PRODUCT);
    expect(runtime.runtime_version).toBe(PRODUCT);
    expect(runtime.property_intelligence).toBe("1.0");
    expect(cite.version).toBe(PRODUCT);
    expect(runtime.live_backends).toBe(false);
    expect(runtime.pages).toBe("off");
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/BYO local ServiceTitan \+ ProBooks/);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/Credentials local only/);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/Option C code-ready \/ pilot not started/);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/Option D not started/);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/Not a live company pilot/);
    expect(runtime.honesty).toMatch(/BYO local ServiceTitan \+ ProBooks/);
    expect(runtime.honesty).toMatch(/Option C code-ready \/ pilot not started/);
    expect(runtime.honesty).toMatch(/Option D not started/);
    expect(runtime.launch_options?.C?.status).toBe("code-ready-pilot-not-started");
    expect(runtime.launch_options?.C?.software).toBe("code-ready");
    expect(runtime.launch_options?.C?.pilot).toBe("not-started");
    expect(runtime.launch_options?.D?.status).toBe("not-started");
    expect(RUNTIME_MANIFEST.launch_options.C.status).toBe("code-ready-pilot-not-started");
    expect(RUNTIME_MANIFEST.launch_options.D.status).toBe("not-started");
    expect(readFileSync("README.md", "utf8")).toMatch(/\*\*Version:\*\* 0\.3\.3/);
    expect(readFileSync("README.md", "utf8")).toMatch(/TR-BOT-2026-09-17/);
    expect(readFileSync("README.md", "utf8")).toMatch(/TR-BYO-2026-09-17/);
    expect(readFileSync("README.md", "utf8")).toMatch(/TR-AUDIT-2026-09-18C/);
    expect(readFileSync("README.md", "utf8")).toMatch(/TR-AUDIT-2026-09-18B/);
    expect(readFileSync("README.md", "utf8")).toMatch(/trades-runtime\.vibelock\.workers\.dev/);
    expect(readFileSync("README.md", "utf8")).toMatch(/data\/inbound\/servicetitan/);
    expect(readFileSync("README.md", "utf8")).toMatch(/data\/inbound\/probooks/);
    expect(readFileSync("README.md", "utf8")).toMatch(/Option C code-ready \/ pilot not started/);
    expect(readFileSync("README.md", "utf8")).toMatch(/Option D not started/);
    expect(RUNTIME_MANIFEST.modules.some((module) => module.slug === "probooks-shadow")).toBe(true);
    expect(RUNTIME_MANIFEST.modules.some((module) => module.slug === "byo-admit-demo")).toBe(true);
    expect(RUNTIME_MANIFEST.modules.some((module) => module.slug === "engagement-rules")).toBe(true);
    expect(RUNTIME_MANIFEST.modules.some((module) => module.slug === "shadow-branch")).toBe(true);
    expect(RUNTIME_MANIFEST.modules.some((module) => module.slug === "settlement-harness")).toBe(true);
    expect(RUNTIME_MANIFEST.modules.some((module) => module.slug === "shadow-sealed-demo")).toBe(true);
    const workerPkg = JSON.parse(readFileSync("workers/giveaway/package.json", "utf8")) as {
      version: string;
      author: string;
    };
    const workerWrangler = readFileSync("workers/giveaway/wrangler.jsonc", "utf8");
    expect(workerPkg.version).toBe(PRODUCT);
    expect(workerPkg.author).toBe(IDENTITY);
    expect(workerWrangler).toMatch(/"name": "trades-runtime"/);
    expect(workerWrangler).toMatch(/"binding": "COUNTS"/);
    expect(readFileSync("workers/giveaway/src/identity.ts", "utf8")).toMatch(/export const VERSION = "0\.3\.3"/);
    expect(readFileSync("README.md", "utf8")).toMatch(/Public giveaway Worker/);
    expect(readFileSync("README.md", "utf8")).toMatch(/glama\.ai\/mcp\/servers\/AzielEliab\/trades-runtime/);
    expect(readFileSync("README.md", "utf8")).toMatch(/docs\/GLAMA\.md/);
    const glama = JSON.parse(readFileSync("glama.json", "utf8")) as {
      maintainers: string[];
      name: string;
      version: string;
      description: string;
    };
    expect(glama.maintainers).toEqual(["AzielEliab"]);
    expect(glama.version).toBe(PRODUCT);
    expect(glama.name).toMatch(/Trades Runtime/i);
    expect(glama.description).toMatch(/live_backends false/);
    expect(glama.description).toMatch(/Not a hosted company OS/);
    expect(glama.description).toMatch(/Aziel Eliab/);
    expect(pkg.scripts).toMatchObject({ mcp: "node cli/mcp-stdio.mjs" });
    expect(existsSync("cli/mcp-stdio.mjs")).toBe(true);
    expect(existsSync("Dockerfile")).toBe(true);
    expect(existsSync("docs/GLAMA.md")).toBe(true);
    expect(readFileSync("Dockerfile", "utf8")).toMatch(/npm install --omit=dev/);
    expect(readFileSync("Dockerfile", "utf8")).toMatch(/cli\/mcp-stdio\.mjs/);
    expect(readFileSync("Dockerfile", "utf8")).toMatch(/Mozilla\/5\.0|TRADES_RUNTIME_URL/);
    expect(readFileSync("cli/mcp-stdio.mjs", "utf8")).toMatch(/Mozilla\/5\.0/);
    expect(readFileSync("cli/mcp-stdio.mjs", "utf8")).toMatch(/trades-runtime\.vibelock\.workers\.dev\/mcp/);
    expect(pkg.author).toBe(IDENTITY);
    expect(RUNTIME_MANIFEST.author).toBe(IDENTITY);
    expect(RUNTIME_MANIFEST.identity).toBe(IDENTITY);
    expect(runtime.author).toBe(IDENTITY);
    expect(runtime.identity).toBe(IDENTITY);
    expect(cite.author).toBe(IDENTITY);
    expect(cite.identity).toBe(IDENTITY);
  });

  it("locks public identity to Aziel Eliab only", () => {
    expect(existsSync("IDENTITY.md")).toBe(true);
    const identity = readFileSync("IDENTITY.md", "utf8");
    expect(identity).toMatch(/Aziel Eliab only/);
    expect(identity).toMatch(/legal name/);
    expect(identity).toMatch(/home address/);
    expect(identity).toMatch(/county/);
    expect(identity).not.toMatch(/Elroi/);
    expect(readFileSync("README.md", "utf8")).toMatch(/IDENTITY\.md/);
    for (const path of PRODUCT_SURFACES) {
      const text = readFileSync(path, "utf8");
      expect(text).toMatch(/Aziel Eliab/);
      expect(text).not.toMatch(/Elroi/);
    }
  });

  it("lists only canonical communications / pricebook / truck-stock modules", () => {
    expect(existsSync("src/domain/comms.ts")).toBe(false);
    expect(existsSync("src/domain/pricebook-stock.ts")).toBe(false);
    expect(existsSync("src/domain/communications.ts")).toBe(true);
    expect(existsSync("src/domain/pricebook.ts")).toBe(true);
    expect(existsSync("src/domain/truck-stock.ts")).toBe(true);
    const paths = RUNTIME_MANIFEST.modules.map((module) => module.path);
    expect(paths).not.toContain("src/domain/comms.ts");
    expect(paths).not.toContain("src/domain/pricebook-stock.ts");
    expect(paths).toContain("src/domain/communications.ts");
    expect(paths).toContain("src/domain/pricebook.ts");
    expect(paths).toContain("src/domain/truck-stock.ts");
  });

  it("does not ship a Pages deploy workflow", () => {
    expect(existsSync(".github/workflows/pages.yml")).toBe(false);
    const workflows = readdirSync(".github/workflows");
    expect(workflows).toEqual(["ci.yml"]);
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).not.toMatch(/pages:\s*write/);
    expect(ci).not.toMatch(/id-token:\s*write/);
    expect(readFileSync("README.md", "utf8")).toMatch(/intentionally disabled/);
  });
});
