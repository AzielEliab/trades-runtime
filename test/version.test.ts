import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const PRODUCT = "0.3.1";

describe("TR-AUDIT-2026-09-18 hygiene + BYO demo version lockstep", () => {
  it("keeps package, manifest, and catalog on 0.3.1", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string; author: string };
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
        C?: { status: string };
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
    expect(RUNTIME_MANIFEST.honesty).toMatch(/Option C\/D not started/);
    expect(runtime.honesty).toMatch(/BYO local ServiceTitan \+ ProBooks/);
    expect(runtime.honesty).toMatch(/Option C\/D not started/);
    expect(runtime.launch_options?.C?.status).toBe("not-started");
    expect(runtime.launch_options?.D?.status).toBe("not-started");
    expect(readFileSync("README.md", "utf8")).toMatch(/\*\*Version:\*\* 0\.3\.1/);
    expect(readFileSync("README.md", "utf8")).toMatch(/TR-BOT-2026-09-17/);
    expect(readFileSync("README.md", "utf8")).toMatch(/TR-BYO-2026-09-17/);
    expect(readFileSync("README.md", "utf8")).toMatch(/TR-AUDIT-2026-09-18/);
    expect(readFileSync("README.md", "utf8")).toMatch(/data\/inbound\/servicetitan/);
    expect(readFileSync("README.md", "utf8")).toMatch(/data\/inbound\/probooks/);
    expect(readFileSync("README.md", "utf8")).toMatch(/Option C\/D not started/);
    expect(RUNTIME_MANIFEST.modules.some((module) => module.slug === "probooks-shadow")).toBe(true);
    expect(RUNTIME_MANIFEST.modules.some((module) => module.slug === "byo-admit-demo")).toBe(true);
    expect(pkg.author).toBe("Aziel Eliab");
    expect(RUNTIME_MANIFEST.author).toBe("Aziel Eliab");
    expect(RUNTIME_MANIFEST.identity).toBe("Aziel Eliab");
    expect(runtime.author).toBe("Aziel Eliab");
    expect(runtime.identity).toBe("Aziel Eliab");
    expect(cite.author).toBe("Aziel Eliab");
    expect(cite.identity).toBe("Aziel Eliab");
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
