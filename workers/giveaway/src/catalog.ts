import {
  AUTHOR,
  COMPATIBLE_AI_CLIENTS,
  CRAWL_USER_AGENTS,
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
  SAME_AS,
  SISTER_CORPUS,
  SISTER_GODLOCK,
  SITEMAP_PATHS,
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
    person_id: PERSON_ID,
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
    "@id": PERSON_ID,
    license: LICENSE,
    live_backends: false,
    pages: "off",
    hosted_company_os: false,
    tenant_data: false,
    servicetitan_write: false,
    probooks_write: false,
    glama_listing: false,
    doi: null,
    chrome_15_20: false,
    repository: REPOSITORY,
    worker: PUBLIC_ORIGIN,
    download: `${PUBLIC_ORIGIN}/download`,
    health: `${PUBLIC_ORIGIN}/v1/health`,
    stats: `${PUBLIC_ORIGIN}/v1/stats`,
    count: `${PUBLIC_ORIGIN}/count`,
    openapi: `${PUBLIC_ORIGIN}/openapi.json`,
    mcp: `${PUBLIC_ORIGIN}/mcp`,
    mcp_discovery: `${PUBLIC_ORIGIN}/.well-known/mcp.json`,
    skill: `${PUBLIC_ORIGIN}/v1/skill`,
    llms: `${PUBLIC_ORIGIN}/llms.txt`,
    ai: `${PUBLIC_ORIGIN}/ai.txt`,
    humans: `${PUBLIC_ORIGIN}/humans.txt`,
    robots: `${PUBLIC_ORIGIN}/robots.txt`,
    sitemap: `${PUBLIC_ORIGIN}/sitemap.xml`,
    person_jsonld: `${PUBLIC_ORIGIN}/person.jsonld`,
    graph_jsonld: `${PUBLIC_ORIGIN}/graph.jsonld`,
    software_tab: SOFTWARES_TAB,
    sameAs: [...SAME_AS],
    keywords: [...KEYWORDS],
    how_to_cite: `${AUTHOR}, ${PRODUCT_TITLE} ${VERSION}, ${PUBLIC_ORIGIN}/cite.json (Person @id ${PERSON_ID})`,
    compatible_ai_clients: [...COMPATIBLE_AI_CLIENTS],
    honesty: HONESTY.product,
    honesty_flags: {
      live_backends: false,
      pages: "off",
      hosted_company_os: false,
      tenant_data: false,
      servicetitan_write: false,
      probooks_write: false,
      fraggate_exec_company_os: false,
      glama_listing: false,
      doi: null
    },
    counters: HONESTY.counters,
    sister_hubs: {
      azieleliab: PERSON_URL,
      corpus: SISTER_CORPUS,
      godlock: SISTER_GODLOCK,
      note: "Sister hubs. This Worker is trades-runtime only. No hub HTML is hosted here."
    },
    not: [
      "Not a hosted multi-tenant company OS.",
      "Not a ServiceTitan or ProBooks write API.",
      "Not a central dump or hosted uploader.",
      "Not aziel-runtime wholesale.",
      "Not a FragGate-exec company OS.",
      "Not GitHub Pages.",
      "Not a Glama listing.",
      "Not a DOI."
    ]
  };
}

export function llmsTxt(): string {
  return `# Trades-Runtime

> Shadow-first local BYO TypeScript runtime for HVAC, plumbing, electrical, sewer, and cross-trades.
> Author / identity: Aziel Eliab only. Person @id ${PERSON_ID}
> Version: ${VERSION}
> License: ${LICENSE}
> Public Worker: ${PUBLIC_ORIGIN}
> live_backends: false. Pages: off. Not a hosted company OS.

${HONESTY.product}

Dual surface: humans use GET / plus counted GET /download. Agents use GET /openapi.json and POST /mcp (health, stats, cite, skill). Public, no OAuth. Not a FragGate engine catalog.

## Get the software

- Human UI: GET /
- Counted tarball: GET /download
- Stats / fleet count: GET /v1/stats · GET /count
- Health: GET /v1/health
- Cite: GET /cite.json
- Skill: GET /v1/skill
- OpenAPI: GET /openapi.json
- MCP (read-only POST): POST /mcp
- MCP discovery: GET /.well-known/mcp.json
- AI lead: GET /ai.txt
- Humans pointer: GET /humans.txt
- Robots: GET /robots.txt
- Sitemap: GET /sitemap.xml
- Person JSON-LD: GET /person.jsonld
- Graph JSON-LD: GET /graph.jsonld
- Softwares tab (sister hub, not this Worker): ${SOFTWARES_TAB}

## Honesty

- live_backends false
- pages off
- No tenant data on this Worker
- No ServiceTitan or ProBooks write-back
- No FragGate-exec company OS claim
- No invented Glama listing or DOI
- Counters: ${HONESTY.counters}

## Install

\`\`\`
curl -fsSL ${PUBLIC_ORIGIN}/download -o ${RELEASE_FILENAME}
tar -xzf ${RELEASE_FILENAME}
cd package
npm install
npm test
\`\`\`

Bring your own ServiceTitan and ProBooks to your local machine. This Worker does not store tenant data.

## Identity

Author: ${AUTHOR}
Identity: ${IDENTITY} only
Person @id: ${PERSON_ID}
sameAs: ${SAME_AS.join(" · ")}

## AI clients

${COMPATIBLE_AI_CLIENTS.map((name) => `- ${name}`).join("\n")}
`;
}

