import { citeBody, healthBody, json, jsonLd, llmsTxt, openApiSpec, skillMarkdown, statsBody, text } from "./catalog.js";
import {
  claudeDesktopInstallDocument,
  cursorInstallDocument,
  mcpJsonDocument,
  oauthProtectedResource,
  serverCard,
  vscodeInstallDocument
} from "./connect.js";
import { suiteCardBody } from "./suite-card.js";
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
import { CONTENT_SIGNAL, INDEXNOW_KEY, RELEASE_FILENAME, VERSION } from "./identity.js";
import { renderConnect, renderDoors, renderLanding, renderLocalDesk } from "./landing.js";
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

const CORS_ALLOW_HEADERS = "Accept, Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Authorization";
const CORS_EXPOSE_HEADERS = "Mcp-Session-Id";

export async function handleRequest(request: Request, env: Env, ctx?: WorkerContext): Promise<Response> {
  return applyCors(stampContentSignal(await routeRequest(request, env, ctx)));
}

function applyCors(response: Response): Response {
  const headers = new Headers(response.headers);
  if (!headers.has("Access-Control-Allow-Origin")) {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  headers.set("Access-Control-Expose-Headers", CORS_EXPOSE_HEADERS);
  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return new Response(null, { status: response.status, statusText: response.statusText, headers });
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function stampContentSignal(response: Response): Response {
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("text/")) return response;
  const headers = new Headers(response.headers);
  headers.set("Content-Signal", CONTENT_SIGNAL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function routeRequest(request: Request, env: Env, _ctx?: WorkerContext): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname === "/index.html" ? "/" : url.pathname;
  const kv = env.COUNTS as unknown as CountStore;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
        "Access-Control-Expose-Headers": CORS_EXPOSE_HEADERS
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
  if (pathname === "/suite-card.json") return json(suiteCardBody());
  if (pathname === "/llms.txt") return text(llmsTxt(), "text/plain; charset=utf-8");
  if (pathname === "/ai.txt" || pathname === "/.well-known/ai.txt") return text(aiTxt(), "text/plain; charset=utf-8");
  if (pathname === `/${INDEXNOW_KEY}.txt` || pathname === "/.well-known/indexnow-key.txt") {
    return text(INDEXNOW_KEY, "text/plain; charset=utf-8");
  }
  if (pathname === "/humans.txt") return text(humansTxt(), "text/plain; charset=utf-8");
  if (pathname === "/robots.txt") return text(robotsTxt(), "text/plain; charset=utf-8");
  if (pathname === "/sitemap.xml") return text(sitemapXml(), "application/xml; charset=utf-8");
  if (pathname === "/person.jsonld") return jsonLd(personJsonLd());
  if (pathname === "/graph.jsonld") return jsonLd(graphJsonLd());
  if (pathname === "/.well-known/mcp.json") return json(wellKnownMcp());
  if (pathname === "/.well-known/mcp/server-card.json") {
    return new Response(JSON.stringify(serverCard(), null, 2) + "\n", {
      status: 200,
      headers: {
        "Content-Type": "application/mcp-server-card+json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
  if (
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname === "/.well-known/oauth-protected-resource/mcp"
  ) {
    return json(oauthProtectedResource());
  }
  if (pathname === "/mcp.json") return json(mcpJsonDocument());
  if (pathname === "/install/cursor.json") return json(cursorInstallDocument());
  if (pathname === "/install/vscode.json") return json(vscodeInstallDocument());
  if (pathname === "/install/claude-desktop.json") return json(claudeDesktopInstallDocument());
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

  if (pathname === "/connect") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method not allowed" }, 405);
    }
    return new Response(request.method === "HEAD" ? null : renderConnect(), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Product-Version": env.PRODUCT_VERSION || VERSION
      }
    });
  }

  if (pathname === "/doors") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method not allowed" }, 405);
    }
    return new Response(request.method === "HEAD" ? null : renderDoors(), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Product-Version": env.PRODUCT_VERSION || VERSION
      }
    });
  }

  if (pathname === "/local-desk") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method not allowed" }, 405);
    }
    return new Response(request.method === "HEAD" ? null : renderLocalDesk(), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Product-Version": env.PRODUCT_VERSION || VERSION
      }
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
