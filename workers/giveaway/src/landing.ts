import { homepageJsonLd } from "./crawl.js";
import {
  AUTHOR,
  COMPATIBLE_AI_CLIENTS,
  GLAMA_LISTING_NOTE,
  HONESTY,
  LICENSE,
  OG_DESCRIPTION,
  OG_TITLE,
  PAGE_DESCRIPTION,
  PAGE_TITLE,
  PRODUCT_LABEL,
  PRODUCT_TITLE,
  PUBLIC_ORIGIN,
  RELEASE_FILENAME,
  REPOSITORY,
  VERSION
} from "./identity.js";

const GIVEAWAY_CSS = `
    :root {
      --bg: #121410;
      --bg-raised: #1a1d17;
      --bg-inset: #0d0f0c;
      --ink: #ece7dc;
      --muted: #a39b8c;
      --line: #2c3128;
      --accent: #c47a3a;
      --accent-ink: #1a1208;
      --good: #8fb56a;
      --display: Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif;
      --sans: "Segoe UI", Helvetica, Arial, sans-serif;
      --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    html { overflow-x: clip; max-width: 100%; }
    body {
      margin: 0;
      max-width: 100%;
      overflow-x: clip;
      min-height: 100vh;
      font-family: var(--sans);
      background: radial-gradient(1200px 500px at 10% -10%, rgba(196, 122, 58, 0.12), transparent 50%), var(--bg);
      color: var(--ink);
      line-height: 1.55;
    }
    a { color: var(--accent); }
    .skip {
      position: absolute;
      left: -999px;
      top: auto;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
    .skip:focus {
      position: static;
      width: auto;
      height: auto;
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      margin: max(0.4rem, env(safe-area-inset-top)) 0.6rem 0;
      padding: 0.4rem 0.8rem;
      background: var(--accent);
      color: var(--accent-ink);
    }
    .wrap {
      max-width: 880px;
      margin: 0 auto;
      min-width: 0;
      padding:
        max(1.4rem, env(safe-area-inset-top))
        max(1.15rem, env(safe-area-inset-right))
        max(2.6rem, calc(1.6rem + env(safe-area-inset-bottom)))
        max(1.15rem, env(safe-area-inset-left));
    }
    .kicker { letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.78rem; color: var(--muted); overflow-wrap: anywhere; }
    h1 { font-family: var(--display); font-weight: 500; font-size: clamp(1.8rem, 4vw, 2.6rem); line-height: 1.15; overflow-wrap: anywhere; }
    h2 { font-family: var(--display); font-weight: 500; margin-top: 0; }
    .lede { font-size: 1.08rem; color: var(--muted); overflow-wrap: anywhere; }
    .panel {
      background: var(--bg-raised);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 1.1rem 1.2rem;
      margin: 1rem 0;
      min-width: 0;
      max-width: 100%;
    }
    .notice { color: var(--muted); overflow-wrap: anywhere; }
    .counts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
    .count { background: var(--bg-inset); border-radius: 12px; padding: 1rem; min-width: 0; }
    .count b { display: block; font-family: var(--mono); font-size: 1.8rem; color: var(--good); }
    .human-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0 0 1.2rem;
      min-width: 0;
      max-width: 100%;
    }
    .human-nav a, .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0.55rem 0.95rem;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 700;
      touch-action: manipulation;
      max-width: 100%;
      overflow-wrap: anywhere;
      text-align: center;
    }
    .nav-primary, .btn {
      background: var(--accent);
      color: var(--accent-ink);
    }
    .human-nav a:not(.nav-primary):not(.nav-secondary) {
      background: var(--bg-inset);
      color: var(--ink);
      border: 1px solid var(--line);
      font-weight: 600;
    }
    .nav-secondary, .btn-quiet {
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--line);
      font-weight: 600;
    }
    pre, code { max-width: 100%; }
    pre {
      background: var(--bg-inset);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.9rem 1rem;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      font-family: var(--mono);
      font-size: 0.86rem;
    }
    code { overflow-wrap: anywhere; }
    .badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 0.15rem 0.6rem; margin: 0.15rem; font-size: 0.8rem; color: var(--muted); }
    footer { color: var(--muted); margin-top: 2.5rem; font-size: 0.92rem; overflow-wrap: anywhere; }
    input, select, textarea { font-size: 1rem; min-height: 44px; max-width: 100%; }
    @media (max-width: 40rem) {
      .counts { grid-template-columns: minmax(0, 1fr); }
      .wrap { padding-top: max(1.1rem, env(safe-area-inset-top)); }
    }
`;

