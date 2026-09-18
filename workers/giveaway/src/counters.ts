import { HEALTH_UA_RE } from "./identity.js";

export type CounterName = "views" | "downloads";

export interface CountStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

export const STATS_NOTE =
  "Honest KV increments for 200 responses only. views = successful GET / HTML homepage 200 (health-check user-agents excluded). downloads = successful GET /download 200 after gzip tarball verify. No sampling. No inflation. No estimated uniques. Start at 0. Source of truth is unique COUNTS keys (views:<uuid>, downloads:<uuid>); a running total key is also updated with parseInt(get)||0+1 put. KV list is eventually consistent.";

export async function incrementCount(kv: CountStore, name: CounterName): Promise<number> {
  const id = crypto.randomUUID();
  await kv.put(`${name}:${id}`, "1");
  const current = parseInt((await kv.get(name)) || "0", 10);
  const next = (Number.isFinite(current) ? current : 0) + 1;
  try {
    await kv.put(name, String(next));
  } catch {
    // Unique key already records the event. A 429 on the total key must not invent a count.
  }
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

export async function readCount(kv: CountStore, name: CounterName): Promise<number> {
  const listed = await countPrefix(kv, `${name}:`);
  const total = parseInt((await kv.get(name)) || "0", 10);
  const running = Number.isFinite(total) ? total : 0;
  return Math.max(listed, running);
}

export function isHealthCheckUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return HEALTH_UA_RE.test(userAgent);
}

export function shouldCountHomepageView(method: string, pathname: string, userAgent: string | null): boolean {
  return method === "GET" && pathname === "/" && !isHealthCheckUserAgent(userAgent);
}
