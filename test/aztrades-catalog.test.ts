import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const AZTRADES_SLUGS = [
  "field-time",
  "job-price",
  "supplyhouse-public",
  "property-card",
  "local-login",
  "aztrades-render",
  "hint-prefs"
] as const;

const PATHS: Record<(typeof AZTRADES_SLUGS)[number], string> = {
  "field-time": "src/desk/field-time.ts",
  "job-price": "src/desk/job-price.ts",
  "supplyhouse-public": "src/desk/supplyhouse-public.ts",
  "property-card": "src/desk/property-card.ts",
  "local-login": "src/desk/local-login.ts",
  "aztrades-render": "src/desk/aztrades-render.ts",
  "hint-prefs": "src/desk/hint-prefs.ts"
};

const HONESTY = [
  "Local Softwares only",
  "live_backends false",
  "pilot_started false",
  "Not Field 1.0",
  "SupplyHouse is a public GET when a number returns",
  "403 or no number",
  "no order path",
  "until a permitted account",
  "company history only",
  "Zillow, Redfin, and a county assessor are not connected until a permitted source",
  "the first user is okayed",
  "later users need higher approval",
  "No ServiceTitan or Jobber write-back from this shell"
];

describe("AZTrades catalog honesty", () => {
  it("names the shipped desk modules and keeps the live flags false", () => {
    expect(RUNTIME_MANIFEST.live_backends).toBe(false);
    expect(RUNTIME_MANIFEST.pilot_started).toBe(false);
    expect(RUNTIME_MANIFEST.field_claim).toBe(false);
    const runtime = JSON.parse(readFileSync("docs/v1/runtime.json", "utf8")) as {
      live_backends: boolean;
      pilot_started: boolean;
      field_claim: boolean;
      honesty: string;
      software_modules: { slug: string; path: string; status: string; summary: string }[];
      engines: { slug: string; name: string; status: string; summary: string }[];
    };
    expect(runtime.live_backends).toBe(false);
    expect(runtime.pilot_started).toBe(false);
    expect(runtime.field_claim).toBe(false);
    expect(runtime.honesty).toMatch(/live_backends false/);
    expect(runtime.honesty).toMatch(/pilot_started false/);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/live_backends false/);
    expect(RUNTIME_MANIFEST.honesty).toMatch(/pilot_started false/);

    const readme = readFileSync("README.md", "utf8");
    const llms = readFileSync("docs/llms.txt", "utf8");
    const home = readFileSync("docs/index.html", "utf8");
    for (const phrase of HONESTY) {
      expect(RUNTIME_MANIFEST.honesty).toContain(phrase);
      expect(runtime.honesty).toContain(phrase);
      expect(readme).toContain(phrase);
      expect(llms).toContain(phrase);
      expect(home).toContain(phrase);
    }

    for (const slug of AZTRADES_SLUGS) {
      const module = RUNTIME_MANIFEST.modules.find((row) => row.slug === slug);
      const software = runtime.software_modules.find((row) => row.slug === slug);
      const engine = runtime.engines.find((row) => row.slug === slug);
      expect(module?.path).toBe(PATHS[slug]);
      expect(module?.status).toBe("live-pure");
      expect(software).toMatchObject({ path: PATHS[slug], status: "live-pure", summary: module?.summary });
      expect(engine?.status).toBe("live-pure");
      expect(engine?.summary).toBe(module?.summary);
      for (const phrase of HONESTY) {
        expect(module?.summary).toContain(phrase);
      }
      expect(readme).toContain(PATHS[slug]);
    }

    const desk = RUNTIME_MANIFEST.modules.find((row) => row.slug === "operator-desk");
    const deskSoftware = runtime.software_modules.find((row) => row.slug === "operator-desk");
    const deskEngine = runtime.engines.find((row) => row.slug === "operator-desk");
    for (const summary of [desk?.summary, deskSoftware?.summary, deskEngine?.summary]) {
      expect(summary).toMatch(/AZTrades shell/);
      for (const phrase of HONESTY) expect(summary).toContain(phrase);
    }
    expect(readme).toMatch(/AZTrades shell included/);
  });
});
