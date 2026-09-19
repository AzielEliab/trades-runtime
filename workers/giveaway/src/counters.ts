import { HEALTH_UA_RE, PRODUCT } from "./identity.js";

export type CounterName = "views" | "downloads";
export type TrafficClass = "human" | "bot";
export type SplitName = `${CounterName}_${TrafficClass}`;
export type CountKey = CounterName | SplitName;
export type ClassificationMethod = "cf.botManagement+ua" | "ua+healthcheck";

export interface CountStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface BotManagementHint {
  verifiedBot?: boolean;
  score?: number;
}

export interface ClassifyableRequest {
  headers: Headers;
  cf?: {
    botManagement?: BotManagementHint;
  };
}

export interface Classification {
  class: TrafficClass;
  method: ClassificationMethod;
  usedBotManagement: boolean;
}

export interface FleetStats {
  project: typeof PRODUCT;
  views: number;
  downloads: number;
  total: number;
  views_human: number;
  views_bot: number;
  downloads_human: number;
  downloads_bot: number;
  human: { views: number; downloads: number };
  bot: { views: number; downloads: number };
  classification: {
    method: ClassificationMethod;
    bot_score_threshold: typeof BOT_SCORE_THRESHOLD;
    note: string;
  };
  note: string;
}

export const BOT_SCORE_THRESHOLD = 30 as const;

/** Case-insensitive crawler / assistant-fetcher substrings. Health-check UAs are handled separately. */
export const BOT_UA_RE =
  /googlebot|google-extended|bingbot|bingpreview|yandex|baiduspider|duckduckbot|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot|gptbot|chatgpt-user|claudebot|anthropic-ai|bytespider|petalsbot|petalbot|ccbot|semrush|ahrefs|mj12bot|dotbot|amazonbot|applebot|perplexitybot|ia_archiver|\bslurp\b|rogerbot|scribd|embedly|pinterest|redditbot|telegrambot/i;

export const STATS_NOTE =
  "Honest KV increments for 200 responses only. views = successful GET / HTML homepage 200 (health-check user-agents excluded). downloads = successful GET /download 200 after gzip tarball verify. Human/bot split: views === views_human + views_bot and downloads === downloads_human + downloads_bot. Pre-split legacy remainder is attributed to human (never seeded as bot). No sampling. No inflation. No estimated uniques. Start at 0. Source of truth is unique COUNTS keys (views:<uuid>, downloads:<uuid>) plus parallel running totals views_human / views_bot / downloads_human / downloads_bot (and matching :<uuid> event keys). A running total key is also updated with parseInt(get)||0+1 put. KV list is eventually consistent.";

export const CLASSIFICATION_NOTE_BOT_MANAGEMENT =
  "Cloudflare Bot Management plus UA denylist. verifiedBot or score <= 30 is bot; otherwise UA denylist; else human. Health-check user-agents are skipped on homepage views and counted as bot only if a verified tarball GET is incremented.";

export const CLASSIFICATION_NOTE_UA_FALLBACK =
  "CF Bot Management was unavailable on this Worker isolate path, so classification uses UA denylist plus health-check user-agents only.";

export function isHealthCheckUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return HEALTH_UA_RE.test(userAgent);
}

export function isDenylistedBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return BOT_UA_RE.test(userAgent);
}

export function botManagementFromRequest(request: ClassifyableRequest): BotManagementHint | null {
  const bm = request.cf?.botManagement;
  return bm && typeof bm === "object" ? bm : null;
}

export function classificationMethodForRequest(request: ClassifyableRequest): ClassificationMethod {
  return botManagementFromRequest(request) ? "cf.botManagement+ua" : "ua+healthcheck";
}

export function classificationNote(method: ClassificationMethod): string {
  return method === "cf.botManagement+ua" ? CLASSIFICATION_NOTE_BOT_MANAGEMENT : CLASSIFICATION_NOTE_UA_FALLBACK;
}

