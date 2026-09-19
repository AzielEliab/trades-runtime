export const PRODUCT = "trades-runtime";
export const PRODUCT_TITLE = "Trades-Runtime";
export const VERSION = "0.3.4";
export const AUTHOR = "Aziel Eliab";
export const IDENTITY = "Aziel Eliab";
export const LICENSE = "Apache-2.0";
export const WORKER_NAME = "trades-runtime";
export const PUBLIC_ORIGIN = "https://trades-runtime.vibelock.workers.dev";
export const REPOSITORY = "https://github.com/AzielEliab/trades-runtime";
export const RELEASE_FILENAME = `trades-runtime-${VERSION}.tgz`;

export const PERSON_ID = "https://www.azieleliab.com/#aziel";
export const PERSON_URL = "https://www.azieleliab.com/";
export const SOFTWARES_TAB = "https://www.azielcorpuslibrary.net/software";
export const SISTER_CORPUS = "https://www.azielcorpuslibrary.net/";
export const SISTER_GODLOCK = "https://godlock.uk/";
export const GITHUB_AUTHOR = "https://github.com/AzielEliab";

export const PAGE_TITLE = `${PRODUCT_TITLE} · public giveaway · ${VERSION}`;
export const PAGE_DESCRIPTION =
  "Trades-Runtime — shadow-first local BYO runtime for HVAC, plumbing, electrical, sewer, and cross-trades. Author Aziel Eliab. Not a hosted company OS. live_backends false.";
export const OG_TITLE = "Trades-Runtime by Aziel Eliab";
export const OG_DESCRIPTION =
  "Shadow-first local BYO field-trades runtime. HVAC, plumbing, electrical, sewer, cross-trades. Not a hosted company OS.";

export const COMPATIBLE_AI_CLIENTS = [
  "ChatGPT (GPT Actions / OpenAI)",
  "Grok (xAI)",
  "Venice",
  "Claude (Anthropic Desktop / custom tools)",
  "Cursor (MCP)",
  "Glama (Install Server / MCP)",
  "Perplexity",
  "Microsoft Copilot / Bing",
  "Google Gemini / Vertex AI",
  "Mistral",
  "Meta AI",
  "Apple Intelligence / Applebot surfaces",
  "Amazon Q / Amazonbot tooling",
  "DuckAssist / DuckDuckGo AI",
  "You.com",
  "Cohere",
  "plus other MCP/OpenAPI-capable assistants"
] as const;

export const KEYWORDS = [
  "Trades-Runtime",
  "trades-runtime",
  "Aziel Eliab",
  "HVAC",
  "plumbing",
  "electrical",
  "sewer",
  "cross-trades",
  "BYO",
  "ServiceTitan",
  "ProBooks",
  "shadow-first",
  "local-first"
] as const;

/** cite.json sameAs — product + sister hubs. No fake Glama listing. */
export const CITE_SAME_AS = [
  REPOSITORY,
  `${PUBLIC_ORIGIN}/`,
  SOFTWARES_TAB,
  PERSON_URL,
  PERSON_ID,
  SISTER_CORPUS,
  GITHUB_AUTHOR
] as const;

/** Person / graph JSON-LD sameAs. Includes godlock.uk as a sister hub. */
export const PERSON_SAME_AS = [
  PERSON_URL,
  GITHUB_AUTHOR,
  REPOSITORY,
  `${PUBLIC_ORIGIN}/`,
  SOFTWARES_TAB,
  SISTER_CORPUS,
  SISTER_GODLOCK
] as const;

export const SAME_AS = CITE_SAME_AS;

