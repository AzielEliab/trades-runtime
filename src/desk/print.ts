import type { OperatorSnapshot } from "./snapshot.js";

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortHash(value: string | undefined): string {
  if (!value) return "—";
  if (value.length <= 16) return value;
  return `${value.slice(0, 12)}…${value.slice(-4)}`;
}

/** Printable local snapshot. No remote assets, no receipt bodies, no phone-home. */
export function renderPrintableSnapshot(snapshot: OperatorSnapshot): string {
  const metrics = [
    ["Jobs in view", snapshot.metrics.jobs],
    ["Appointments", snapshot.metrics.appointments],
    ["Customers", snapshot.metrics.customers],
    ["Pricebook rows", snapshot.metrics.pricebookItems],
    ["Invoices", snapshot.metrics.invoices],
    ["Admitted packets", snapshot.metrics.admittedPackets],
    ["Unverified", snapshot.metrics.unverified],
    ["Receipt lines", snapshot.metrics.receiptLines],
    ["Callback calls", snapshot.metrics.callbackCalls],
    ["Warranty calls", snapshot.metrics.warrantyCalls],
    ["Not classified", snapshot.metrics.callsNotClassified]
  ]
    .map(([label, value]) => `<tr><th>${esc(String(label))}</th><td>${value}</td></tr>`)
    .join("");
  const goals = snapshot.mission.goals
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
  const scores = snapshot.scores
    .map(
      (score) => `<tr><th>${esc(score.label)}</th><td>${esc(score.value)}</td><td>${esc(score.why)} ${esc(score.note)}</td></tr>`
    )
    .join("");
  const bookingClass = snapshot.bookingReceipt.blocked ? "block-lane" : "block-lane open";
  const lanes = snapshot.lanes
    .map(
      (lane) => `<tr>
        <td>${esc(lane.label)}</td>
        <td>${esc(lane.kind)}</td>
        <td>${lane.booked}</td>
        <td>${lane.open == null ? "blank" : lane.open}</td>
        <td>false</td>
        <td>${esc(lane.note)}</td>
      </tr>`
    )
    .join("");
  const alerts = [...snapshot.ruleAlerts, ...snapshot.alerts]
    .map(
      (alert) => `<li><strong>${esc(alert.severity)} · ${esc(alert.title)}</strong> ${esc(alert.detail)}</li>`
    )
    .join("");
  const inbound = snapshot.inbound.length
    ? snapshot.inbound
        .map((row) => {
          const hash = row.sampleHashes[0] ? shortHash(row.sampleHashes[0]) : "—";
          return `<tr><td>${esc(row.file)}</td><td>${esc(row.peerClass)}</td><td>${esc(row.profileId)}</td><td>${esc(row.verificationStatus)}</td><td><code>${esc(hash)}</code></td></tr>`;
        })
        .join("")
    : `<tr><td colspan="5">No admitted files on this machine.</td></tr>`;
  const receipts = snapshot.receiptDigest.entries.length
    ? snapshot.receiptDigest.entries
        .map((entry) => {
          if (entry.type === "receipt") {
            return `<li>${esc(entry.id ?? "receipt")} · ${esc(entry.kind ?? "receipt")} · ${esc(entry.at ?? "—")} · <code>${esc(shortHash(entry.hash))}</code></li>`;
          }
          if (entry.type === "genesis") {
            return `<li>genesis · <code>${esc(shortHash(entry.hash))}</code></li>`;
          }
          return `<li>unparsed local line</li>`;
        })
        .join("")
    : `<li>No local receipt lines on this path.</li>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Local desk snapshot · Trades-Runtime</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f6f1e6;
      color: #1c1914;
      font-family: "Iowan Old Style", Palatino, Georgia, serif;
      line-height: 1.45;
    }
    main { max-width: 820px; margin: 0 auto; padding: 1.5rem 1.2rem 2.5rem; }
    h1 { font-weight: 500; font-size: 1.8rem; margin: 0.15rem 0 0.4rem; }
    h2 { font-weight: 500; font-size: 1.15rem; margin: 1.3rem 0 0.4rem; }
    p, li { font-family: "Segoe UI", Helvetica, Arial, sans-serif; font-size: 0.92rem; }
    .kicker { letter-spacing: 0.08em; text-transform: uppercase; font-family: "Segoe UI", Helvetica, Arial, sans-serif; font-size: 0.72rem; color: #5e574c; margin: 0; }
    .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.7rem 0; }
    .chip { border: 1px solid #d5ccbc; border-radius: 999px; padding: 0.1rem 0.55rem; font-family: "Segoe UI", Helvetica, Arial, sans-serif; font-size: 0.75rem; }
    .banner { border-left: 3px solid #9a5420; padding: 0.6rem 0.8rem; background: #fffdf8; }
    table { width: 100%; border-collapse: collapse; font-family: "Segoe UI", Helvetica, Arial, sans-serif; font-size: 0.86rem; }
    th, td { text-align: left; padding: 0.32rem 0.35rem; border-bottom: 1px solid #e4dccf; vertical-align: top; }
    th { color: #5e574c; font-weight: 600; }
    code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.78rem; }
    button { font: inherit; border: 1px solid #1c1914; background: transparent; border-radius: 999px; padding: 0.3rem 0.75rem; cursor: pointer; }
    .block-lane { border: 2px solid #9a5420; background: #fffdf8; padding: 0.75rem 0.9rem; margin-top: 1rem; }
    .block-lane.open { border-color: #2f6f4e; }
    .block-lane h2 { margin: 0 0 0.35rem; }
    footer { margin-top: 1.4rem; color: #5e574c; font-family: "Segoe UI", Helvetica, Arial, sans-serif; font-size: 0.82rem; }
    @media print {
      body { background: #fff; }
      button { display: none; }
      main { padding: 0; }
    }
  </style>
</head>
<body>
  <main>
    <p class="kicker">Trades-Runtime ${esc(snapshot.version)} · ${esc(snapshot.author)} · local snapshot</p>
    <h1>Desk snapshot</h1>
    <p>Taken ${esc(snapshot.generatedAt)} from this machine. This page does not phone home.</p>
    <p><button type="button" onclick="window.print()">Print or save as PDF</button></p>
    <div class="chips">
      <span class="chip">live_backends false</span>
      <span class="chip">write false</span>
      <span class="chip">UNVERIFIED</span>
      <span class="chip">pilot_started false</span>
      <span class="chip">Option C pilot not started</span>
      <span class="chip">${esc(snapshot.dataLabel)}</span>
    </div>
    <p class="banner">${esc(snapshot.honesty)}</p>
    <section class="${bookingClass}">
      <h2>What blocked booking</h2>
      <p><strong>${esc(snapshot.bookingReceipt.block)}</strong> — ${esc(snapshot.bookingReceipt.headline)}</p>
      <p>${esc(snapshot.bookingReceipt.why)}</p>
    </section>
    <h2>Callback and warranty</h2>
    <p>${esc(snapshot.callClass.note)}</p>
    <h2>Metrics</h2>
    <table>${metrics}</table>
    <h2>Mission board</h2>
    <p>Branch ${esc(snapshot.mission.branchId)} · day ${esc(snapshot.mission.day)} · clock ${esc(snapshot.mission.clock)}</p>
    <table>
      <thead><tr><th>Measure</th><th>Target</th><th>Actual</th><th>Expected pace</th><th>Gap</th><th>Projected</th></tr></thead>
      <tbody>${goals}</tbody>
    </table>
    <h2>Lane view</h2>
    <p>${esc(snapshot.map.reason)} Not a map.</p>
    <table>
      <thead><tr><th>Lane</th><th>Kind</th><th>Booked</th><th>Open</th><th>Geographic</th><th>Note</th></tr></thead>
      <tbody>${lanes}</tbody>
    </table>
    <h2>Scores</h2>
    <table>${scores}</table>
    <h2>Alerts</h2>
    <ul>${alerts || "<li>No alerts.</li>"}</ul>
    <h2>Inbound</h2>
    <table>
      <thead><tr><th>File</th><th>Peer</th><th>Profile</th><th>Verification</th><th>Hash</th></tr></thead>
      <tbody>${inbound}</tbody>
    </table>
    <h2>Local receipts</h2>
    <p>${snapshot.receiptDigest.lines} line${snapshot.receiptDigest.lines === 1 ? "" : "s"} on the local receipt file. Identifiers only. Receipt bodies stay in the file.</p>
    <ul>${receipts}</ul>
    <footer>
      Human surface. Printed from local state on 127.0.0.1. Agent MCP does not carry this page.
      live_backends false. Writes refused. pilot_started false. Option D is not started.
    </footer>
  </main>
</body>
</html>`;
}
