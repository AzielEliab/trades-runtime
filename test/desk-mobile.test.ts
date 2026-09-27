import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultAlertConfig } from "../src/desk/alerts.js";
import { renderPrintableHuddle, renderPrintableSnapshot } from "../src/desk/print.js";
import { renderDeskPage } from "../src/desk/render.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import { RUNTIME_MANIFEST } from "../src/manifest.js";

const NOW = "2026-09-27T12:00:00Z";

const DOMAINS = [
  "monitoring-board",
  "mission-board",
  "tech-board",
  "calls-board",
  "huddle-board",
  "callback-week-board",
  "metrics",
  "charts",
  "lanes-board",
  "scores-board",
  "alerts-board",
  "drive-board",
  "performance-board",
  "work-together-board",
  "part-cost-board",
  "behavior-board",
  "fulfillment-board",
  "inbound-board",
  "inbound-quality-board",
  "option-c-board"
];

describe("phone-width local desk", () => {
  it("keeps Softwares card grids and makes the desk usable at phone width", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-desk-mobile-"));
    const folders = (["servicetitan", "probooks", "trades-app"] as const).map((preferClass) => {
      const dir = join(root, preferClass);
      mkdirSync(dir, { recursive: true });
      return { dir, preferClass };
    });
    const snapshot = buildOperatorSnapshot({
      now: NOW,
      folders,
      alertConfig: defaultAlertConfig()
    });
    expect(snapshot.version).toBe(RUNTIME_MANIFEST.version);
    expect(snapshot.author).toBe("Aziel Eliab");
    expect(snapshot.pilot_started).toBe(false);

    const html = renderDeskPage(snapshot);
    expect(html).toContain('content="width=device-width, initial-scale=1, viewport-fit=cover"');
    expect(html).toContain('aria-label="Desk domains"');
    expect(html).toContain("safe-area-inset-top");
    expect(html).toContain("safe-area-inset-bottom");
    expect(html).toContain("min-height: 44px");
    expect(html).toContain("input, select, textarea");
    expect(html).toContain("font-size: 1rem");
    expect(html).toContain("table-scroll");
    expect(html).toContain(".metrics { grid-template-columns: repeat(4, 1fr);");
    expect(html).toContain(".kpis { grid-template-columns: repeat(4, 1fr);");
    expect(html).toContain(".tech-cards { grid-template-columns: repeat(5, 1fr);");
    expect(html).toContain(".call-board { display: grid; grid-template-columns: repeat(4, 1fr);");
    expect(html).toContain(".charts { grid-template-columns: 1.35fr 0.9fr; }");
    expect(html).toContain("Part cost");
    expect(html).toContain("Department behavior");
    expect(html).toContain("Monitoring");
    expect(html).toContain("Acknowledge");
    for (const id of DOMAINS) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
    }

    const receipt = renderPrintableSnapshot(snapshot);
    const huddle = renderPrintableHuddle(snapshot);
    for (const page of [receipt, huddle]) {
      expect(page).toContain("viewport-fit=cover");
      expect(page).toContain("safe-area-inset-left");
      expect(page).toContain("min-height: 44px");
    }
  });
});