function humanNav(current: "home" | "desk"): string {
  const onDesk = current === "desk";
  return `<a class="skip" href="${onDesk ? "#notes" : "#workspace"}">Skip to ${onDesk ? "local-desk notes" : "the Worker UI"}</a>
  <nav class="human-nav" aria-label="Human giveaway">
    <a class="nav-primary" href="${onDesk ? "/#workspace" : "#workspace"}">Use on Worker</a>
    <a class="nav-primary" href="${onDesk ? "#notes" : "/local-desk"}"${onDesk ? ' aria-current="page"' : ""}>Open local-desk notes</a>
    <a href="${onDesk ? "/#mcp" : "#mcp"}">Connect MCP</a>
    <a href="${onDesk ? "/#cite" : "#cite"}">Cite / docs</a>
    <a class="nav-secondary" href="/download">Optional pack</a>
  </nav>`;
}

export function renderLanding(views: number, downloads: number): string {
  const clients = COMPATIBLE_AI_CLIENTS.map((name) => `<li>${escapeHtml(name)}</li>`).join("");
  const jsonLd = JSON.stringify(homepageJsonLd());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#121410">
  <meta name="author" content="${escapeHtml(AUTHOR)}">
  <title>${escapeHtml(PAGE_TITLE)}</title>
  <meta name="description" content="${escapeHtml(PAGE_DESCRIPTION)}">
  <link rel="canonical" href="${escapeHtml(PUBLIC_ORIGIN)}/">
  <link rel="sitemap" type="application/xml" href="/sitemap.xml">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escapeHtml(PRODUCT_TITLE)}">
  <meta property="og:title" content="${escapeHtml(OG_TITLE)}">
  <meta property="og:description" content="${escapeHtml(OG_DESCRIPTION)}">
  <meta property="og:url" content="${escapeHtml(PUBLIC_ORIGIN)}/">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(OG_TITLE)}">
  <meta name="twitter:description" content="${escapeHtml(OG_DESCRIPTION)}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>${GIVEAWAY_CSS}</style>
</head>
<body>
  <main class="wrap">
    <p class="kicker">Public giveaway · v${escapeHtml(VERSION)} · ${escapeHtml(AUTHOR)} · Apache-2.0</p>
    ${humanNav("home")}
    <h1>Use ${escapeHtml(PRODUCT_TITLE)} on this VibeLock Worker.</h1>
    <p class="lede">
      Humans can use this giveaway Worker UI on this VibeLock host (browser / PWA) without downloading first.
      Agents use OpenAPI and MCP.
      Trades-Runtime stays local-first: the operator desk with your own ServiceTitan and ProBooks still installs on your machine from the optional pack.
      live_backends is false. This Worker does not load company jobs.
    </p>
    <p>
      <span class="badge">Aziel Eliab only</span>
      <span class="badge">BYO inbound</span>
      <span class="badge">live_backends false</span>
      <span class="badge">pilot_started false</span>
      <span class="badge">${escapeHtml(PRODUCT_LABEL)}</span>
      <span class="badge">${escapeHtml(LICENSE)}</span>
    </p>

    <section class="panel" id="softwares">
      <h2>Local Softwares</h2>
      <p>
        ${escapeHtml(PRODUCT_LABEL)} is the installable product on your machine.
        This page is the VibeLock Worker UI. You can use it without downloading first.
        The plain command list is help, softwares, version, and health.
        pilot_started is false. live_backends is false.
        Field 1.0 is a later track.
      </p>
      <pre>npx tsx src/cli.ts help