export function classifyRequest(request: ClassifyableRequest): Classification {
  const userAgent = request.headers.get("user-agent");
  const botManagement = botManagementFromRequest(request);
  const usedBotManagement = botManagement !== null;
  const method: ClassificationMethod = usedBotManagement ? "cf.botManagement+ua" : "ua+healthcheck";

  if (isHealthCheckUserAgent(userAgent)) {
    return { class: "bot", method, usedBotManagement };
  }

  if (usedBotManagement) {
    if (botManagement.verifiedBot === true) {
      return { class: "bot", method, usedBotManagement };
    }
    if (typeof botManagement.score === "number" && botManagement.score <= BOT_SCORE_THRESHOLD) {
      return { class: "bot", method, usedBotManagement };
    }
  }

  if (isDenylistedBotUserAgent(userAgent)) {
    return { class: "bot", method, usedBotManagement };
  }

  return { class: "human", method, usedBotManagement };
}

export function shouldCountHomepageView(method: string, pathname: string, userAgent: string | null): boolean {
  return method === "GET" && pathname === "/" && !isHealthCheckUserAgent(userAgent);
}

export function shouldCountDownload(method: string, pathname: string): boolean {
  return method === "GET" && pathname === "/download";
}

async function incrementRunningTotal(kv: CountStore, name: string): Promise<number> {
  const current = parseInt((await kv.get(name)) || "0", 10);
  const next = (Number.isFinite(current) ? current : 0) + 1;
  try {
    await kv.put(name, String(next));
  } catch {
    // Unique key already records the event. A 429 on the total key must not invent a count.
  }
  return next;
}

export async function incrementCount(
  kv: CountStore,
  name: CounterName,
  traffic: TrafficClass
): Promise<number> {
  const id = crypto.randomUUID();
  const split: SplitName = `${name}_${traffic}`;
  await kv.put(`${name}:${id}`, traffic);
  await kv.put(`${split}:${id}`, "1");
  const next = await incrementRunningTotal(kv, name);
  await incrementRunningTotal(kv, split);
  return next;
}

export async function countPrefix(kv: CountStore, prefix: string): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor });
    count += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return count;
}

export async function readCount(kv: CountStore, name: CountKey): Promise<number> {
  const listed = await countPrefix(kv, `${name}:`);
  const total = parseInt((await kv.get(name)) || "0", 10);
  const running = Number.isFinite(total) ? total : 0;
  return Math.max(listed, running);
}

/** Attribute pre-split remainder to human. Never seed fake bots. Invariant: total === human + bot. */
export function reconcileLegacySplit(
  total: number,
  human: number,
  bot: number
): { total: number; human: number; bot: number } {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const safeHuman = Number.isFinite(human) && human > 0 ? human : 0;
  const safeBot = Number.isFinite(bot) && bot > 0 ? bot : 0;
  const split = safeHuman + safeBot;
  if (split < safeTotal) {
    return { total: safeTotal, human: safeTotal - safeBot, bot: safeBot };
  }
  return { total: split, human: safeHuman, bot: safeBot };
}

export async function readFleetStats(
  kv: CountStore,
  method: ClassificationMethod
): Promise<FleetStats> {
  const [viewsRaw, downloadsRaw, viewsHumanRaw, viewsBotRaw, downloadsHumanRaw, downloadsBotRaw] =
    await Promise.all([
      readCount(kv, "views"),
      readCount(kv, "downloads"),
      readCount(kv, "views_human"),
      readCount(kv, "views_bot"),
      readCount(kv, "downloads_human"),
      readCount(kv, "downloads_bot")
    ]);

  const views = reconcileLegacySplit(viewsRaw, viewsHumanRaw, viewsBotRaw);
  const downloads = reconcileLegacySplit(downloadsRaw, downloadsHumanRaw, downloadsBotRaw);

  return {
    project: PRODUCT,
    views: views.total,
    downloads: downloads.total,
    total: downloads.total,
    views_human: views.human,
    views_bot: views.bot,
    downloads_human: downloads.human,
    downloads_bot: downloads.bot,
    human: { views: views.human, downloads: downloads.human },
    bot: { views: views.bot, downloads: downloads.bot },
    classification: {
      method,
      bot_score_threshold: BOT_SCORE_THRESHOLD,
      note: classificationNote(method)
    },
    note: STATS_NOTE
  };
}
