import { citeBody, healthBody, json, jsonLd, llmsTxt, openApiSpec, skillMarkdown, statsBody, text } from "./catalog.js";
import {
  aiTxt,
  graphJsonLd,
  humansTxt,
  personJsonLd,
  robotsTxt,
  sitemapXml,
  wellKnownMcp
} from "./crawl.js";
import {
  classifyRequest,
  classificationMethodForRequest,
  incrementClassified,
  readFleetStats,
  shouldCountDownload,
  shouldCountHomepageView,
  type CountStore
} from "./counters.js";
import { RELEASE_FILENAME, VERSION } from "./identity.js";
import { renderLanding } from "./landing.js";
import { handleMcp } from "./mcp.js";
import { loadReleaseBytes, releaseHeaders } from "./release.js";

export interface Env {
  COUNTS: KVNamespace;
  ASSETS: Fetcher;
  PRODUCT_VERSION: string;
  RELEASE_FILENAME: string;
}

export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  }
};

export async function handleRequest(request: Request, env: Env, _ctx?: WorkerContext): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname === "/index.html" ? "/" : url.pathname;
  const kv = env.COUNTS as unknown as CountStore;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }

  if (pathname === "/v1/health") {
    const release = await peekRelease(env, request.url);
    return json(healthBody(release.ok, release.bytes));
  }

  if (pathname === "/v1/stats" || pathname === "/stats" || pathname === "/count") {
    return json(statsBody(await readFleetStats(kv, classificationMethodForRequest(request))));
  }

  if (pathname === "/cite.json") return json(citeBody());
  if (pathname === "/llms.txt") return text(llmsTxt(), "text/plain; charset=utf-8");
  if (pathname === "/ai.txt") return text(aiTxt(), "text/plain; charset=utf-8");
  if (pathname === "/humans.txt") return text(humansTxt(), "text/plain; charset=utf-8");
  if (pathname === "/robots.txt") return text(robotsTxt(), "text/plain; charset=utf-8");
  if (pathname === "/sitemap.xml") return text(sitemapXml(), "application/xml; charset=utf-8");
  if (pathname === "/person.jsonld") return jsonLd(personJsonLd());
  if (pathname === "/graph.jsonld") return jsonLd(graphJsonLd());
  if (pathname === "/.well-known/mcp.json") return json(wellKnownMcp());
  if (pathname === "/v1/skill" || pathname === "/skill.md") {
    return text(skillMarkdown(), "text/markdown; charset=utf-8");
  }
  if (pathname === "/openapi.json") return json(openApiSpec());
  if (pathname === "/mcp") {
    const release = await peekRelease(env, request.url);
    return handleMcp(request, kv, release.ok, release.bytes);
  }

  if (pathname === "/download") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method not allowed" }, 405);
    }
    const filename = env.RELEASE_FILENAME || RELEASE_FILENAME;
    const bytes = await loadReleaseBytes(env.ASSETS, filename, url.origin);
    if (!bytes) {
      return json(
        {
          error: "release tarball missing or not a verified gzip",
          filename,
          note: "downloads is not incremented"
        },
        503
      );
    }
    if (request.method === "HEAD" || !shouldCountDownload(request.method, pathname)) {
      return new Response(null, { status: 200, headers: releaseHeaders(filename, bytes.byteLength) });
    }
    try {
      await incrementClassified(kv, "downloads", classifyRequest(request).class);
    } catch (error) {
      console.error(JSON.stringify({ event: "download_count_failed", error: String(error) }));
    }
    return new Response(bytes, {
      status: 200,
      headers: releaseHeaders(filename, bytes.byteLength)
    });
  }

  if (pathname === "/") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method not allowed" }, 405);
    }
    if (request.method === "GET" && shouldCountHomepageView("GET", "/", request.headers.get("user-agent"))) {
      try {
        await incrementClassified(kv, "views", classifyRequest(request).class);
      } catch (error) {
        console.error(JSON.stringify({ event: "view_count_failed", error: String(error) }));
      }
    }
    const landingStats = await readFleetStats(kv, classificationMethodForRequest(request));
    const html = renderLanding(landingStats.views, landingStats.downloads);
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Product-Version": env.PRODUCT_VERSION || VERSION
      }
    });
  }

  return json({ error: "not found", product: "trades-runtime" }, 404);
}

async function peekRelease(env: Env, origin: string): Promise<{ ok: boolean; bytes: number | null }> {
  try {
    const filename = env.RELEASE_FILENAME || RELEASE_FILENAME;
    const bytes = await loadReleaseBytes(env.ASSETS, filename, origin);
    return bytes ? { ok: true, bytes: bytes.byteLength } : { ok: false, bytes: null };
  } catch {
    return { ok: false, bytes: null };
  }
}
