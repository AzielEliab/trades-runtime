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

export function renderRuleBanner(snapshot: OperatorSnapshot): string {
  const pending = snapshot.ruleAlerts.filter((alert) => !alert.acknowledgedAt);
  if (!pending.length) return "";
  return pending
    .map(
      (alert) => `<p class="rule-banner ${esc(alert.severity)}" data-rule="${esc(alert.rule)}" data-label="${esc(alert.dataLabel)}">
        <strong>${esc(alert.severity)} · ${esc(alert.rule)}</strong>
        <span class="banner-title">${esc(alert.title)}</span>
        <span class="banner-detail">${esc(alert.detail)}</span>
      </p>`
    )
    .join("");
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

function renderRuleArticle(alert: OperatorSnapshot["ruleAlerts"][number], history: boolean): string {
  const ack = alert.acknowledgedAt
    ? `<p class="quiet">Acknowledged ${esc(alert.acknowledgedAt)}${alert.acknowledgedBy ? ` by ${esc(alert.acknowledgedBy)}` : ""}.</p>`
    : history
      ? ""
      : `<button type="button" class="ack" data-ack="${esc(alert.id)}">Acknowledge</button>`;
  const state = history ? (alert.active ? "active" : "cleared") : alert.acknowledgedAt ? "acknowledged" : "open";
  return `<article class="alert ${esc(alert.severity)}" data-rule="${esc(alert.rule)}" data-state="${state}">
        <span>${esc(alert.severity)} · ${esc(alert.rule)} · ${esc(alert.dataLabel)}</span>
        <h3>${esc(alert.title)}</h3>
        <p>${esc(alert.detail)}</p>
        ${ack}
      </article>`;
}

export function renderAlerts(snapshot: OperatorSnapshot): string {
  const active = snapshot.ruleAlerts.length
    ? snapshot.ruleAlerts.map((alert) => renderRuleArticle(alert, false)).join("")
    : `<p class="quiet">No rule is firing on this clock.</p>`;
  const notices = snapshot.alerts
    .map(
      (alert) => `<article class="alert ${esc(alert.severity)}">
        <span>${esc(alert.severity)}</span>
        <h3>${esc(alert.title)}</h3>
        <p>${esc(alert.detail)}</p>
      </article>`
    )
    .join("");
  const history = snapshot.alertHistory.length
    ? snapshot.alertHistory
        .slice(0, 12)
        .map(
          (alert) => `<li data-state="${alert.active ? "active" : "cleared"}">
            <span>${esc(alert.severity)} · ${esc(alert.rule)}</span>
            ${esc(alert.title)}
            <em>${alert.active ? "active" : "cleared"}${alert.acknowledgedAt ? " · acknowledged" : ""}</em>
          </li>`
        )
        .join("")
    : `<li class="quiet">No alert history on this machine yet.</li>`;
  return `<h3 class="subhead">Active rules</h3>
    <div class="rule-alerts">${active}</div>
    <h3 class="subhead">History</h3>
    <ul class="history">${history}</ul>
    <h3 class="subhead">Desk notes</h3>
    ${notices || `<p class="quiet">No alerts.</p>`}`;
}

export function renderMission(snapshot: OperatorSnapshot): string {
  const bars = snapshot.mission.goals
    .map((goal) => {
      const target = goal.target > 0 ? goal.target : 0;
      const actualWidth = target > 0 ? Math.min(100, (goal.actual / target) * 100) : 0;
      const expectedLeft = Math.min(100, Math.max(0, goal.elapsedFraction * 100));
      return `<article class="goal">
        <header><h3>${esc(goal.measure)}</h3><span>${goal.actual} actual · ${goal.target} target</span></header>
        <div class="pace" role="img" aria-label="${esc(goal.measure)} actual ${goal.actual} of ${goal.target}">
          <div class="pace-track">
            <div class="pace-actual" style="width:${actualWidth.toFixed(1)}%"></div>
            <i class="pace-expected" style="left:${expectedLeft.toFixed(1)}%"></i>
          </div>
          <p class="quiet">Bar is actual against target. Marker is expected pace at this clock.</p>
        </div>
      </article>`;
    })
    .join("");
  const goalRows = snapshot.mission.goals
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
    ${bars}
    <table>
      <thead><tr><th>Measure</th><th>Target</th><th>Actual</th><th>Expected pace</th><th>Gap</th><th>Projected</th></tr></thead>
      <tbody>${goalRows}</tbody>
    </table>`;
}

export function renderTech(snapshot: OperatorSnapshot): string {
  const trust = snapshot.scores.find((score) => score.id === "evidence-trust")?.value ?? "n/a";
  const rows: [string, string][] = [
    ["Data", snapshot.dataLabel],
    ["Verification", "UNVERIFIED"],
    ["Evidence trust", trust],
    ["Booking block", snapshot.bookingBlock],
    ["Tracking", `${snapshot.tracking.transport} · ${snapshot.tracking.intervalMs}ms`],
    ["Receipt lines", String(snapshot.receiptDigest.lines)],
    ["Writes", "false"],
    ["live_backends", "false"],
    ["pilot_started", "false"]
  ];
  return `<dl class="tech">${rows
    .map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`)
    .join("")}</dl>
    <p class="quiet">${esc(snapshot.tracking.source)}</p>`;
}

export function renderLanes(snapshot: OperatorSnapshot): string {
  const cards = snapshot.lanes
    .map((lane) => {
      const total = lane.booked + (lane.open ?? 0);
      const showSlots = lane.kind === "capacity" && lane.open != null && total > 0 && total <= 24;
      const slots = showSlots
        ? `<div class="slots" aria-hidden="true">${Array.from({ length: total }, (_, index) => `<i class="slot ${index < lane.booked ? "booked" : "open"}"></i>`).join("")}</div>`
        : "";
      const openLabel = lane.open == null ? "open blank" : `${lane.open} open`;
      return `<article class="lane" data-kind="${esc(lane.kind)}" data-geo="false">
        <header><h3>${esc(lane.label)}</h3><span>${lane.booked} booked · ${openLabel}</span></header>
        ${slots}
        <p>${esc(lane.note)}</p>
      </article>`;
    })
    .join("");
  const tradeNote = snapshot.lanes.some((lane) => lane.kind === "trade")
    ? ""
    : `<p class="quiet">No trade token is on this series. A map is not drawn.</p>`;
  return `<p class="quiet">${esc(snapshot.map.reason)}</p>${cards}${tradeNote}`;
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

const DESK_STYLES = `
    :root, html[data-theme="dark"] {
      --bg: #10130f;
      --bg-raised: #1a1e17;
      --bg-inset: #0c0e0b;
      --ink: #f3eee4;
      --muted: #b1a89a;
      --line: #34392f;
      --accent: #d48945;
      --good: #9bc56f;
      --watch: #e0bc62;
      --hold: #e08b74;
      --banner: #231c16;
      --banner-watch: #2a2416;
      --banner-hold: #2c1b17;
      --display: "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif;
      --sans: "Avenir Next", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
      --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      color-scheme: dark;
    }
    html[data-theme="light"] {
      --bg: #f3eee4;
      --bg-raised: #fffdf8;
      --bg-inset: #e7e0d2;
      --ink: #1c1914;
      --muted: #5c564c;
      --line: #ddd4c4;
      --accent: #9a5420;
      --good: #3d6a32;
      --watch: #8a6410;
      --hold: #8d3b2a;
      --banner: #fff8ef;
      --banner-watch: #f8f1dc;
      --banner-hold: #f8e7e1;
      color-scheme: light;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(880px 380px at 0% -8%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 58%),
        var(--bg);
      color: var(--ink);
      font-family: var(--sans);
      line-height: 1.5;
    }
    .skip {
      position: absolute;
      left: 0.8rem;
      top: -3rem;
      background: var(--bg-raised);
      color: var(--ink);
      padding: 0.35rem 0.7rem;
      border-radius: 8px;
    }
    .skip:focus { top: 0.6rem; }
    .wrap { max-width: 1180px; margin: 0 auto; padding: 1.5rem 1.15rem 3.2rem; }
    header.top { display: flex; justify-content: space-between; gap: 1.2rem; align-items: flex-start; flex-wrap: wrap; }
    .kicker { letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); font-size: 0.72rem; margin: 0; }
    h1 { font-family: var(--display); font-weight: 500; font-size: clamp(2rem, 4vw, 3rem); margin: 0.15rem 0 0; line-height: 1.02; letter-spacing: -0.02em; }
    h2 { font-family: var(--display); font-weight: 500; font-size: 1.35rem; margin: 0; letter-spacing: -0.01em; }
    h3 { margin: 0.15rem 0; font-size: 1rem; font-weight: 600; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; justify-content: flex-end; }
    .text-btn, button.ack {
      appearance: none;
      background: var(--bg-raised);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.38rem 0.85rem;
      font: inherit;
      font-size: 0.82rem;
      text-decoration: none;
      cursor: pointer;
    }
    .text-btn:hover, button.ack:hover, .text-btn:focus-visible, button.ack:focus-visible { border-color: var(--accent); outline: none; }
    .live { display: flex; align-items: center; gap: 0.45rem; color: var(--muted); font-family: var(--mono); font-size: 0.78rem; margin: 0; }
    .dot { width: 0.55rem; height: 0.55rem; border-radius: 99px; background: var(--good); box-shadow: 0 0 0 0 color-mix(in srgb, var(--good) 70%, transparent); animation: pulse 2s infinite; }
    @keyframes pulse { 70% { box-shadow: 0 0 0 8px transparent; } }
    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 1rem 0 0.85rem; }
    .chip { border: 1px solid var(--line); background: color-mix(in srgb, var(--bg-raised) 70%, transparent); border-radius: 999px; padding: 0.18rem 0.65rem; color: var(--muted); font-size: 0.75rem; letter-spacing: 0.01em; }
    .banner-stack { display: grid; gap: 0.55rem; }
    .banner, .rule-banner {
      background: var(--banner);
      border: 1px solid var(--line);
      border-left: 4px solid var(--accent);
      border-radius: 14px;
      padding: 0.9rem 1.05rem;
      margin: 0;
    }
    .rule-banner { display: grid; gap: 0.15rem; }
    .rule-banner.watch { border-left-color: var(--watch); background: var(--banner-watch); }
    .rule-banner.hold { border-left-color: var(--hold); background: var(--banner-hold); }
    .rule-banner strong, .alert span, .history span, .history em {
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .banner-title { font-weight: 650; }
    .banner-detail, .alert p, .score p, .chart-card p, .quiet, .lane p { color: var(--muted); }
    .banner-detail { font-size: 0.92rem; }
    .subhead { margin: 0.95rem 0 0.25rem; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); font-weight: 650; }
    button.ack { margin-top: 0.5rem; background: transparent; }
    .history { list-style: none; padding: 0; margin: 0; }
    .history li { border-top: 1px solid var(--line); padding: 0.5rem 0; color: var(--muted); font-size: 0.88rem; }
    .history em { font-style: normal; margin-left: 0.35rem; }
    .metrics, .scores, .charts, .lanes { display: grid; gap: 0.8rem; }
    .metrics { grid-template-columns: repeat(4, 1fr); margin: 0.95rem 0; }
    .metric, .score, .chart-card, .panel, .lane {
      background: var(--bg-raised);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 0.95rem 1.05rem 1rem;
    }
    .metric span, .score span, .lane header span { color: var(--muted); font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; }
    .metric strong { display: block; font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 1.55rem; margin-top: 0.28rem; letter-spacing: -0.03em; }
    .score strong { display: block; font-family: var(--mono); font-size: 1.05rem; margin-top: 0.28rem; line-height: 1.35; }
    .charts { grid-template-columns: 1.35fr 0.9fr; }
    .chart-card header h2, .panel h2 { margin-bottom: 0.2rem; }
    .chart-card svg { width: 100%; height: auto; display: block; margin-top: 0.55rem; }
    .chart-bg { fill: var(--bg-inset); }
    .grid { stroke: var(--line); stroke-width: 1; }
    .chart-label { fill: var(--muted); font-size: 11px; font-family: var(--mono); }
    .chart-empty { fill: var(--muted); font-size: 14px; font-family: var(--sans); }
    .series-jobs, .bar-jobs, .area-jobs { stroke: var(--accent); }
    .series-done, .bar-open, .area-done { stroke: var(--good); }
    path.series-jobs, path.series-done { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    path.area-jobs { fill: var(--accent); stroke: none; opacity: 0.16; }
    path.area-done { fill: var(--good); stroke: none; opacity: 0.14; }
    circle.series-jobs, rect.bar-jobs { fill: var(--accent); stroke: none; }
    circle.series-done, rect.bar-open { fill: var(--good); stroke: none; }
    .legend { display: flex; gap: 0.9rem; align-items: center; margin-bottom: 0; }
    .swatch { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 2px; margin-right: 0.28rem; }
    .swatch.jobs { background: var(--accent); }
    .swatch.done { background: var(--good); }
    .board, .split { display: grid; gap: 0.8rem; margin-top: 0.8rem; }
    .board { grid-template-columns: 1.25fr 0.75fr; }
    .split { grid-template-columns: 1.05fr 0.95fr; }
    .scores { grid-template-columns: 1fr 1fr; margin-top: 0.7rem; }
    .goal { margin: 0.7rem 0 0.35rem; }
    .goal header { display: flex; justify-content: space-between; gap: 0.6rem; align-items: baseline; flex-wrap: wrap; }
    .goal header span { color: var(--muted); font-family: var(--mono); font-size: 0.75rem; }
    .pace-track { position: relative; height: 0.55rem; border-radius: 999px; background: var(--bg-inset); margin-top: 0.4rem; }
    .pace-actual { height: 100%; border-radius: inherit; background: var(--accent); }
    .pace-expected { position: absolute; top: -3px; width: 2px; height: calc(100% + 6px); background: var(--ink); }
    .tech { display: grid; gap: 0.45rem; margin: 0.75rem 0 0.2rem; }
    .tech div { display: flex; justify-content: space-between; gap: 0.8rem; border-bottom: 1px solid var(--line); padding-bottom: 0.35rem; }
    .tech dt { color: var(--muted); font-size: 0.75rem; letter-spacing: 0.04em; text-transform: uppercase; }
    .tech dd { margin: 0; font-family: var(--mono); font-size: 0.82rem; text-align: right; }
    .lanes { grid-template-columns: 1fr; }
    .lane header { display: flex; justify-content: space-between; gap: 0.6rem; align-items: baseline; }
    .lane header h3 { font-family: var(--display); font-weight: 500; font-size: 1.15rem; }
    .slots { display: flex; flex-wrap: wrap; gap: 0.28rem; margin: 0.55rem 0 0.2rem; }
    .slot { width: 0.78rem; height: 1.2rem; border-radius: 3px; display: block; }
    .slot.booked { background: var(--accent); }
    .slot.open { background: transparent; box-shadow: inset 0 0 0 1.5px var(--good); }
    .alert { border-top: 1px solid var(--line); padding: 0.75rem 0 0.15rem; }
    .alert.info span { color: var(--muted); }
    .alert.watch span { color: var(--watch); }
    .alert.hold span { color: var(--hold); }
    .alert p { margin: 0.25rem 0 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin-top: 0.7rem; }
    th, td { text-align: left; padding: 0.4rem 0.35rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 650; font-size: 0.72rem; letter-spacing: 0.05em; text-transform: uppercase; }
    td { font-variant-numeric: tabular-nums; }
    code { font-family: var(--mono); font-size: 0.78rem; }
    .rail { display: flex; flex-wrap: wrap; gap: 0.4rem; list-style: none; padding: 0; }
    .rail li { border: 1px solid var(--line); border-radius: 999px; padding: 0.22rem 0.6rem; color: var(--muted); font-family: var(--mono); font-size: 0.7rem; letter-spacing: 0.04em; }
    .rail li.on { color: var(--bg); background: var(--good); border-color: var(--good); }
    footer { color: var(--muted); margin-top: 1.5rem; font-size: 0.84rem; max-width: 68rem; }
    @media (max-width: 960px) {
      .metrics { grid-template-columns: 1fr 1fr; }
      .charts, .board, .split { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .metrics, .scores { grid-template-columns: 1fr; }
      .wrap { padding-top: 1.1rem; }
    }
    @media print {
      .actions, .live, .dot { display: none; }
      body { background: #fff; color: #111; }
      .panel, .metric, .chart-card, .lane, .score { break-inside: avoid; }
    }
`;

export function renderDeskPage(snapshot: OperatorSnapshot): string {
  const embedded = JSON.stringify({ generatedAt: snapshot.generatedAt, dataLabel: snapshot.dataLabel }).replaceAll("<", "\\u003c");
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Operator desk · Trades-Runtime</title>
  <style>${DESK_STYLES}</style>
  <script>
    try {
      var storedTheme = localStorage.getItem("trades-desk-theme");
      if (storedTheme === "light" || storedTheme === "dark") document.documentElement.dataset.theme = storedTheme;
    } catch (error) {}
  </script>
</head>
<body>
  <a class="skip" href="#mission-board">Skip to the mission board</a>
  <main class="wrap">
    <header class="top">
      <div>
        <p class="kicker">Trades-Runtime ${esc(snapshot.version)} · ${esc(snapshot.author)} · local operator desk</p>
        <h1>The day, on this machine.</h1>
      </div>
      <div class="actions">
        <button type="button" class="text-btn" id="theme-toggle">Light theme</button>
        <a class="text-btn" href="/api/receipt">Print snapshot</a>
        <p class="live"><span class="dot" id="live-dot"></span><span id="live-state">tracking local state</span></p>
      </div>
    </header>
    <div class="chips">
      <span class="chip">live_backends false</span>
      <span class="chip">write false</span>
      <span class="chip">UNVERIFIED</span>
      <span class="chip">127.0.0.1 only</span>
      <span class="chip">Option C pilot not started</span>
      <span class="chip">pilot_started false</span>
      <span class="chip" id="clock">updated ${esc(snapshot.generatedAt)}</span>
    </div>
    <div class="banner-stack" id="banner">${renderBanner(snapshot)}</div>
    <div class="banner-stack" id="rule-banner">${renderRuleBanner(snapshot)}</div>
    <section class="board">
      <div class="panel" id="mission-board">
        <h2>Mission board</h2>
        <div id="mission">${renderMission(snapshot)}</div>
      </div>
      <div class="panel">
        <h2>Tech board</h2>
        <div id="tech">${renderTech(snapshot)}</div>
      </div>
    </section>
    <section class="metrics" id="metrics">${renderMetrics(snapshot)}</section>
    <section class="charts" id="charts">${renderCharts(snapshot)}</section>
    <section class="panel" style="margin-top:0.8rem">
      <h2>Lane view</h2>
      <div class="lanes" id="lanes">${renderLanes(snapshot)}</div>
    </section>
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
        <h2>Fulfillment</h2>
        <div id="fulfillment">${renderFulfillment(snapshot)}</div>
      </div>
      <div class="panel">
        <h2>Inbound</h2>
        <div id="inbound">${renderInbound(snapshot)}</div>
      </div>
    </section>
    <footer>
      Human surface. Agent MCP stays a separate read-only bridge and does not carry this desk.
      Drop folders: <code>data/inbound/servicetitan</code>, <code>data/inbound/probooks</code>, <code>data/inbound/trades-app</code>.
      Alert rules: copy <code>data/runtime/alerts.json.example</code> to <code>data/runtime/&lt;instanceId&gt;/alerts.json</code>.
      Theme stays in this browser. Print snapshot stays on this machine.
      Refresh ${snapshot.tracking.intervalMs}ms from ${esc(snapshot.tracking.source)}.
    </footer>
  </main>
  <script id="desk-boot" type="application/json">${embedded}</script>
  <script>
    const THEME_KEY = "trades-desk-theme";
    function applyTheme(theme) {
      const next = theme === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      const button = document.getElementById("theme-toggle");
      if (button) button.textContent = next === "light" ? "Dark theme" : "Light theme";
    }
    try { applyTheme(localStorage.getItem(THEME_KEY) || "dark"); } catch (error) { applyTheme("dark"); }
    document.getElementById("theme-toggle")?.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      try { localStorage.setItem(THEME_KEY, next); } catch (error) {}
      applyTheme(next);
    });
    const slots = ["banner", "rule-banner", "metrics", "charts", "scores", "alerts", "mission", "tech", "lanes", "fulfillment", "inbound"];
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
    document.body.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-ack]") : null;
      if (!(button instanceof HTMLButtonElement)) return;
      const id = button.getAttribute("data-ack");
      if (!id) return;
      button.disabled = true;
      fetch("/api/alerts/ack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: id, by: "operator" })
      }).then((response) => {
        if (!response.ok) {
          button.disabled = false;
          return;
        }
        button.textContent = "Acknowledged";
      }).catch(() => {
        button.disabled = false;
      });
    });
  </script>
</body>
</html>`;
}

export function renderDeskView(snapshot: OperatorSnapshot): Record<string, string> {
  return {
    generatedAt: snapshot.generatedAt,
    dataLabel: snapshot.dataLabel,
    banner: renderBanner(snapshot),
    "rule-banner": renderRuleBanner(snapshot),
    metrics: renderMetrics(snapshot),
    charts: renderCharts(snapshot),
    scores: renderScores(snapshot),
    alerts: renderAlerts(snapshot),
    mission: renderMission(snapshot),
    tech: renderTech(snapshot),
    lanes: renderLanes(snapshot),
    fulfillment: renderFulfillment(snapshot),
    inbound: renderInbound(snapshot)
  };
}
