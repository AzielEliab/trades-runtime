import {
  AUTHOR,
  COMPATIBLE_AI_CLIENTS,
  HONESTY,
  LICENSE,
  PRODUCT_TITLE,
  PUBLIC_ORIGIN,
  RELEASE_FILENAME,
  REPOSITORY,
  VERSION
} from "./identity.js";

export function renderLanding(views: number, downloads: number): string {
  const clients = COMPATIBLE_AI_CLIENTS.map((name) => `<li>${escapeHtml(name)}</li>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="author" content="${escapeHtml(AUTHOR)}">
  <title>${escapeHtml(PRODUCT_TITLE)} · public giveaway · ${escapeHtml(VERSION)}</title>
  <meta name="description" content="Trades-Runtime is a local-first BYO TypeScript runtime for field trades. Apache-2.0. Author: Aziel Eliab only. Not a hosted company OS.">
  <style>
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
    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--sans);
      background: radial-gradient(1200px 500px at 10% -10%, rgba(196, 122, 58, 0.12), transparent 50%), var(--bg);
      color: var(--ink);
      line-height: 1.55;
    }
    a { color: var(--accent); }
    .wrap { max-width: 880px; margin: 0 auto; padding: 2.2rem 1.2rem 4rem; }
    .kicker { letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.78rem; color: var(--muted); }
    h1 { font-family: var(--display); font-weight: 500; font-size: clamp(1.8rem, 4vw, 2.6rem); line-height: 1.15; }
    h2 { font-family: var(--display); font-weight: 500; margin-top: 2.2rem; }
    .lede { font-size: 1.08rem; color: var(--muted); }
    .panel {
      background: var(--bg-raised);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 1.1rem 1.2rem;
      margin: 1rem 0;
    }
    .notice { color: var(--muted); }
    .counts { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
    .count { background: var(--bg-inset); border-radius: 12px; padding: 1rem; }
    .count b { display: block; font-family: var(--mono); font-size: 1.8rem; color: var(--good); }
    .btn {
      display: inline-block;
      background: var(--accent);
      color: var(--accent-ink);
      text-decoration: none;
      font-weight: 700;
      padding: 0.7rem 1.1rem;
      border-radius: 10px;
    }
    pre {
      background: var(--bg-inset);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.9rem 1rem;
      overflow: auto;
      font-family: var(--mono);
      font-size: 0.86rem;
    }
    .badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 0.15rem 0.6rem; margin: 0.15rem; font-size: 0.8rem; color: var(--muted); }
    footer { color: var(--muted); margin-top: 2.5rem; font-size: 0.92rem; }
  </style>
</head>
<body>
  <main class="wrap">
    <p class="kicker">Public giveaway · v${escapeHtml(VERSION)} · ${escapeHtml(AUTHOR)} · Apache-2.0</p>
    <h1>${escapeHtml(PRODUCT_TITLE)} is local-first software you run on your own machine.</h1>
    <p class="lede">
      Shadow-first TypeScript runtime for HVAC, plumbing, electrical, sewer, and cross-trades.
      You bring your own ServiceTitan and your own ProBooks. This Worker is a human UI plus a counted download.
      It is <strong>not</strong> a hosted multi-tenant company OS.
    </p>
    <p>
      <span class="badge">Aziel Eliab only</span>
      <span class="badge">BYO inbound</span>
      <span class="badge">live_backends false</span>
      <span class="badge">${escapeHtml(LICENSE)}</span>
    </p>

    <div class="panel">
      <h2>Honesty</h2>
      <p>${escapeHtml(HONESTY.product)}</p>
      <p class="notice">${escapeHtml(HONESTY.counters)}</p>
    </div>

    <div class="counts">
      <div class="count"><span>Views</span><b id="views">${views}</b><small>GET / HTML 200 only</small></div>
      <div class="count"><span>Downloads</span><b id="downloads">${downloads}</b><small>GET /download 200 only</small></div>
    </div>

    <h2>Download</h2>
    <p>
      <a class="btn" href="/download">Download ${escapeHtml(RELEASE_FILENAME)}</a>
    </p>
    <p class="notice">Counted once after the gzip tarball is verified and the 200 response starts. Failed downloads do not increment.</p>
    <pre>curl -fsSL ${escapeHtml(PUBLIC_ORIGIN)}/download -o ${escapeHtml(RELEASE_FILENAME)}
tar -xzf ${escapeHtml(RELEASE_FILENAME)}
cd package
npm install
npm test
npm run demo</pre>

    <h2>Install from the tarball</h2>
    <p>
      The archive is the npm-packable source (src, docs, tests, README, IDENTITY, LICENSE).
      Implementer specs stay in the private repo and are not dumped here.
      Credentials stay on your machine. Place your own exports under
      <code>data/inbound/servicetitan/</code> and <code>data/inbound/probooks/</code>.
    </p>

    <h2>What this Worker refuses</h2>
    <div class="panel">
      <ul>
        <li>No central ServiceTitan dump ingestion</li>
        <li>No write API to ServiceTitan or ProBooks</li>
        <li>No tenant store and no phone-home</li>
        <li>No GitHub Pages surface</li>
        <li>No production company-OS claim</li>
      </ul>
    </div>

    <h2>AI clients (OpenAPI / MCP)</h2>
    <p>Thin read-only surface: <a href="/openapi.json">/openapi.json</a> and <a href="/mcp"><code>POST /mcp</code></a> (health, stats, cite, skill). Public, no OAuth. Not a FragGate engine catalog.</p>
    <ul>${clients}</ul>

    <h2>Cite</h2>
    <p>
      <a href="/v1/health">/v1/health</a> ·
      <a href="/v1/stats">/v1/stats</a> ·
      <a href="/cite.json">/cite.json</a> ·
      <a href="/llms.txt">/llms.txt</a> ·
      <a href="/v1/skill">/v1/skill</a> ·
      <a href="${escapeHtml(REPOSITORY)}">GitHub (may stay private)</a>
    </p>
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
