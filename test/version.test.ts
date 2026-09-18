import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const PRODUCT = "0.3.0";

describe("TR-AUDIT-2026-09-17 cut 3 version lockstep", () => {
  it("keeps package, manifest, and Pages catalog on 0.3.0", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    const runtime = JSON.parse(readFileSync("docs/v1/runtime.json", "utf8")) as {
      version: string;
      runtime_version: string;
      property_intelligence: string;
      live_backends: boolean;
      pages?: string;
    };
    const cite = JSON.parse(readFileSync("docs/cite.json", "utf8")) as { version: string };

    expect(pkg.version).toBe(PRODUCT);
    expect(RUNTIME_MANIFEST.version).toBe(PRODUCT);
    expect(runtime.version).toBe(PRODUCT);
    expect(runtime.runtime_version).toBe(PRODUCT);
    expect(runtime.property_intelligence).toBe("1.0");
    expect(cite.version).toBe(PRODUCT);
    expect(runtime.live_backends).toBe(false);
    expect(runtime.pages).toBe("off");
    expect(readFileSync("README.md", "utf8")).toMatch(/\*\*Version:\*\* 0\.3\.0/);
    expect(readFileSync("README.md", "utf8")).toMatch(/TR-BOT-2026-09-17/);
  });

  it("keeps Pages deploy workflow_dispatch only", () => {
    const pages = readFileSync(".github/workflows/pages.yml", "utf8");
    expect(pages).toMatch(/workflow_dispatch:/);
    expect(pages).not.toMatch(/^\s+push:/m);
    expect(pages).not.toMatch(/branches:\s*\[main\]/);
  });
});