/** Explicit Allow set copied from live aziel-runtime robots.txt (2026-09-19). No invented UAs. */
export const CRAWL_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "Google-Extended",
  "Googlebot",
  "GoogleOther",
  "Google-CloudVertexBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "bingbot",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "Meta-WebIndexer",
  "FacebookBot",
  "facebookexternalhit",
  "Meta-ExternalAds",
  "Applebot",
  "Applebot-Extended",
  "Amazonbot",
  "DuckDuckBot",
  "DuckAssistBot",
  "MistralAI-User",
  "YouBot",
  "CCBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "AI2Bot",
  "AI2Bot-Dolma",
  "Timpibot",
  "Petalbot",
  "Bytespider",
  "Omgili",
  "Omgilibot",
  "FirecrawlAgent",
  "ImagesiftBot",
  "Cloudflare-AI-Search",
  "TikTokSpider",
  "Baiduspider",
  "Baiduspider-render",
  "Baiduspider-ai",
  "YandexBot",
  "PanguBot",
  "Kangaroo Bot",
  "Cotoyogi",
  "aiHitBot",
  "webzio-extended",
  "ICC-Crawler",
  "DataForSeoBot",
  "AwarioBot",
  "AwarioSmartBot",
  "AwarioRssBot",
  "Sentibot",
  "peer39_crawler",
  "Seekr",
  "Meltwater",
  "TurnitinBot",
  "Factset_spyderbot",
  "NeevaBot"
] as const;

export const SITEMAP_ENTRIES = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/download", changefreq: "daily", priority: "0.95" },
  { path: "/cite.json", changefreq: "daily", priority: "0.9" },
  { path: "/llms.txt", changefreq: "daily", priority: "0.9" },
  { path: "/ai.txt", changefreq: "daily", priority: "0.9" },
  { path: "/humans.txt", changefreq: "weekly", priority: "0.7" },
  { path: "/openapi.json", changefreq: "daily", priority: "0.9" },
  { path: "/robots.txt", changefreq: "weekly", priority: "0.6" },
  { path: "/sitemap.xml", changefreq: "weekly", priority: "0.5" },
  { path: "/v1/health", changefreq: "daily", priority: "0.5" },
  { path: "/v1/stats", changefreq: "hourly", priority: "0.7" },
  { path: "/count", changefreq: "hourly", priority: "0.7" },
  { path: "/v1/skill", changefreq: "daily", priority: "0.85" },
  { path: "/mcp", changefreq: "daily", priority: "0.9" },
  { path: "/.well-known/mcp.json", changefreq: "daily", priority: "0.85" },
  { path: "/person.jsonld", changefreq: "weekly", priority: "0.8" },
  { path: "/graph.jsonld", changefreq: "weekly", priority: "0.8" }
] as const;

export const SITEMAP_PATHS = SITEMAP_ENTRIES.map((entry) => entry.path);

export const HONESTY = {
  product:
    "Local-first BYO runtime. People bring their own ServiceTitan and ProBooks. No tenant data on this Worker. No ST/ProBooks write-back. live_backends false. Not a production company OS claim.",
  counters:
    "Honest Workers KV counts. views increments exactly once per successful GET / HTML homepage 200. Health-check user-agents and non-GET / requests are not counted. downloads increments exactly once per successful GET /download 200 after the release tarball is verified as gzip. Assets, /v1/health, /v1/stats, /openapi.json, /mcp, /cite.json, /llms.txt, /robots.txt, and /v1/skill do not increment. No sampling. No inflation. No estimated unique visitors. Start at 0. Each increment writes one unique COUNTS key (views:<uuid> or downloads:<uuid>) and also does value = (parseInt(await kv.get(name))||0)+1 with put on the name key. GET /v1/stats lists the unique keys (source of truth) and never seeds or rounds up. KV list is eventually consistent — a just-written key may take up to ~60s to appear in another colo. Failed downloads never increment."
} as const;

export const HEALTH_UA_RE =
  /healthcheck|health-check|kube-probe|googlehc|cloudflare-health|uptimerobot|pingdom|statuscake|betteruptime|better-uptime|aws-health|elb-health|watchdog|synthetic-monitor/i;
