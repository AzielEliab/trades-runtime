import { capacityChart, jobsChart } from "./charts.js";
import type { OperatorSnapshot } from "./snapshot.js";

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderBanner(snapshot: OperatorSnapshot): string {
  return `<p class="banner" data-label="${esc(snapshot.dataLabel)}">${esc(snapshot.honesty)}</p>`;
}

export function renderMetrics(snapshot: OperatorSnapshot): string {
  const cards: [string, number][] = [
    ["Jobs in view", snapshot.metrics.jobs],
    ["Appointments", snapshot.metrics.appointments],
    ["Customers", snapshot.metrics.customers],
    ["Pricebook rows", snapshot.metrics.pricebookItems],
    ["Invoices", snapshot.metrics.invoices],
    ["Admitted packets", snapshot.metrics.admittedPackets],
    ["Unverified", snapshot.metrics.unverified],
    ["Receipt lines", snapshot.metrics.receiptLines]
  ];
  return cards
    .map(
      ([label, value]) =>
        `<article class="metric"><span>${esc(label)}</span><strong>${value}</strong></article>`
    )
    .join("");
}

export function renderCharts(snapshot: OperatorSnapshot): string {
  const goal = snapshot.mission.goals[0];
  return `<section class="chart-card">
      <header><h2>Jobs and completions</h2><p>Amber is jobs. Green is completed. ${esc(snapshot.capacityFormula)}</p></header>
      ${jobsChart(snapshot.series)}
      <p class="legend"><i class="swatch jobs"></i> Jobs <i class="swatch done"></i> Completed</p>
    </section>
    <section class="chart-card">
      <header><h2>Capacity</h2><p>Booking block ${esc(snapshot.bookingBlock)}. ${goal ? `Today ${goal.actual} completed, gap ${goal.remainingGap.toFixed(2)}.` : ""}</p></header>
      ${capacityChart(snapshot.capacity)}
      <p class="legend"><i class="swatch jobs"></i> Booked <i class="swatch done"></i> Open lane, when the series has one</p>
    </section>`;
}

export function renderScores(snapshot: OperatorSnapshot): string {
  return snapshot.scores
    .map(
      (score) => `<article class="score">
        <span>${esc(score.label)}</span>
        <strong>${esc(score.value)}</strong>
        <p>${esc(score.note)}</p>
      </article>`
    )
    .join("");
}

export function renderAlerts(snapshot: OperatorSnapshot): string {
  if (!snapshot.alerts.length) return `<p class="quiet">No alerts.</p>`;
  return snapshot.alerts
    .map(
      (alert) => `<article class="alert ${esc(alert.severity)}">
        <span>${esc(alert.severity)}</span>
        <h3>${esc(alert.title)}</h3>
        <p>${esc(alert.detail)}</p>
      </article>`
    )
    .join("");
}