export function aiTxt(): string {
  return `# Trades-Runtime

## What this is

Trades-Runtime is a shadow-first local BYO TypeScript runtime for HVAC, plumbing, electrical, sewer, and cross-trades field-service companies. Operators bring their own ServiceTitan and their own ProBooks onto their own machine. Human authority wins: authorized human decisions stay operational. live_backends is false. This public Worker is a dual-surface giveaway — a complete human UI plus a counted Apache-2.0 download. It is not a hosted company OS, not a tenant host, and not a FragGate-exec catalog.

Product: Trades-Runtime (trades-runtime)
Author / identity: Aziel Eliab only
Person @id: ${PERSON_ID}
Version: ${VERSION}
License: ${LICENSE}
Worker: ${PUBLIC_ORIGIN}
Repository: ${REPOSITORY}

## How agents use this Worker

1. Discovery: GET ${PUBLIC_ORIGIN}/.well-known/mcp.json
2. OpenAPI: GET ${PUBLIC_ORIGIN}/openapi.json
3. MCP: POST ${PUBLIC_ORIGIN}/mcp (initialize, tools/list, tools/call)
   Tools: trades_runtime_health, trades_runtime_stats, trades_runtime_cite, trades_runtime_skill
4. Cite: GET ${PUBLIC_ORIGIN}/cite.json
5. Skill: GET ${PUBLIC_ORIGIN}/v1/skill
6. Humans get the UI at GET / and the counted tarball at GET /download

Public, no OAuth. Read-only. Does not increment view/download counters.

## Dual surface

- Humans: Worker landing HTML + counted /download
- Agents / crawlers / scrapers / Google Search AI: /ai.txt, /llms.txt, /cite.json, /openapi.json, POST /mcp, /sitemap.xml, /robots.txt, /person.jsonld, /graph.jsonld

## What this is not

- Not a node-meshed orchestration suite
- Not merely an API orchestrator
- Not a FragGate-exec company OS
- Not a hosted multi-tenant company OS
- Not a ServiceTitan or ProBooks write API
- Not a central dump or hosted uploader
- Not aziel-runtime wholesale
- Not GitHub Pages (pages off)
- Not a Glama listing
- Not a DOI

## Honesty flags

live_backends: false
pages: off
hosted_company_os: false
tenant_data: false
servicetitan_write: false
probooks_write: false
glama_listing: false
doi: null

${HONESTY.product}

## Identity

Author: Aziel Eliab
Identity: Aziel Eliab only
Person @id: ${PERSON_ID}
sameAs:
${SAME_AS.map((url) => `- ${url}`).join("\n")}

Sister hubs (not hosted on this Worker): ${PERSON_URL} · ${SISTER_CORPUS} · ${SISTER_GODLOCK}
Softwares tab: ${SOFTWARES_TAB}

## Compatible AI clients

${COMPATIBLE_AI_CLIENTS.map((name) => `- ${name}`).join("\n")}

## Cite

${AUTHOR}, ${PRODUCT_TITLE} ${VERSION}, ${PUBLIC_ORIGIN}/cite.json (Person @id ${PERSON_ID})
`;
}

export function humansTxt(): string {
  return `/* TEAM */
Author: ${AUTHOR}
Identity: ${IDENTITY} only
Person: ${PERSON_ID}
Site: ${PERSON_URL}

/* SITE */
Product: ${PRODUCT_TITLE}
Human UI: ${PUBLIC_ORIGIN}/
Counted download: ${PUBLIC_ORIGIN}/download
Cite: ${PUBLIC_ORIGIN}/cite.json
License: ${LICENSE}
Note: Local-first BYO HVAC / plumbing / electrical / sewer / cross-trades runtime. live_backends false. Pages off.
`;
}