npx tsx src/cli.ts softwares
npx tsx src/cli.ts version
npx tsx src/cli.ts health</pre>
      <p class="notice">Suite shell entry for this separate package: <a href="/suite-card.json">/suite-card.json</a>.</p>
    </section>

    <section id="workspace">
      <div class="panel" id="honesty">
        <h2>Honesty</h2>
        <p>${escapeHtml(HONESTY.product)}</p>
        <p class="notice">${escapeHtml(GLAMA_LISTING_NOTE)}</p>
        <p class="notice">${escapeHtml(HONESTY.counters)}</p>
        <ul>
          <li>No central ServiceTitan dump ingestion</li>
          <li>No write API to ServiceTitan or ProBooks</li>
          <li>No tenant store and no phone-home</li>
          <li>No GitHub Pages surface</li>
          <li>No production company-OS claim</li>
        </ul>
      </div>

      <div class="counts" id="stats">
        <div class="count"><span>Views</span><b id="views">${views}</b><small>GET / HTML 200 only</small></div>
        <div class="count"><span>Downloads</span><b id="downloads">${downloads}</b><small>GET /download 200 only</small></div>
      </div>

      <div class="panel" id="mcp">
        <h2>Connect MCP</h2>
        <p>Thin read-only surface for agents: <a href="/openapi.json">/openapi.json</a> and <a href="/mcp"><code>POST /mcp</code></a> (health, stats, cite, skill). Public, no OAuth. Discover at <a href="/.well-known/mcp.json"><code>/.well-known/mcp.json</code></a>.</p>
        <ul>${clients}</ul>
      </div>

      <div class="panel" id="skill">
        <h2>Skill</h2>
        <p>The agent skill is readable here: <a href="/v1/skill">/v1/skill</a>. It describes the local-first runtime, the counted pack, and the local desk command. It does not run company jobs on this Worker.</p>
      </div>

      <div class="panel" id="cite">
        <h2>Cite / docs</h2>
        <p>
          <a href="/v1/health">/v1/health</a> ·
          <a href="/v1/stats">/v1/stats</a> ·
          <a href="/count">/count</a> ·
          <a href="/cite.json">/cite.json</a> ·
          <a href="/llms.txt">/llms.txt</a> ·
          <a href="/ai.txt">/ai.txt</a> ·
          <a href="/humans.txt">/humans.txt</a> ·
          <a href="/robots.txt">/robots.txt</a> ·
          <a href="/sitemap.xml">/sitemap.xml</a> ·
          <a href="/v1/skill">/v1/skill</a> ·
          <a href="${escapeHtml(REPOSITORY)}">GitHub (may stay private)</a>
        </p>
      </div>
    </section>

    <section id="pack">
      <h2>Optional pack</h2>
      <p>
        The counted tarball is optional. Download it when you want the operator desk on your own machine.
        <code>GET /download</code> stays the real pack and increments only after a verified gzip 200.
      </p>
      <p>
        <a class="btn btn-quiet" href="/download">Download ${escapeHtml(RELEASE_FILENAME)}</a>
      </p>
      <p class="notice">Counted once after the gzip tarball is verified and the 200 response starts. Failed downloads do not increment.</p>
      <pre>curl -fsSL ${escapeHtml(PUBLIC_ORIGIN)}/download -o ${escapeHtml(RELEASE_FILENAME)}
