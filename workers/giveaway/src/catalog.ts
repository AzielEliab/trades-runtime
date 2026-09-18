import {
  AUTHOR,
  COMPATIBLE_AI_CLIENTS,
  HONESTY,
  IDENTITY,
  LICENSE,
  PRODUCT,
  PRODUCT_TITLE,
  PUBLIC_ORIGIN,
  RELEASE_FILENAME,
  REPOSITORY,
  VERSION
} from "./identity.js";
import { STATS_NOTE } from "./counters.js";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2) + "\n", {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export function text(body: string, type: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": type,
      "Cache-Control": status === 200 ? "public, max-age=300" : "no-store"
    }
  });
}

export function healthBody(releaseReady: boolean, releaseBytes: number | null): Record<string, unknown> {
  return {
    ok: true,
    product: PRODUCT,
    title: PRODUCT_TITLE,
    version: VERSION,
    author: AUTHOR,
    identity: IDENTITY,
    license: LICENSE,
    live_backends: false,
    hosted_company_os: false,
    tenant_data: false,
    servicetitan_write: false,
    probooks_write: false,
    pages: "off",
    role: "public-giveaway",
    worker: PUBLIC_ORIGIN,
    download: `${PUBLIC_ORIGIN}/download`,
    release: RELEASE_FILENAME,
    release_ready: releaseReady,
    release_bytes: releaseBytes,
    honesty: HONESTY.product
  };
}

export function citeBody(): Record<string, unknown> {
  return {
    product: PRODUCT,
    name: PRODUCT_TITLE,
    title: PRODUCT_TITLE,
    version: VERSION,
    author: AUTHOR,
    identity: IDENTITY,
    license: LICENSE,
    live_backends: false,
    repository: REPOSITORY,
    worker: PUBLIC_ORIGIN,
    download: `${PUBLIC_ORIGIN}/download`,
    health: `${PUBLIC_ORIGIN}/v1/health`,
    stats: `${PUBLIC_ORIGIN}/v1/stats`,
    openapi: `${PUBLIC_ORIGIN}/openapi.json`,
    mcp: `${PUBLIC_ORIGIN}/mcp`,
    skill: `${PUBLIC_ORIGIN}/v1/skill`,
    compatible_ai_clients: [...COMPATIBLE_AI_CLIENTS],
    honesty: HONESTY.product,
    counters: HONESTY.counters,
    not: [
      "Not a hosted multi-tenant company OS.",
      "Not a ServiceTitan or ProBooks write API.",
      "Not a central dump or hosted uploader.",
      "Not aziel-runtime wholesale.",
      "Not GitHub Pages."
    ]
  };
}

export function llmsTxt(): string {
  return `# Trades-Runtime

> Local-first TypeScript runtime for field-trades companies.
> Author / identity: Aziel Eliab only.
> Version: ${VERSION}
> License: ${LICENSE}
> Public Worker: ${PUBLIC_ORIGIN}

${HONESTY.product}

## Get the software

- Human UI: GET /
- Counted tarball: GET /download
- Stats: GET /v1/stats
- Health: GET /v1/health
- Cite: GET /cite.json
- Skill: GET /v1/skill
- OpenAPI: GET /openapi.json
- MCP (read-only): POST /mcp

## Install

\`\`\`
curl -fsSL ${PUBLIC_ORIGIN}/download -o ${RELEASE_FILENAME}
tar -xzf ${RELEASE_FILENAME}
cd package
npm install
npm test
\`\`\`

Bring your own ServiceTitan and ProBooks to your local machine. This Worker does not store tenant data.

## AI clients

${COMPATIBLE_AI_CLIENTS.map((name) => `- ${name}`).join("\n")}
`;
}

export function robotsTxt(): string {
  return `# Trades-Runtime public giveaway Worker
User-agent: *
Allow: /
Allow: /download
Allow: /v1/health
Allow: /v1/stats
Allow: /cite.json
Allow: /llms.txt
Allow: /openapi.json
Allow: /v1/skill

User-agent: GPTBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: anthropic-ai
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
`;
}

export function skillMarkdown(): string {
  return `# Trades-Runtime skill

Product: Trades-Runtime ${VERSION}
Author / identity: Aziel Eliab only
License: ${LICENSE}
Worker: ${PUBLIC_ORIGIN}

## What it is

Local-first BYO TypeScript runtime for HVAC, plumbing, electrical, sewer, and cross-trades.
People bring their own ServiceTitan and ProBooks. Dual surface: human UI + counted download.
Thin OpenAPI/MCP for health, stats, cite, and this skill. Not a FragGate engine catalog.

## What it is not

Not a hosted multi-tenant company OS.
Not a ServiceTitan or ProBooks write API.
Not a central dump.
Not a production company OS claim. live_backends is false.

## Honest counters

${HONESTY.counters}

## Install

curl -fsSL ${PUBLIC_ORIGIN}/download -o ${RELEASE_FILENAME}
tar -xzf ${RELEASE_FILENAME} && cd package && npm install && npm test
`;
}

export function openApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: PRODUCT_TITLE,
      version: VERSION,
      summary: "Public giveaway Worker for Trades-Runtime. Read-only distribution surface.",
      description: `${HONESTY.product} Counters: ${STATS_NOTE}`,
      contact: { name: AUTHOR },
      license: { name: LICENSE },
      "x-identity": IDENTITY,
      "x-compatible-ai-clients": [...COMPATIBLE_AI_CLIENTS]
    },
    servers: [{ url: PUBLIC_ORIGIN }],
    paths: {
      "/": {
        get: {
          summary: "Human landing HTML",
          description: "Increments views once on HTML 200. Health-check user-agents are excluded."
        }
      },
      "/download": {
        get: {
          summary: "Counted release tarball",
          description: "Increments downloads once after gzip verify on 200. Failed responses do not increment."
        }
      },
      "/v1/health": { get: { summary: "Health JSON. Does not increment counters." } },
      "/v1/stats": { get: { summary: "Honest KV views/downloads. Does not increment counters." } },
      "/stats": { get: { summary: "Alias of /v1/stats." } },
      "/cite.json": { get: { summary: "Public cite. Does not increment counters." } },
      "/llms.txt": { get: { summary: "LLM-oriented product text." } },
      "/robots.txt": { get: { summary: "Robots allow list." } },
      "/v1/skill": { get: { summary: "Agent skill markdown." } },
      "/openapi.json": { get: { summary: "This OpenAPI document." } },
      "/mcp": {
        post: {
          summary: "Read-only MCP JSON-RPC (initialize, tools/list, tools/call)",
          description: "Tools: health, stats, cite, skill. Public, no OAuth. Does not increment counters."
        }
      }
    }
  };
}

export function statsBody(views: number, downloads: number): Record<string, unknown> {
  return {
    views,
    downloads,
    note: STATS_NOTE
  };
}
