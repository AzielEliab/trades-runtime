import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { defaultAlertConfig } from "../src/desk/alerts.js";
import { renderDeskPage } from "../src/desk/render.js";
import { buildOperatorSnapshot } from "../src/desk/snapshot.js";
import {
  DESK_VIEW_KEY,
  deskViewClientScript,
  deskViewIsOn,
  emptyDeskView,
  parseDeskView,
  withDeskToggle
} from "../src/desk/view-prefs.js";

const NOW = "2026-09-27T12:00:00Z";

function snapshot() {
  const root = mkdtempSync(join(tmpdir(), "tr-desk-view-"));
  const folders = (["servicetitan", "probooks", "trades-app"] as const).map((preferClass) => {
    const dir = join(root, preferClass);
    mkdirSync(dir, { recursive: true });
    return { dir, preferClass };
  });
  return buildOperatorSnapshot({ now: NOW, folders, alertConfig: defaultAlertConfig() });
}

class FakeNode {
  hidden = false;
  checked = false;
  type = "checkbox";
  listeners = new Map<string, (event: { target: FakeNode }) => void>();
  constructor(
    readonly attrs: Record<string, string>,
    checked = false
  ) {
    this.checked = checked;
  }
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  closest(selector: string): FakeNode | null {
    if (selector === "[data-toggle]" && this.attrs["data-toggle"]) return this;
    return null;
  }
  addEventListener(type: string, fn: (event: { target: FakeNode }) => void): void {
    this.listeners.set(type, fn);
  }
}

function install(nodes: FakeNode[], storage: Map<string, string>) {
  const panel = nodes.find((node) => node.attrs.id === "desk-view");
  const document = {
    getElementById(id: string) {
      return nodes.find((node) => node.attrs.id === id) ?? null;
    },
    querySelectorAll(selector: string) {
      if (selector === "[data-view]") return nodes.filter((node) => node.attrs["data-view"]);
      if (selector === "[data-toggle]") return nodes.filter((node) => node.attrs["data-toggle"]);
      return [];
    }
  };
  const context = vm.createContext({
    document,
    localStorage: {
      getItem: (key: string) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key: string, value: string) => storage.set(key, value)
    },
    window: {} as { __applyDeskView?: () => void },
    console
  });
  vm.runInContext(deskViewClientScript(), context);
  return { panel, context };
}

describe("desk view preferences", () => {
  it("defaults every piece on and only stores explicit offs", () => {
    expect(parseDeskView(null)).toEqual(emptyDeskView());
    expect(parseDeskView("not-json")).toEqual(emptyDeskView());
    expect(parseDeskView(JSON.stringify({ v: 2, off: ["metric:jobs"] }))).toEqual(emptyDeskView());
    const off = withDeskToggle(emptyDeskView(), "metric:jobs", false);
    expect(off.off).toEqual(["metric:jobs"]);
    expect(deskViewIsOn(off, "metric:jobs")).toBe(false);
    expect(deskViewIsOn(off, "kpi:miles")).toBe(true);
    const restored = parseDeskView(JSON.stringify(off));
    expect(restored).toEqual(off);
    expect(withDeskToggle(restored, "metric:jobs", true).off).toEqual([]);
    expect(DESK_VIEW_KEY).toBe("trades-desk-view");
  });

  it("hides a metric, a tech, and a board from localStorage and keeps the choice", () => {
    const metric = new FakeNode({ "data-view": "metric:jobs" });
    const metricBox = new FakeNode({ "data-toggle": "metric:jobs", id: "desk-view" }, true);
    const tech = new FakeNode({ "data-view": "tech:tech-maya" });
    const techBox = new FakeNode({ "data-toggle": "tech:tech-maya" }, true);
    const board = new FakeNode({ "data-view": "section:alerts-board" });
    const storage = new Map<string, string>([
      [DESK_VIEW_KEY, JSON.stringify({ v: 1, off: ["metric:jobs", "tech:tech-maya", "section:alerts-board"] })]
    ]);
    const { panel, context } = install([metric, metricBox, tech, techBox, board], storage);
    expect(metric.hidden).toBe(true);
    expect(tech.hidden).toBe(true);
    expect(board.hidden).toBe(true);
    expect(metricBox.checked).toBe(false);
    expect(techBox.checked).toBe(false);

    metricBox.checked = true;
    panel?.listeners.get("change")?.({ target: metricBox });
    expect(metric.hidden).toBe(false);
    expect(metricBox.checked).toBe(true);
    expect(tech.hidden).toBe(true);
    const saved = parseDeskView(storage.get(DESK_VIEW_KEY) ?? null);
    expect(saved.off.sort()).toEqual(["section:alerts-board", "tech:tech-maya"]);

    context.window.__applyDeskView?.();
    expect(metric.hidden).toBe(false);
    expect(tech.hidden).toBe(true);
  });

  it("renders the checkbox panel on, and leaves Softwares card grids alone", () => {
    const html = renderDeskPage(snapshot());
    expect(html).toContain('id="desk-view"');
    expect(html).toContain("Show on this desk");
    expect(html).toContain('data-toggle="metric:jobs" checked');
    expect(html).toContain('data-toggle="kpi:miles" checked');
    expect(html).toContain('data-toggle="section:alerts-board" checked');
    expect(html).toContain('data-toggle="chart:jobs" checked');
    expect(html).toContain('data-toggle="lane:capacity" checked');
    expect(html).toContain('data-toggle="alert:capacity" checked');
    expect(html).toContain('data-view="metric:jobs"');
    expect(html).toContain('data-view="tech:');
    expect(html).toContain('data-view="score:');
    expect(html).toContain("trades-desk-view");
    expect(html).toContain("live_backends false");
    expect(html).toContain(".metrics { grid-template-columns: repeat(4, 1fr);");
    expect(html).toContain(".kpis { grid-template-columns: repeat(4, 1fr);");
    expect(html).toContain(".tech-cards { grid-template-columns: repeat(5, 1fr);");
    expect(html).toContain(".call-board { display: grid; grid-template-columns: repeat(4, 1fr);");
    expect(html).toContain(".charts { grid-template-columns: 1.35fr 0.9fr; }");
    expect(html.match(/data-toggle="[^"]+" (?!checked)/)).toBeNull();
  });
});