tar -xzf ${escapeHtml(RELEASE_FILENAME)}
cd package
npm install
npm test
npm run demo</pre>
      <p>
        The archive is the npm-packable source (src, docs, tests, README, IDENTITY, LICENSE).
        Implementer specs stay in the private repo and are not dumped here.
        Credentials stay on your machine. Place your own exports under
        <code>data/inbound/servicetitan/</code>, <code>data/inbound/probooks/</code>,
        and <code>data/inbound/trades-app/</code>.
      </p>
    </section>

    <h2>Human desk (your machine)</h2>
    <p>
      After install, the operator desk is a local page: charts, metrics, alerts, scores, call reasons, and a morning huddle, with a live refresh from that machine's inbound folders.
      This Worker does not host that desk, the huddle, or tenant metrics.
    </p>
    <pre>npx tsx src/cli.ts desk
# http://127.0.0.1:4174/</pre>
    <p><a class="btn" href="/local-desk">Open local-desk notes</a></p>
    <p class="notice">Install notes only: <a href="/local-desk">/local-desk</a>. Option C pilot is not started. Option D is not started.</p>
  </main>
  <footer class="wrap">© ${new Date().getUTCFullYear()} ${escapeHtml(AUTHOR)} · ${escapeHtml(PRODUCT_TITLE)} ${escapeHtml(VERSION)} · ${escapeHtml(LICENSE)} · identity ${escapeHtml(AUTHOR)} only</footer>
  <script>
    fetch("/v1/stats").then((r) => r.json()).then((s) => {
      if (typeof s.views === "number") document.getElementById("views").textContent = String(s.views);
      if (typeof s.downloads === "number") document.getElementById("downloads").textContent = String(s.downloads);
    }).catch(() => {});
  </script>
</body>
</html>`;
}

export function renderLocalDesk(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#121410">
  <title>Local operator desk · Trades-Runtime</title>
  <meta name="description" content="Install notes for the local Trades-Runtime operator desk. Author: Aziel Eliab. This Worker does not host tenant metrics.">
  <meta name="author" content="${escapeHtml(AUTHOR)}">
  <link rel="canonical" href="${escapeHtml(PUBLIC_ORIGIN)}/local-desk">
  <style>${GIVEAWAY_CSS}</style>
</head>
<body>
  <main class="wrap">
    <p class="kicker">Public giveaway · v${escapeHtml(VERSION)} · ${escapeHtml(AUTHOR)} · install notes only</p>
    ${humanNav("desk")}
    <h1 id="notes">The operator desk runs on your machine.</h1>
    <p>This page cites the local install path. It does not load company jobs, scores, or tenant metrics. live_backends is false. The giveaway UI on this VibeLock Worker is usable in the browser without this pack.</p>
    <p class="notice">Optional pack. Counted <code>GET /download</code> is the tarball. Failed downloads do not increment.</p>
    <pre>curl -fsSL ${escapeHtml(PUBLIC_ORIGIN)}/download -o ${escapeHtml(RELEASE_FILENAME)}
tar -xzf ${escapeHtml(RELEASE_FILENAME)}
cd package
npm install
npx tsx src/cli.ts desk</pre>
    <p>Drop your own exports in <code>data/inbound/servicetitan/</code>, <code>data/inbound/probooks/</code>, or <code>data/inbound/trades-app/</code>. The desk binds to 127.0.0.1:4174 and labels synthetic demo data until a local file is admitted. Local alert rules stay on that machine. Copy <code>data/runtime/alerts.json.example</code>. Webhook hooks accept loopback only. This page does not receive them.</p>
    <p class="notice">On that machine the desk can switch a light or dark theme and open a printable snapshot. Both stay local. The lane view counts slots or a known trade token. It does not draw a map. Call filters, <code>/api/calls/week.json</code>, and <code>/api/huddle</code> also stay on that machine. This page still does not load company jobs.</p>
    <p>Option C prep on that machine is <code>npm run pilot:prep</code>. The receipt keeps <code>pilot_started false</code>. It does not start a company pilot, and this Worker does not run that prep.</p>
    <p class="notice">ServiceTitan, ProBooks, and trades-app writes stay refused. Option C pilot is not started. Option D is not started.</p>
    <p><a class="btn" href="/#workspace">Use on Worker</a></p>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