export function robotsTxt(): string {
  const agents = CRAWL_USER_AGENTS.map((ua) => `User-agent: ${ua}\nAllow: /`).join("\n");
  return `# Trades-Runtime — open crawl for Google and AI search.
# Shadow-first local BYO runtime for HVAC, plumbing, electrical, sewer, and cross-trades.
# Author: Aziel Eliab. Person @id ${PERSON_ID}
# Content-Signal opens search + AI input + AI train. No Disallow for GPTBot.
# This Worker is a human UI + counted download + thin OpenAPI/MCP. Not a hosted company OS.
# Sitemap lists this Worker host only.

User-agent: *
Allow: /
Content-Signal: search=yes, ai-input=yes, ai-train=yes

${agents}

Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml
Sitemap: ${PUBLIC_ORIGIN}/sitemap-index.xml
`;
}

export function sitemapXml(): string {
  const lastmod = "2026-09-19";
  const urls = SITEMAP_PATHS.map((path) => {
    const loc = path === "/" ? `${PUBLIC_ORIGIN}/` : `${PUBLIC_ORIGIN}${path}`;
    const priority = path === "/" || path === "/download" ? "1.0" : "0.8";
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function sitemapIndexXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${PUBLIC_ORIGIN}/sitemap.xml</loc>
    <lastmod>2026-09-19</lastmod>
  </sitemap>
</sitemapindex>
`;
}

export function personJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": PERSON_ID,
    name: AUTHOR,
    identifier: IDENTITY,
    url: PERSON_URL,
    sameAs: [...SAME_AS],
    disambiguatingDescription:
      "Living software author Aziel Eliab (one person). Machine disambiguation only: not the two Levitical musicians named together in 1 Chronicles 15:20. Prefer https://www.azieleliab.com/#aziel."
  };
}

export function graphJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      personJsonLd(),
      {
        "@type": "SoftwareApplication",
        "@id": `${PUBLIC_ORIGIN}/#software`,
        name: PRODUCT_TITLE,
        alternateName: PRODUCT,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Local TypeScript / Node.js",
        softwareVersion: VERSION,
        license: "https://www.apache.org/licenses/LICENSE-2.0",
        url: `${PUBLIC_ORIGIN}/`,
        downloadUrl: `${PUBLIC_ORIGIN}/download`,
        author: { "@id": PERSON_ID },
        creator: { "@id": PERSON_ID },
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        keywords: KEYWORDS.join(", "),
        description:
          "Shadow-first local BYO TypeScript runtime for HVAC, plumbing, electrical, sewer, and cross-trades. Operators bring ServiceTitan and ProBooks. live_backends false. Not a hosted company OS."
      },
      {
        "@type": "WebSite",
        "@id": `${PUBLIC_ORIGIN}/#website`,
        name: PRODUCT_TITLE,
        url: `${PUBLIC_ORIGIN}/`,
        description:
          "Public giveaway Worker for Trades-Runtime. Human UI + counted download. Thin OpenAPI/MCP. Not an API orchestrator.",
        author: { "@id": PERSON_ID },
        publisher: { "@id": PERSON_ID }
      }
    ]
  };
}

export function homepageJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": PERSON_ID,
        name: AUTHOR,
        identifier: IDENTITY,
        url: PERSON_URL,
        sameAs: [...SAME_AS]
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${PUBLIC_ORIGIN}/#software`,
        name: PRODUCT_TITLE,
        softwareVersion: VERSION,
        url: `${PUBLIC_ORIGIN}/`,
        downloadUrl: `${PUBLIC_ORIGIN}/download`,
        author: { "@id": PERSON_ID },
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
      },
      {
        "@type": "WebSite",
        "@id": `${PUBLIC_ORIGIN}/#website`,
        name: PRODUCT_TITLE,
        url: `${PUBLIC_ORIGIN}/`,
        author: { "@id": PERSON_ID }
      }
    ]
  };
}

export function wellKnownMcp(): Record<string, unknown> {
  return {
    name: PRODUCT,
    title: PRODUCT_TITLE,
    version: VERSION,
    author: AUTHOR,
    identity: IDENTITY,
    person_id: PERSON_ID,
    transport: "JSON-RPC over HTTP POST",
    url: `${PUBLIC_ORIGIN}/mcp`,
    openapi: `${PUBLIC_ORIGIN}/openapi.json`,
    auth: "public, no OAuth",
    live_backends: false,
    tools: [
      "trades_runtime_health",
      "trades_runtime_stats",
      "trades_runtime_cite",
      "trades_runtime_skill"
    ],
    mcpServers: {
      "trades-runtime": {
        type: "http",
        url: `${PUBLIC_ORIGIN}/mcp`
      }
    }
  };
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
      "/sitemap-index.xml": { get: { summary: "Sitemap index pointing at this Worker sitemap.xml." } },
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
