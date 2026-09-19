import {
  AUTHOR,
  CITE_SAME_AS,
  COMPATIBLE_AI_CLIENTS,
  HONESTY,
  IDENTITY,
  KEYWORDS,
  LICENSE,
  PERSON_ID,
  PERSON_URL,
  PRODUCT,
  PRODUCT_TITLE,
  PUBLIC_ORIGIN,
  RELEASE_FILENAME,
  REPOSITORY,
  SOFTWARES_TAB,
  VERSION
} from "./identity.js";
import { STATS_NOTE, type FleetStats } from "./counters.js";

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

export function jsonLd(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2) + "\n", {
    status,
    headers: {
      "Content-Type": "application/ld+json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=300" : "no-store",
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
    person_id: PERSON_ID,
    license: LICENSE,
    live_backends: false,
    hosted_company_os: false,
    pages: "off",
    repository: REPOSITORY,
    worker: PUBLIC_ORIGIN,
    download: `${PUBLIC_ORIGIN}/download`,
    health: `${PUBLIC_ORIGIN}/v1/health`,
    stats: `${PUBLIC_ORIGIN}/v1/stats`,
    count: `${PUBLIC_ORIGIN}/count`,
    openapi: `${PUBLIC_ORIGIN}/openapi.json`,
    mcp: `${PUBLIC_ORIGIN}/mcp`,
    skill: `${PUBLIC_ORIGIN}/v1/skill`,
    llms: `${PUBLIC_ORIGIN}/llms.txt`,
    ai: `${PUBLIC_ORIGIN}/ai.txt`,
    humans: `${PUBLIC_ORIGIN}/humans.txt`,
    robots: `${PUBLIC_ORIGIN}/robots.txt`,
    sitemap: `${PUBLIC_ORIGIN}/sitemap.xml`,
    person_jsonld: `${PUBLIC_ORIGIN}/person.jsonld`,
    graph_jsonld: `${PUBLIC_ORIGIN}/graph.jsonld`,
    mcp_discovery: `${PUBLIC_ORIGIN}/.well-known/mcp.json`,
    software_tab: SOFTWARES_TAB,
    compatible_ai_clients: [...COMPATIBLE_AI_CLIENTS],
    sameAs: [...CITE_SAME_AS],
    keywords: [...KEYWORDS],
    honesty: HONESTY.product,
    counters: HONESTY.counters,
    how_to_cite: `Eliab, Aziel. (2026). ${PRODUCT_TITLE} ${VERSION} [Software]. ${LICENSE}. ${REPOSITORY} · ${PUBLIC_ORIGIN}/`
  };
}

export function llmsTxt(): string {
  return `# Trades-Runtime
> Shadow-first local BYO runtime for HVAC, plumbing, electrical, sewer, and cross-trades.
> Author / identity: Aziel Eliab only. Person @id ${PERSON_ID}
> Version: ${VERSION}
> License: ${LICENSE}
> Worker: ${PUBLIC_ORIGIN}

${HONESTY.product}

## Dual surface
- Humans: ${PUBLIC_ORIGIN}/ (UI) + counted ${PUBLIC_ORIGIN}/download
- Agents: POST ${PUBLIC_ORIGIN}/mcp · ${PUBLIC_ORIGIN}/openapi.json · ${PUBLIC_ORIGIN}/llms.txt · ${PUBLIC_ORIGIN}/ai.txt

## Discovery (Growth-ON)
- robots.txt — full AI Allow + Content-Signal (search/ai-input/ai-train)
- sitemap.xml
- cite.json · person.jsonld · graph.jsonld
- .well-known/mcp.json
- Softwares tab: ${SOFTWARES_TAB}
- Stats: ${PUBLIC_ORIGIN}/v1/stats · ${PUBLIC_ORIGIN}/count

## Install
\`\`\`
curl -fsSL ${PUBLIC_ORIGIN}/download -o ${RELEASE_FILENAME}
tar -xzf ${RELEASE_FILENAME}
\`\`\`

## AI clients
${COMPATIBLE_AI_CLIENTS.map((name) => `- ${name}`).join("\n")}
`;
}

export function skillMarkdown(): string {
  return `# Trades-Runtime skill

Product: Trades-Runtime ${VERSION}
Author / identity: Aziel Eliab only
Person @id: ${PERSON_ID}
License: ${LICENSE}
Worker: ${PUBLIC_ORIGIN}

## What it is

Local-first BYO TypeScript runtime for HVAC, plumbing, electrical, sewer, and cross-trades.
People bring their own ServiceTitan and ProBooks. Dual surface: human UI + counted download.
Thin OpenAPI/MCP for health, stats, cite, and this skill.

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
      contact: { name: AUTHOR, url: PERSON_URL },
      license: { name: LICENSE },
      "x-identity": IDENTITY,
      "x-person-id": PERSON_ID,
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
      "/v1/stats": {
        get: {
          summary: "Honest KV views/downloads + human/bot fleet split. Does not increment counters."
        }
      },
      "/stats": { get: { summary: "Alias of /v1/stats." } },
      "/count": { get: { summary: "Alias of /v1/stats (fleet download-tracker shape)." } },
      "/cite.json": { get: { summary: "Public cite. Does not increment counters." } },
      "/llms.txt": { get: { summary: "LLM-oriented product text." } },
      "/ai.txt": { get: { summary: "Honest trades product lead for agents and crawlers." } },
      "/humans.txt": { get: { summary: "Short human pointer to / and /download." } },
      "/robots.txt": { get: { summary: "Open crawl Allow list + Content-Signal." } },
      "/sitemap.xml": { get: { summary: "Absolute URLs for this Worker." } },
      "/person.jsonld": { get: { summary: "Person JSON-LD. Machine 15:20 disambiguation. No HTML chrome." } },
      "/graph.jsonld": { get: { summary: "SoftwareApplication + WebSite + Person JSON-LD." } },
      "/.well-known/mcp.json": { get: { summary: "MCP discovery for POST /mcp + OpenAPI." } },
      "/v1/skill": { get: { summary: "Agent skill markdown." } },
      "/openapi.json": { get: { summary: "This OpenAPI document." } },
      "/mcp": {
        get: { summary: "MCP transport note. Use POST for JSON-RPC." },
        post: {
          summary: "Read-only MCP JSON-RPC (initialize, tools/list, tools/call)",
          description: "Tools: health, stats, cite, skill. Public, no OAuth. Does not increment counters."
        }
      }
    }
  };
}

export function statsBody(stats: FleetStats): Record<string, unknown> {
  return { ...stats };
}
