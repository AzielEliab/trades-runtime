import { describe, expect, it } from "vitest";
import {
  incrementCount,
  isHealthCheckUserAgent,
  readCount,
  shouldCountHomepageView,
  STATS_NOTE
} from "../src/counters.js";
import { MemoryKV } from "./helpers.js";

describe("honest KV counters", () => {
  it("starts at 0 with no seed", async () => {
    const kv = new MemoryKV();
    expect(await readCount(kv, "views")).toBe(0);
    expect(await readCount(kv, "downloads")).toBe(0);
  });

  it("increments once per call using unique keys plus parseInt(get)||0+1", async () => {
    const kv = new MemoryKV();
    await incrementCount(kv, "views");
    await incrementCount(kv, "views");
    await incrementCount(kv, "downloads");
    expect(await readCount(kv, "views")).toBe(2);
    expect(await readCount(kv, "downloads")).toBe(1);
    expect(kv.store.get("views")).toBe("2");
    expect(kv.store.get("downloads")).toBe("1");
    const uniqueViews = [...kv.store.keys()].filter((key) => key.startsWith("views:")).length;
    expect(uniqueViews).toBe(2);
  });

  it("does not invent uniques or round up", async () => {
    const kv = new MemoryKV();
    await incrementCount(kv, "views");
    expect(await readCount(kv, "views")).toBe(1);
    expect(STATS_NOTE).toMatch(/No sampling/);
    expect(STATS_NOTE).toMatch(/No inflation/);
    expect(STATS_NOTE).toMatch(/Start at 0/);
  });

  it("excludes health-check user-agents from homepage views", () => {
    expect(shouldCountHomepageView("GET", "/", "Mozilla/5.0")).toBe(true);
    expect(shouldCountHomepageView("HEAD", "/", "Mozilla/5.0")).toBe(false);
    expect(shouldCountHomepageView("GET", "/v1/health", "Mozilla/5.0")).toBe(false);
    expect(shouldCountHomepageView("GET", "/", "kube-probe/1.30")).toBe(false);
    expect(isHealthCheckUserAgent("GoogleHC/1.0")).toBe(true);
    expect(isHealthCheckUserAgent("UptimeRobot/2.0")).toBe(true);
  });
});
