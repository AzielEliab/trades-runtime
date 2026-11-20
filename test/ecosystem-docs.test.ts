import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ecosystemCrossReference } from "../workers/giveaway/src/identity.js";

describe("docs ecosystem mirrors", () => {
  const block = ecosystemCrossReference();

  it("keeps llms.txt and ai.txt aligned with the Worker cross-reference and the public demo", () => {
    const llms = readFileSync(new URL("../docs/llms.txt", import.meta.url), "utf8");
    const ai = readFileSync(new URL("../docs/ai.txt", import.meta.url), "utf8");
    const robots = readFileSync(new URL("../docs/robots.txt", import.meta.url), "utf8");

    expect(llms).toContain(block);
    expect(ai).toContain(block);
    expect(llms).toContain("pilot_started false");
    expect(llms).toContain("live_backends false");
    expect(llms).toContain("Pages off");
    expect(llms).toContain("GitHub Pages stays off");
    expect(llms).toContain("Already-running Worker checked 2026-11-13 is 1.0.0");
    expect(ai).toContain("pilot_started false");
    expect(ai).toContain("field_claim false");
    expect(ai).toContain("live_backends false");
    expect(ai).toContain("Pages off");
    expect(ai).toContain("https://trades-runtime.vibelock.workers.dev/.well-known/ai.txt");
    expect(robots).toMatch(/Disallow:\s*\//);

    for (const body of [llms, ai]) {
      expect(body).not.toContain("thefurnaceisntfree.com");
      expect(body).not.toContain("download-tracker.vibelock.workers.dev");
      expect(body).not.toContain("ark-private");
      expect(body).not.toMatch(/github\.com\/AzielEliab\/lumen\b/);
    }
  });
});