export function renderMission(snapshot: OperatorSnapshot): string {
  const rows = snapshot.mission.goals
    .map(
      (goal) => `<tr>
        <td>${esc(goal.measure)}</td>
        <td>${goal.target}</td>
        <td>${goal.actual}</td>
        <td>${goal.expectedPace.toFixed(2)}</td>
        <td>${goal.remainingGap.toFixed(2)}</td>
        <td>${goal.projectedFinish.toFixed(2)}</td>
      </tr>`
    )
    .join("");
  return `<p class="quiet">Branch ${esc(snapshot.mission.branchId)} · day ${esc(snapshot.mission.day)} · clock ${esc(snapshot.mission.clock)}</p>
    <table>
      <thead><tr><th>Measure</th><th>Target</th><th>Actual</th><th>Expected pace</th><th>Gap</th><th>Projected</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export function renderFulfillment(snapshot: OperatorSnapshot): string {
  const steps = snapshot.fulfillment.steps
    .map(
      (step) =>
        `<li class="${step.reached ? "on" : "off"}"><span>${esc(step.step)}</span></li>`
    )
    .join("");
  const note =
    snapshot.fulfillment.label === "synthetic-demo"
      ? "Synthetic fulfillment advanced REQUESTED to READY with the local state machine."
      : "Fulfillment rail is empty. No local event stream is attached.";
  return `<p class="quiet">${esc(note)}</p><ol class="rail">${steps}</ol>`;
}

export function renderInbound(snapshot: OperatorSnapshot): string {
  if (!snapshot.inbound.length && !snapshot.refused.length) {
    return `<p class="quiet">Inbound folders are empty. Drop a JSON or CSV export into data/inbound/servicetitan, data/inbound/probooks, or data/inbound/trades-app.</p>`;
  }
  const rows = snapshot.inbound
    .map((row) => {
      const hash = row.sampleHashes[0] ? `${row.sampleHashes[0].slice(0, 12)}…` : "—";
      return `<tr>
        <td>${esc(row.file)}</td>
        <td>${esc(row.peerClass)}</td>
        <td>${esc(row.profileId)}</td>
        <td>${esc(row.vendorHint)}</td>
        <td>${row.records}</td>
        <td>${esc(row.verificationStatus)}</td>
        <td><code>${esc(hash)}</code></td>
      </tr>`;
    })
    .join("");
  const refused = snapshot.refused
    .map((row) => `<li><code>${esc(row.file)}</code> ${esc(row.code)}</li>`)
    .join("");
  return `${rows ? `<table><thead><tr><th>File</th><th>Peer</th><th>Profile</th><th>Vendor</th><th>Rows</th><th>Verification</th><th>Hash</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
    ${refused ? `<ul class="refused">${refused}</ul>` : ""}`;
}

export function renderDeskPage(snapshot: OperatorSnapshot): string {
  const embedded = JSON.stringify({ generatedAt: snapshot.generatedAt, dataLabel: snapshot.dataLabel }).replaceAll("<", "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Operator desk · Trades-Runtime</title>
  <style>
    :root {
      --bg: #121410;
      --bg-raised: #1a1d17;
      --bg-inset: #0d0f0c;
      --ink: #ece7dc;
      --muted: #a39b8c;
      --line: #2c3128;
      --accent: #c47a3a;
      --good: #8fb56a;
      --watch: #d4b15a;
      --hold: #d37a62;
      --display: Georgia, "Iowan Old Style", Palatino, "Times New Roman", serif;
      --sans: "Segoe UI", Helvetica, Arial, sans-serif;
      --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(900px 420px at 0% -10%, rgba(196, 122, 58, 0.16), transparent 55%),
        var(--bg);
      color: var(--ink);
      font-family: var(--sans);
      line-height: 1.5;
    }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 1.6rem 1.1rem 3rem; }
    header.top { display: flex; justify-content: space-between; gap: 1rem; align-items: end; flex-wrap: wrap; }
    .kicker { letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); font-size: 0.76rem; margin: 0; }
    h1 { font-family: var(--display); font-weight: 500; font-size: clamp(1.8rem, 3vw, 2.5rem); margin: 0.2rem 0; line-height: 1.1; }
    h2 { font-family: var(--display); font-weight: 500; font-size: 1.25rem; margin: 0; }
    h3 { margin: 0.15rem 0; font-size: 1rem; }
    .live { display: flex; align-items: center; gap: 0.45rem; color: var(--muted); font-family: var(--mono); font-size: 0.82rem; }
    .dot { width: 0.55rem; height: 0.55rem; border-radius: 99px; background: var(--good); box-shadow: 0 0 0 0 rgba(143, 181, 106, 0.7); animation: pulse 2s infinite; }
    @keyframes pulse { 70% { box-shadow: 0 0 0 8px rgba(143, 181, 106, 0); } }
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.8rem 0; }
    .chip { border: 1px solid var(--line); border-radius: 999px; padding: 0.15rem 0.6rem; color: var(--muted); font-size: 0.78rem; }
    .banner { background: var(--bg-raised); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 12px; padding: 0.85rem 1rem; }
    .metrics, .scores, .charts { display: grid; gap: 0.75rem; }
    .metrics { grid-template-columns: repeat(4, 1fr); margin: 0.9rem 0; }
    .metric, .score, .chart-card, .panel { background: var(--bg-raised); border: 1px solid var(--line); border-radius: 14px; padding: 0.85rem 0.95rem; }
    .metric span, .score span { color: var(--muted); font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
    .metric strong, .score strong { display: block; font-family: var(--mono); font-size: 1.35rem; margin-top: 0.2rem; }
    .score p, .chart-card p, .quiet { color: var(--muted); font-size: 0.88rem; }
    .charts { grid-template-columns: 1.3fr 1fr; }
    .chart-card svg { width: 100%; height: auto; display: block; margin-top: 0.4rem; }
    .legend { display: flex; gap: 0.8rem; align-items: center; }
    .swatch { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 2px; margin-right: 0.25rem; }
    .swatch.jobs { background: var(--accent); }
    .swatch.done { background: var(--good); }
    .split { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 0.75rem; margin-top: 0.75rem; }
    .scores { grid-template-columns: 1fr 1fr; }
    .alert { border-top: 1px solid var(--line); padding: 0.7rem 0; }
    .alert span { font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; }
    .alert.info span { color: var(--muted); }
    .alert.watch span { color: var(--watch); }
    .alert.hold span { color: var(--hold); }
    .alert p { margin: 0.2rem 0 0; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th, td { text-align: left; padding: 0.35rem 0.3rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; }
    code { font-family: var(--mono); font-size: 0.78rem; }
    .rail { display: flex; flex-wrap: wrap; gap: 0.4rem; list-style: none; padding: 0; }
    .rail li { border: 1px solid var(--line); border-radius: 999px; padding: 0.2rem 0.55rem; color: var(--muted); font-family: var(--mono); font-size: 0.72rem; }
    .rail li.on { color: var(--bg); background: var(--good); border-color: var(--good); }
    footer { color: var(--muted); margin-top: 1.4rem; font-size: 0.85rem; }
    @media (max-width: 860px) {
      .metrics, .charts, .split, .scores { grid-template-columns: 1fr 1fr; }
      .charts, .split { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .metrics, .scores { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <header class="top">
      <div>
        <p class="kicker">Trades-Runtime ${esc(snapshot.version)} · ${esc(snapshot.author)} · local operator desk</p>
        <h1>The day, on this machine.</h1>
      </div>
      <p class="live"><span class="dot" id="live-dot"></span><span id="live-state">tracking local state</span></p>
    </header>
    <div class="chips">
      <span class="chip">live_backends false</span>
      <span class="chip">write false</span>
      <span class="chip">UNVERIFIED</span>
      <span class="chip">127.0.0.1 only</span>
      <span class="chip">Option C pilot not started</span>
      <span class="chip" id="clock">updated ${esc(snapshot.generatedAt)}</span>
    </div>
    <div id="banner">${renderBanner(snapshot)}</div>
    <section class="metrics" id="metrics">${renderMetrics(snapshot)}</section>
    <section class="charts" id="charts">${renderCharts(snapshot)}</section>
    <section class="split">
      <div class="panel">
        <h2>Scores</h2>
        <div class="scores" id="scores">${renderScores(snapshot)}</div>
      </div>
      <div class="panel">
        <h2>Alerts</h2>
        <div id="alerts">${renderAlerts(snapshot)}</div>
      </div>
    </section>
    <section class="split">
      <div class="panel">
        <h2>Mission board</h2>
        <div id="mission">${renderMission(snapshot)}</div>
      </div>
      <div class="panel">
        <h2>Fulfillment</h2>
        <div id="fulfillment">${renderFulfillment(snapshot)}</div>
      </div>
    </section>
    <section class="panel" style="margin-top:0.75rem">
      <h2>Inbound</h2>
      <div id="inbound">${renderInbound(snapshot)}</div>
    </section>
    <footer>
      Human surface. Agent MCP stays a separate read-only bridge and does not carry this desk.
      Drop folders: <code>data/inbound/servicetitan</code>, <code>data/inbound/probooks</code>, <code>data/inbound/trades-app</code>.
      Refresh ${snapshot.tracking.intervalMs}ms from ${esc(snapshot.tracking.source)}.
    </footer>
  </main>
  <script id="desk-boot" type="application/json">${embedded}</script>
  <script>
    const slots = ["banner", "metrics", "charts", "scores", "alerts", "mission", "fulfillment", "inbound"];
    function apply(view) {
      for (const slot of slots) {
        const node = document.getElementById(slot);
        if (node && typeof view[slot] === "string") node.innerHTML = view[slot];
      }
      const clock = document.getElementById("clock");
      if (clock && view.generatedAt) clock.textContent = "updated " + view.generatedAt;
      const state = document.getElementById("live-state");
      if (state) state.textContent = "live on this machine · " + (view.dataLabel || "");
    }
    if (new URLSearchParams(location.search).has("static")) {
      const state = document.getElementById("live-state");
      if (state) state.textContent = "static snapshot";
    } else {
      const source = new EventSource("/api/events");
      source.addEventListener("snapshot", (event) => {
        apply(JSON.parse(event.data));
      });
      source.onerror = () => {
        const state = document.getElementById("live-state");
        if (state) state.textContent = "reconnecting to local desk";
      };
    }
  </script>
</body>
</html>`;
}

export function renderDeskView(snapshot: OperatorSnapshot): Record<string, string> {
  return {
    generatedAt: snapshot.generatedAt,
    dataLabel: snapshot.dataLabel,
    banner: renderBanner(snapshot),
    metrics: renderMetrics(snapshot),
    charts: renderCharts(snapshot),
    scores: renderScores(snapshot),
    alerts: renderAlerts(snapshot),
    mission: renderMission(snapshot),
    fulfillment: renderFulfillment(snapshot),
    inbound: renderInbound(snapshot)
  };
}
