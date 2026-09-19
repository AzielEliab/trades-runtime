import {
  AUTHOR,
  CITE_SAME_AS,
  COMPATIBLE_AI_CLIENTS,
  CRAWL_USER_AGENTS,
  HONESTY,
  IDENTITY,
  LICENSE,
  PERSON_ID,
  PERSON_SAME_AS,
  PERSON_URL,
  PRODUCT,
  PRODUCT_TITLE,
  PUBLIC_ORIGIN,
  RELEASE_FILENAME,
  REPOSITORY,
  SITEMAP_ENTRIES,
  SOFTWARES_TAB,
  VERSION
} from "./identity.js";

export function robotsTxt(): string {
  const agents = CRAWL_USER_AGENTS.map((ua) => `User-agent: ${ua}\nAllow: /\n`).join("\n");
  return `# Trades-Runtime — open crawl for Google and AI search.
# Shadow-first local BYO runtime for HVAC, plumbing, electrical, sewer, and cross-trades.
# Author / identity: Aziel Eliab only. Person @id ${PERSON_ID}.
# Content-Signal opens search + AI input + AI train. No Disallow for GPTBot.
# Not an API orchestrator. Dual-surface: MCP/OpenAPI for agents; human UI + counted /download.

User-agent: *
Allow: /
Content-Signal: search=yes, ai-input=yes, ai-train=yes

${agents}
Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml
`;
}

export function sitemapXml(): string {
  const lastmod = "2026-09-19";
  const urls = SITEMAP_ENTRIES.map((entry) => {
    const loc = entry.path === "/" ? `${PUBLIC_ORIGIN}/` : `${PUBLIC_ORIGIN}${entry.path}`;
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function aiTxt(): string {
  return `# Trades-Runtime

## What this is

Trades-Runtime is a shadow-first, local-first TypeScript runtime for HVAC, plumbing, electrical, sewer, and cross-trades field businesses. Operators bring their own ServiceTitan and ProBooks dumps onto their own machines (BYO). Human authority always wins. Append-only receipts, FragGate-shaped inbound validation, shadow modes, mission board, and fulfillment — on the operator box, not as a hosted multi-tenant company OS.

Public name: Trades-Runtime (trades-runtime). Author / identity: Aziel Eliab only (Person @id ${PERSON_ID}).
Version: ${VERSION}. License: ${LICENSE}.
Worker: ${PUBLIC_ORIGIN}
GitHub: ${REPOSITORY}
Softwares tab: ${SOFTWARES_TAB}

## Honesty

- live_backends: false
- No ServiceTitan or ProBooks write-back on this Worker
- No tenant data stored on this Worker
- GitHub Pages: off
- Not aziel-runtime wholesale; not an API orchestrator; not FragGate-exec company OS
- ${HONESTY.product}

## How to use

1. Humans: open ${PUBLIC_ORIGIN}/ — complete UI + counted GET /download (${RELEASE_FILENAME})
2. Agents: POST ${PUBLIC_ORIGIN}/mcp (read-only health/stats/cite/skill) or OpenAPI at ${PUBLIC_ORIGIN}/openapi.json
3. Install: curl -fsSL ${PUBLIC_ORIGIN}/download -o ${RELEASE_FILENAME} && tar -xzf ${RELEASE_FILENAME}
4. Softwares card: ${SOFTWARES_TAB}

## Discovery

- robots.txt (full AI Allow + Content-Signal)
- sitemap.xml
- llms.txt / ai.txt / humans.txt
- cite.json / person.jsonld / graph.jsonld
- .well-known/mcp.json
- /v1/stats and /count (honest KV; human/bot fleet split)

## Compatible AI clients

${COMPATIBLE_AI_CLIENTS.map((name) => `- ${name}`).join("\n")}

## What this is not

- Not a hosted multi-tenant company OS
- Not a central ServiceTitan/ProBooks dump or write API
- Not merely an API orchestrator or software aggregator
- Not aziel-runtime / FragGate Softwares suite wholesale

Identity: Aziel Eliab only. Person @id ${PERSON_ID}.
`;
}

export function humansTxt(): string {
  return `/* TEAM */
Author: ${AUTHOR}
Identity: ${IDENTITY}
Person: ${PERSON_ID}

/* SITE */
Name: ${PRODUCT_TITLE}
Purpose: Shadow-first local BYO runtime for HVAC, plumbing, electrical, sewer, and cross-trades.
Human UI: ${PUBLIC_ORIGIN}/
Counted download: ${PUBLIC_ORIGIN}/download
Softwares: ${SOFTWARES_TAB}
Agents: ${PUBLIC_ORIGIN}/mcp · ${PUBLIC_ORIGIN}/openapi.json · ${PUBLIC_ORIGIN}/llms.txt
`;
}

export function personJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": PERSON_ID,
    name: AUTHOR,
    url: PERSON_URL,
    sameAs: [...PERSON_SAME_AS],
    disambiguatingDescription:
      "Living researcher and software designer. Machine cite only — not the two Levitical musicians Aziel and Eliab named together in 1 Chronicles 15:20."
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
        applicationCategory: "BusinessApplication",
        operatingSystem: "Cross-platform (Node.js >=20)",
        softwareVersion: VERSION,
        license: "https://www.apache.org/licenses/LICENSE-2.0",
        author: { "@id": PERSON_ID },
        url: `${PUBLIC_ORIGIN}/`,
        downloadUrl: `${PUBLIC_ORIGIN}/download`,
        codeRepository: REPOSITORY,
        description:
          "Shadow-first local BYO TypeScript runtime for HVAC, plumbing, electrical, sewer, and cross-trades. Operators bring their own ServiceTitan and ProBooks. Human authority wins. Not a hosted multi-tenant company OS. live_backends false.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }
      },
      {
        "@type": "WebSite",
        "@id": `${PUBLIC_ORIGIN}/#website`,
        name: PRODUCT_TITLE,
        url: `${PUBLIC_ORIGIN}/`,
        publisher: { "@id": PERSON_ID }
      }
    ]
  };
}

export function homepageJsonLd(): Record<string, unknown> {
  return graphJsonLd();
}

export function wellKnownMcp(): Record<string, unknown> {
  return {
    mcpServers: {
      [PRODUCT]: {
        url: `${PUBLIC_ORIGIN}/mcp`,
        type: "http"
      }
    },
    servers: [
      {
        name: PRODUCT,
        url: `${PUBLIC_ORIGIN}/mcp`,
        transport: "http",
        openapi: `${PUBLIC_ORIGIN}/openapi.json`,
        cite: `${PUBLIC_ORIGIN}/cite.json`,
        skill: `${PUBLIC_ORIGIN}/v1/skill`
      }
    ],
    openapi: `${PUBLIC_ORIGIN}/openapi.json`,
    cite: `${PUBLIC_ORIGIN}/cite.json`,
    llms: `${PUBLIC_ORIGIN}/llms.txt`,
    ai: `${PUBLIC_ORIGIN}/ai.txt`,
    author: AUTHOR,
    identity: IDENTITY,
    person_id: PERSON_ID,
    note: "Read-only product MCP (health, stats, cite, skill). Not FragGate-exec company OS. live_backends false."
  };
}
