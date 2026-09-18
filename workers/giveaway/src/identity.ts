export const PRODUCT = "trades-runtime";
export const PRODUCT_TITLE = "Trades-Runtime";
export const VERSION = "0.3.3";
export const AUTHOR = "Aziel Eliab";
export const IDENTITY = "Aziel Eliab";
export const LICENSE = "Apache-2.0";
export const WORKER_NAME = "trades-runtime";
export const PUBLIC_ORIGIN = "https://trades-runtime.vibelock.workers.dev";
export const REPOSITORY = "https://github.com/AzielEliab/trades-runtime";
export const RELEASE_FILENAME = `trades-runtime-${VERSION}.tgz`;

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

export const HONESTY = {
  product:
    "Local-first BYO runtime. People bring their own ServiceTitan and ProBooks. No tenant data on this Worker. No ST/ProBooks write-back. live_backends false. Not a production company OS claim.",
  counters:
    "Honest Workers KV counts. views increments exactly once per successful GET / HTML homepage 200. Health-check user-agents and non-GET / requests are not counted. downloads increments exactly once per successful GET /download 200 after the release tarball is verified as gzip. Assets, /v1/health, /v1/stats, /openapi.json, /mcp, /cite.json, /llms.txt, /robots.txt, and /v1/skill do not increment. No sampling. No inflation. No estimated unique visitors. Start at 0. Each increment writes one unique COUNTS key (views:<uuid> or downloads:<uuid>) and also does value = (parseInt(await kv.get(name))||0)+1 with put on the name key. GET /v1/stats lists the unique keys (source of truth) and never seeds or rounds up. KV list is eventually consistent — a just-written key may take up to ~60s to appear in another colo. Failed downloads never increment."
} as const;

export const HEALTH_UA_RE =
  /healthcheck|health-check|kube-probe|googlehc|cloudflare-health|uptimerobot|pingdom|statuscake|betteruptime|better-uptime|aws-health|elb-health|watchdog|synthetic-monitor/i;
