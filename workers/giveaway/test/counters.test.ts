import { describe, expect, it } from "vitest";
import {
  BOT_SCORE_THRESHOLD,
  CLASSIFICATION_NOTE_UA_FALLBACK,
  classifyRequest,
  incrementClassified,
  isHealthCheckUserAgent,
  readCount,
  readFleetStats,
  reconcileLegacySplit,
  shouldCountHomepageView,
  STATS_NOTE
} from "../src/counters.js";
import { MemoryKV } from "./helpers.js";

describe("honest KV counters", () => {
  it("starts at 0 with no seed", async () => {
    const kv = new MemoryKV();
    expect(await readCount(kv, "views")).toBe(0);
    expect(await readCount(kv, "downloads")).toBe(0);
    const stats = await readFleetStats(kv, "ua+healthcheck");
    expect(stats.views).toBe(0);
    expect(stats.downloads).toBe(0);
    expect(stats.total).toBe(0);
    expect(stats.views_human + stats.views_bot).toBe(stats.views);
    expect(stats.downloads_human + stats.downloads_bot).toBe(stats.downloads);
  });

  it("increments once per call using unique keys plus parseInt(get)||0+1", async () => {
    const kv = new MemoryKV();
    await incrementClassified(kv, "views", "human");
    await incrementClassified(kv, "views", "human");
    await incrementClassified(kv, "downloads", "human");
    expect(await readCount(kv, "views")).toBe(2);
    expect(await readCount(kv, "downloads")).toBe(1);
    expect(kv.store.get("views")).toBe("2");
    expect(kv.store.get("downloads")).toBe("1");
    expect(kv.store.get("views_human")).toBe("2");
    expect(kv.store.get("downloads_human")).toBe("1");
    const uniqueViews = [...kv.store.keys()].filter((key) => key.startsWith("views:"));
    expect(uniqueViews).toHaveLength(2);
    expect(uniqueViews.every((key) => kv.store.get(key) === "human")).toBe(true);
    expect([...kv.store.keys()].some((key) => key.startsWith("views_human:"))).toBe(false);
  });

  it("does not invent uniques or round up", async () => {
    const kv = new MemoryKV();
    await incrementClassified(kv, "views", "human");
    expect(await readCount(kv, "views")).toBe(1);
    expect(STATS_NOTE).toMatch(/No sampling/);
    expect(STATS_NOTE).toMatch(/No inflation/);
    expect(STATS_NOTE).toMatch(/Start at 0/);
    expect(STATS_NOTE).toMatch(/human\{\} bot\{\}/);
    expect(CLASSIFICATION_NOTE_UA_FALLBACK).toBe(
      "CF Bot Management unavailable on this request path; classified with UA denylist + health-check only. Author Aziel Eliab."
    );
  });

  it("excludes health-check user-agents from homepage views", () => {
    expect(shouldCountHomepageView("GET", "/", "Mozilla/5.0")).toBe(true);
    expect(shouldCountHomepageView("HEAD", "/", "Mozilla/5.0")).toBe(false);
    expect(shouldCountHomepageView("GET", "/v1/health", "Mozilla/5.0")).toBe(false);
    expect(shouldCountHomepageView("GET", "/", "kube-probe/1.30")).toBe(false);
    expect(isHealthCheckUserAgent("GoogleHC/1.0")).toBe(true);
    expect(isHealthCheckUserAgent("UptimeRobot/2.0")).toBe(true);
  });

  it("classifies bot UAs as bot and browser UAs as human", () => {
    expect(classifyRequest(new Request("https://example.test/", { headers: { "User-Agent": "Mozilla/5.0" } })).class).toBe(
      "human"
    );
    expect(classifyRequest(new Request("https://example.test/", { headers: { "User-Agent": "Googlebot/2.1" } })).class).toBe(
      "bot"
    );
    expect(classifyRequest(new Request("https://example.test/", { headers: { "User-Agent": "GPTBot" } })).class).toBe(
      "bot"
    );
    expect(classifyRequest(new Request("https://example.test/", { headers: { "User-Agent": "kube-probe/1.0" } })).class).toBe(
      "bot"
    );
  });

  it("uses cf.botManagement verifiedBot or score <= 30 as bot, then UA denylist", () => {
    const verified = new Request("https://example.test/", { headers: { "User-Agent": "Mozilla/5.0" } });
    Object.defineProperty(verified, "cf", { value: { botManagement: { verifiedBot: true, score: 99 } } });
    expect(classifyRequest(verified)).toMatchObject({ class: "bot", method: "cf.botManagement+ua" });

    const lowScore = new Request("https://example.test/", { headers: { "User-Agent": "Mozilla/5.0" } });
    Object.defineProperty(lowScore, "cf", { value: { botManagement: { verifiedBot: false, score: 29 } } });
    expect(classifyRequest(lowScore).class).toBe("bot");

    const highScore = new Request("https://example.test/", { headers: { "User-Agent": "Mozilla/5.0" } });
    Object.defineProperty(highScore, "cf", { value: { botManagement: { verifiedBot: false, score: 95 } } });
    expect(classifyRequest(highScore)).toMatchObject({ class: "human", method: "cf.botManagement+ua" });

    const highScoreBotUa = new Request("https://example.test/", { headers: { "User-Agent": "bingbot" } });
    Object.defineProperty(highScoreBotUa, "cf", { value: { botManagement: { verifiedBot: false, score: 80 } } });
    expect(classifyRequest(highScoreBotUa).class).toBe("bot");
  });

  it("holds the human/bot invariant and attributes legacy remainder to human", async () => {
    const kv = new MemoryKV();
    await incrementClassified(kv, "views", "human");
    await incrementClassified(kv, "views", "bot");
    await incrementClassified(kv, "downloads", "bot");
    const live = await readFleetStats(kv, "ua+healthcheck");
    expect(live.views).toBe(live.views_human + live.views_bot);
    expect(live.downloads).toBe(live.downloads_human + live.downloads_bot);
    expect(live.total).toBe(live.downloads);
    expect(live.human.views).toBe(live.views_human);
    expect(live.bot.downloads).toBe(live.downloads_bot);
    expect(live.classification.bot_score_threshold).toBe(BOT_SCORE_THRESHOLD);
    expect(live.project).toBe("trades-runtime");

    const legacy = new MemoryKV();
    await legacy.put("views", "7");
    await legacy.put("views:legacy-a", "1");
    await legacy.put("views:legacy-b", "1");
    await legacy.put("downloads", "4");
    const reconciled = await readFleetStats(legacy, "ua+healthcheck");
    expect(reconciled.views).toBe(7);
    expect(reconciled.views_human).toBe(7);
    expect(reconciled.views_bot).toBe(0);
    expect(reconciled.downloads).toBe(4);
    expect(reconciled.downloads_human).toBe(4);
    expect(reconciled.downloads_bot).toBe(0);
    expect(reconciled.note).toMatch(/Pre-split remainder attributed to human/);

    expect(reconcileLegacySplit(10, 2, 1)).toEqual({ total: 10, human: 9, bot: 1 });
    expect(reconcileLegacySplit(3, 2, 1)).toEqual({ total: 3, human: 2, bot: 1 });
  });
});
