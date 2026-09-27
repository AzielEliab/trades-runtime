import { callFilterLabel, type CallDeskFilter } from "../domain/call-class.js";
import { explainMissionPace } from "../domain/mission-board.js";
import { capacityChart, countBars, jobsChart, milesChart, positionMap, rankedBars } from "./charts.js";
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
    ["Receipt lines", snapshot.metrics.receiptLines],
    ["Callback calls", snapshot.metrics.callbackCalls],
    ["Warranty calls", snapshot.metrics.warrantyCalls],
    ["Not classified", snapshot.metrics.callsNotClassified]
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
      (score) => `<article class="score" data-score="${esc(score.id)}"${score.band ? ` data-band="${esc(score.band)}"` : ""}>
        <span>${esc(score.label)}</span>
        <strong>${esc(score.value)}</strong>
        <p class="why">${esc(score.why)}</p>
        <p>${esc(score.note)}</p>
      </article>`
    )
    .join("");
}

function renderStubList(stubs: OperatorSnapshot["alertActions"]["stubs"]): string {
  if (!stubs.length) return "";
  const rows = stubs
    .map(
      (stub) => `<article class="stub" data-refused="${esc(stub.refused)}">
        <h4>${esc(stub.label)}</h4>
        <p>${esc(stub.rationale)}</p>
        <p>Required human authority: ${esc(stub.requiredHumanAuthority)}</p>
        <p><code>refused: ${esc(stub.refused)}</code> · ServiceTitan write false · ProBooks write false · executed false</p>
      </article>`
    )
    .join("");
  return `<details class="stubs">
      <summary>Proposed actions (stubs)</summary>
      <p class="quiet">${esc(stubs[0]?.humanAuthorityRule ?? "")}</p>
      ${rows}
    </details>`;
}

function renderRuleArticle(alert: OperatorSnapshot["ruleAlerts"][number], history: boolean, stubs: OperatorSnapshot["alertActions"]["stubs"]): string {
  const ack = alert.acknowledgedAt
    ? `<p class="quiet">Acknowledged ${esc(alert.acknowledgedAt)}${alert.acknowledgedBy ? ` by ${esc(alert.acknowledgedBy)}` : ""}.</p>`
    : history
      ? ""
      : `<button type="button" class="ack" data-ack="${esc(alert.id)}">Acknowledge</button>`;
  const state = history ? (alert.active ? "active" : "cleared") : alert.acknowledgedAt ? "acknowledged" : "open";
  const actions = history ? "" : renderStubList(stubs);
  return `<article class="alert ${esc(alert.severity)}" data-rule="${esc(alert.rule)}" data-state="${state}">
        <span>${esc(alert.severity)} · ${esc(alert.rule)} · ${esc(alert.dataLabel)}</span>
        <h3>${esc(alert.title)}</h3>
        <p>${esc(alert.detail)}</p>
        ${ack}
        ${actions}
      </article>`;
}

export function renderAlerts(snapshot: OperatorSnapshot): string {
  const active = snapshot.ruleAlerts.length
    ? snapshot.ruleAlerts
        .map((alert) =>
          renderRuleArticle(
            alert,
            false,
            snapshot.alertActions.stubs.filter((stub) => stub.alertId === alert.id)
          )
        )
        .join("")
    : `<p class="quiet">No rule is firing on this clock. No action stub is proposed.</p>`;
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
  return `<p class="quiet">${esc(snapshot.alertActions.note)}</p>
    <p class="quiet">${esc(snapshot.alertActions.humanAuthorityRule)}</p>
    <p class="quiet">Export current rule hits on this machine: <a href="/api/alerts/digest.json">JSON</a> · <a href="/api/alerts/digest.csv">CSV</a> · <a href="/api/alert-actions">Action stubs</a></p>
    <h3 class="subhead">Active rules</h3>
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
      const pace = explainMissionPace(goal);
      return `<article class="goal" data-band="${esc(pace.band)}">
        <header><h3>${esc(goal.measure)}</h3><span>${goal.actual} actual · ${goal.target} target · ${esc(pace.band)}</span></header>
        <div class="pace" role="img" aria-label="${esc(goal.measure)} ${esc(pace.band)}. ${esc(pace.why)}">
          <div class="pace-track">
            <div class="pace-actual" style="width:${actualWidth.toFixed(1)}%"></div>
            <i class="pace-expected" style="left:${expectedLeft.toFixed(1)}%"></i>
          </div>
          <p class="quiet">Bar is actual against target. Marker is expected pace at this clock.</p>
          <p class="why">${esc(pace.why)}</p>
        </div>
      </article>`;
    })
    .join("");
  const goalRows = snapshot.mission.goals
    .map((goal) => {
      const pace = explainMissionPace(goal);
      return `<tr>
        <td>${esc(goal.measure)}</td>
        <td>${goal.target}</td>
        <td>${goal.actual}</td>
        <td>${goal.expectedPace.toFixed(2)}</td>
        <td>${goal.remainingGap.toFixed(2)}</td>
        <td>${goal.projectedFinish.toFixed(2)}</td>
        <td data-band="${esc(pace.band)}">${esc(pace.band)}</td>
      </tr>`;
    })
    .join("");
  const calls = snapshot.callClass.counts;
  return `<p class="quiet">Branch ${esc(snapshot.mission.branchId)} · day ${esc(snapshot.mission.day)} · clock ${esc(snapshot.mission.clock)}</p>
    <p class="why" data-booking="${esc(snapshot.bookingBlock)}"><strong>${esc(snapshot.bookingReceipt.headline)}</strong> ${esc(snapshot.bookingReceipt.why)}</p>
    ${bars}
    <h3 class="subhead">Callback and warranty</h3>
    <p>Callback calls <strong>${calls.callback}</strong>. Warranty calls <strong>${calls.warranty}</strong>. Not classified <strong>${calls.notClassified}</strong>.</p>
    <p class="quiet">${esc(snapshot.callClass.note)}</p>
    <p class="quiet">Per-call reasons and the callbacks, warranty, and not-classified filters are on the calls panel. Counts here stay the full desk.</p>
    <table>
      <thead><tr><th>Measure</th><th>Target</th><th>Actual</th><th>Expected pace</th><th>Gap</th><th>Projected</th><th>Band</th></tr></thead>
      <tbody>${goalRows}</tbody>
    </table>`;
}

function filterHref(filter: CallDeskFilter): string {
  return filter === "all" ? "?" : `?calls=${filter}`;
}

export function renderCalls(snapshot: OperatorSnapshot): string {
  const filters: CallDeskFilter[] = ["all", "callback", "warranty", "not-classified"];
  const nav = filters
    .map((filter) => {
      const current = snapshot.callFilter.value === filter ? ` aria-current="page"` : "";
      return `<a href="${filterHref(filter)}" data-filter="${filter}"${current}>${esc(callFilterLabel(filter))}</a>`;
    })
    .join("");
  const rows = snapshot.visibleCalls
    .map(
      (row) => `<tr data-callback="${esc(row.callback)}" data-warranty="${esc(row.warranty)}" data-classified="${row.notClassified ? "no" : "yes"}">
        <td>${esc(row.id)}</td>
        <td>${esc(row.lane ?? "unnamed")}</td>
        <td>${esc(row.day)}</td>
        <td>${esc(row.technicianName ?? "—")}</td>
        <td>${esc(row.callback)}</td>
        <td>${esc(row.warranty)}</td>
        <td>${esc(row.reason)}</td>
      </tr>`
    )
    .join("");
  return `<nav class="filters" aria-label="Call filters">${nav}</nav>
    <p class="quiet">${esc(snapshot.callFilter.label)}. Showing ${snapshot.callFilter.shown} of ${snapshot.callFilter.total}. Counts on the mission board stay the full desk. Unknown is not a callback and is not warranty-covered.</p>
    <table>
      <thead><tr><th>Call</th><th>Lane</th><th>Day</th><th>Tech</th><th>Callback</th><th>Warranty</th><th>Reason</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7">No rows in this filter. The export was not relabeled.</td></tr>`}</tbody>
    </table>`;
}

export function renderCallbackWeek(snapshot: OperatorSnapshot): string {
  const week = snapshot.callbackWeek;
  const rows = week.lanes
    .map((lane) => {
      const fraction = lane.callbackRate.calls === 0 ? "—" : `${lane.callbacks}/${lane.calls}`;
      return `<tr>
        <td>${esc(lane.lane)}</td>
        <td>${lane.calls}</td>
        <td>${lane.callbacks}</td>
        <td>${esc(fraction)}</td>
        <td>${lane.warranty}</td>
        <td>${lane.notClassified}</td>
      </tr>`;
    })
    .join("");
  return `<p class="quiet">${esc(week.weekStart)} through ${esc(week.weekEnd)}. <a href="/api/calls/week.json">Week JSON</a></p>
    <p>${esc(week.note)}</p>
    <table>
      <thead><tr><th>Lane</th><th>Calls</th><th>Callbacks</th><th>Rate</th><th>Warranty</th><th>Not classified</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6">No calls in this week.</td></tr>`}</tbody>
    </table>`;
}

export function renderHuddle(snapshot: OperatorSnapshot): string {
  const cards = snapshot.huddle.techs
    .map((tech) => {
      const slots = tech.capacity.slots;
      const bookedWidth = slots && slots > 0 ? Math.min(100, (tech.capacity.booked / slots) * 100) : 0;
      const bar =
        slots == null
          ? `<p class="quiet">Open slots blank.</p>`
          : `<div class="pace" role="img" aria-label="${esc(tech.name)} booked ${tech.capacity.booked} of ${slots} slots">
              <div class="pace-track"><div class="pace-actual" style="width:${bookedWidth.toFixed(1)}%"></div></div>
              <p class="quiet">Bar is booked on the mission day against known slots.</p>
            </div>`;
      const openLabel = tech.capacity.open == null ? "blank" : String(tech.capacity.open);
      return `<article class="goal" data-tech="${esc(tech.id)}">
        <header><h3>${esc(tech.name)}</h3><span>${esc(tech.lane ?? "lane unnamed")} · open ${tech.openJobs} · late ${tech.lateRisk}</span></header>
        ${bar}
        <p class="why">${esc(tech.lateRiskWhy)}</p>
        <p>Callback share <strong>${esc(tech.callbackShare)}</strong>. Warranty share <strong>${esc(tech.warrantyShare)}</strong>. Capacity booked ${tech.capacity.booked}, open ${esc(openLabel)}.</p>
        <p>Training needed <strong>${esc(tech.trainingNeeded.severity)}</strong>.</p>
        <p class="why">${esc(tech.trainingNeeded.reason)}</p>
        <p class="why">${esc(tech.callbackShareWhy)}</p>
        <p class="why">${esc(tech.warrantyShareWhy)}</p>
        <p class="quiet">${esc(tech.capacity.why)}</p>
      </article>`;
    })
    .join("");
  return `<p class="quiet">${esc(snapshot.huddle.note)}</p>
    <p class="quiet"><a href="/api/huddle">Print huddle</a> · <a href="/api/huddle.json">Huddle JSON</a></p>
    ${cards || `<p class="quiet">No technicians on this desk.</p>`}`;
}

export function renderTech(snapshot: OperatorSnapshot): string {
  const trust = snapshot.scores.find((score) => score.id === "evidence-trust")?.value ?? "n/a";
  const rows: [string, string][] = [
    ["Data", snapshot.dataLabel],
    ["Verification", "UNVERIFIED"],
    ["Evidence trust", trust],
    ["Booking block", snapshot.bookingBlock],
    ["Booking why", snapshot.bookingReceipt.headline],
    ["Callback calls", String(snapshot.metrics.callbackCalls)],
    ["Warranty calls", String(snapshot.metrics.warrantyCalls)],
    ["Not classified", String(snapshot.metrics.callsNotClassified)],
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
  const note = snapshot.fulfillment.countNote;
  const stockRows = snapshot.stock.lines
    .map((line) => {
      const place = line.location === "ON_VAN" ? line.vanId ?? "van" : line.placeId ?? "place";
      return `<tr><td>${esc(line.sku)}</td><td>${esc(line.location)}</td><td>${esc(place)}</td><td>${line.quantity}</td></tr>`;
    })
    .join("");
  const request = snapshot.stock.sampleRequest
    ? `<p>Count-backed request: ${esc(snapshot.stock.sampleRequest.sku)} short ${snapshot.stock.sampleRequest.quantity} from ${esc(snapshot.stock.sampleRequest.location)}. On-van ${snapshot.stock.sampleRequest.onVan}. Warehouse ${snapshot.stock.sampleRequest.warehouse}.</p>`
    : "";
  return `<p class="quiet">${esc(note)}</p>
    <p class="quiet">Stock source ${esc(snapshot.stock.source)}. hosted inventory false. <a href="/api/stock">Stock JSON</a></p>
    <table>
      <thead><tr><th>SKU</th><th>Location</th><th>Place</th><th>Count</th></tr></thead>
      <tbody>${stockRows || `<tr><td colspan="4">No counts on this desk.</td></tr>`}</tbody>
    </table>
    ${request}
    <ol class="rail">${steps}</ol>`;
}

export function renderPartCosts(snapshot: OperatorSnapshot): string {
  const rows = snapshot.partCosts.lines
    .map(
      (line) => `<tr>
        <td>${esc(line.sku)}</td>
        <td>${line.currentCost}</td>
        <td>${line.lastCost}</td>
        <td>${line.adaptedCost}</td>
        <td>${line.marketWeight}</td>
        <td>${line.weakened ? "weakened" : "supported"}</td>
      </tr>`
    )
    .join("");
  const totals =
    snapshot.partCosts.adaptedParts == null
      ? ""
      : `<p>Adapted parts ${snapshot.partCosts.adaptedParts}. Current parts ${snapshot.partCosts.currentParts}. Last parts ${snapshot.partCosts.lastParts}. Not a skill score.</p>`;
  return `<p class="quiet">${esc(snapshot.partCosts.note)}</p>
    <p class="quiet">Subordinate to a human. Auto-applied false. Source ${esc(snapshot.partCosts.source)}.</p>
    ${totals}
    <table>
      <thead><tr><th>SKU</th><th>Current</th><th>Last</th><th>Adapted</th><th>Market weight</th><th>Evidence</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6">No part-cost lines.</td></tr>`}</tbody>
    </table>`;
}

export function renderBehavior(snapshot: OperatorSnapshot): string {
  const row = (flag: OperatorSnapshot["behavior"]["positive"][number]) =>
    `<li><strong>${esc(flag.polarity)}</strong> ${esc(flag.source)} · ${esc(flag.kind)} · ${esc(flag.fromRole)} → ${esc(flag.toRole)}. ${esc(flag.summary)}</li>`;
  const positive = snapshot.behavior.positive.map(row).join("");
  const negative = snapshot.behavior.negative.map(row).join("");
  return `<p>${esc(snapshot.behavior.note)}</p>
    <p class="quiet">Source ${esc(snapshot.behavior.source)}. systemBeforeBlame true. Last person blamed by default: false.</p>
    <h3>Good</h3>
    <ul>${positive || "<li>No good-handoff flags on this desk.</li>"}</ul>
    <h3>Bad coordination</h3>
    <ul>${negative || "<li>No bad-coordination flags on this desk.</li>"}</ul>`;
}

function numOrUnknown(value: number | null, digits = 2): string {
  if (value == null) return "unknown";
  return value.toFixed(digits);
}

function moneyOrBlank(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(2);
}

function rateOrBlank(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function renderDrive(snapshot: OperatorSnapshot): string {
  const drive = snapshot.drive;
  const rows = drive.techs
    .map(
      (tech) => `<tr>
        <td>${esc(tech.technicianName ?? tech.technicianId)}</td>
        <td>${numOrUnknown(tech.miles)}</td>
        <td>${numOrUnknown(tech.driveMinutes)}</td>
        <td>${tech.stops == null ? "unknown" : String(tech.stops)}</td>
        <td>${numOrUnknown(tech.milesPerStop)}</td>
      </tr>`
    )
    .join("");
  return `<p class="quiet">${esc(drive.note)}</p>
    <p class="quiet">Source ${esc(drive.source)}. live telematics false. telematics vendor false. GPS trace false.</p>
    <p>Miles driven <strong>${numOrUnknown(drive.totalMiles)}</strong>. Miles per stop <strong>${numOrUnknown(drive.milesPerStop)}</strong>. Minutes per stop <strong>${numOrUnknown(drive.minutesPerStop)}</strong>. Miles per completed job <strong>${numOrUnknown(drive.milesPerCompletedJob)}</strong>.</p>
    ${milesChart(drive.days)}
    <p class="quiet"><a href="/api/drive">Drive JSON</a></p>
    <table>
      <thead><tr><th>Tech</th><th>Miles</th><th>Drive minutes</th><th>Stops</th><th>Miles per stop</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">No miles on this desk.</td></tr>`}</tbody>
    </table>`;
}

function frictionLookup(rows: OperatorSnapshot["friction"]["employees"], id: string): { rate: string; rank: string } {
  const row = rows.find((item) => item.id === id);
  if (!row || row.frictionRate == null || row.frictionRank == null) return { rate: "unknown", rank: "unknown" };
  return { rate: rateOrBlank(row.frictionRate), rank: String(row.frictionRank) };
}

export function renderPerformance(snapshot: OperatorSnapshot): string {
  const board = snapshot.performance;
  const friction = snapshot.friction;
  const table = (rows: typeof board.employees, frictionRows: typeof friction.employees, nameHeader: string) => {
    const body = rows
      .map((row) => {
        const side = frictionLookup(frictionRows, row.id);
        return `<tr>
          <td>${row.rank}</td>
          <td>${esc(row.label)}</td>
          <td>${moneyOrBlank(row.avgTicket)}</td>
          <td>${rateOrBlank(row.recallRate)}</td>
          <td>${moneyOrBlank(row.averageSold)}</td>
          <td>${moneyOrBlank(row.currentRevenue)}</td>
          <td>${side.rate}</td>
          <td>${side.rank}</td>
        </tr>`;
      })
      .join("");
    return `<table>
      <thead><tr><th>Rank</th><th>${esc(nameHeader)}</th><th>Avg ticket</th><th>Recall rate</th><th>Average sold</th><th>Current revenue</th><th>Friction rate</th><th>Friction rank</th></tr></thead>
      <tbody>${body || `<tr><td colspan="8">No rows.</td></tr>`}</tbody>
    </table>`;
  };
  const frictionTable = (rows: typeof friction.employees, nameHeader: string) => {
    const body = rows
      .map(
        (row) => `<tr>
          <td>${row.frictionRank == null ? "unknown" : row.frictionRank}</td>
          <td>${esc(row.label)}</td>
          <td>${row.frictionRate == null ? "unknown" : rateOrBlank(row.frictionRate)}</td>
          <td>${row.negativeFlags}</td>
          <td>${row.delayedHandoffs}</td>
          <td>${row.callbacks}</td>
        </tr>`
      )
      .join("");
    return `<table>
      <thead><tr><th>Friction rank</th><th>${esc(nameHeader)}</th><th>Friction rate</th><th>Negative flags</th><th>Delayed handoffs</th><th>Callbacks</th></tr></thead>
      <tbody>${body || `<tr><td colspan="6">No rows.</td></tr>`}</tbody>
    </table>`;
  };
  return `<p class="quiet">${esc(board.note)}</p>
    <p class="quiet">Source ${esc(board.source)}. company export false. not a skill score. trainingNeeded separate. <a href="/api/performance">Performance JSON</a></p>
    <h3>Employees, best to worst</h3>
    ${rankedBars(
      board.employees.map((row) => ({ label: row.label, value: row.boardOrder })),
      "Employee performance board, best to worst"
    )}
    ${table(board.employees, friction.employees, "Employee")}
    <h3>Departments, best to worst</h3>
    ${rankedBars(
      board.departments.map((row) => ({ label: row.label, value: row.boardOrder })),
      "Department performance board, best to worst"
    )}
    ${table(board.departments, friction.departments, "Department")}
    <h3>Friction, highest first</h3>
    <p class="quiet">${esc(friction.note)}</p>
    <p class="quiet">Source ${esc(friction.source)}. hosted HR false. Friction rank 1 is the highest known friction. It is not the performance rank. A silent export stays unknown. <a href="/api/friction">Friction JSON</a></p>
    ${frictionTable(friction.employees, "Employee")}
    ${frictionTable(friction.departments, "Department")}`;
}

export function renderWorkTogether(snapshot: OperatorSnapshot): string {
  const board = snapshot.workTogether;
  const list = (title: string, rows: typeof board.suggestions.service) => {
    const items = rows.map((row) => `<li>${esc(row.text)}</li>`).join("");
    return `<h3>${esc(title)}</h3>${items ? `<ul>${items}</ul>` : `<p class="quiet">No suggestions in this lane.</p>`}`;
  };
  const positive = board.pairs.filter((pair) => pair.polarity === "positive");
  const rows = positive
    .map((pair) => {
      const from = pair.fromPerson?.name ?? pair.fromRole;
      const to = pair.toPerson?.name ?? pair.toRole;
      return `<tr><td>${esc(pair.workKind)}</td><td>${esc(from)}</td><td>${esc(to)}</td><td>${esc(pair.kind)}</td></tr>`;
    })
    .join("");
  return `<p class="quiet">${esc(board.note)}</p>
    <p class="quiet">Source ${esc(board.source)}. hosted HR false. company export false. not a skill score from revenue. trainingNeeded separate. Positive ${board.positiveCount}. Negative ${board.negativeCount}. <a href="/api/work-together">Work together JSON</a></p>
    <h3>Positive collaboration</h3>
    <table>
      <thead><tr><th>Work</th><th>From</th><th>To</th><th>Kind</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4">No positive collaboration on this desk.</td></tr>`}</tbody>
    </table>
    ${list("Service techs, when needed", board.suggestions.service)}
    ${list("Install", board.suggestions.install)}`;
}

export function renderInboundQuality(snapshot: OperatorSnapshot): string {
  const report = snapshot.inboundQuality;
  const volume = countBars(
    report.volumeBySourceKind.map((row) => ({ label: row.sourceKind, value: row.count })),
    "Inbound volume by sourceKind",
    "No ServiceTitan or ProBooks fragments on this machine."
  );
  const distribution = countBars(
    report.scoreDistribution.map((row) => ({ label: row.band, value: row.count })),
    "Quality score distribution",
    "No checklist scores on this machine."
  );
  const defects = countBars(
    report.topDefects.map((row) => ({ label: row.defect, value: row.count })),
    "Top defect classes",
    "No defect flags on this report."
  );
  const rows = report.fragments
    .slice(0, 12)
    .map((row) => {
      const flags = row.flags.length ? row.flags.map((flag) => flag.defect).join(", ") : "none";
      return `<tr><td>${esc(row.sourceKind)}</td><td><code>${esc(row.sourceId)}</code></td><td>${row.score}</td><td>${esc(flags)}</td></tr>`;
    })
    .join("");
  const mean = report.meanScore == null ? "none" : String(report.meanScore);
  return `<p class="quiet">${esc(report.note)}</p>
    <p class="quiet">Source ${esc(report.source)}. Shadow / local. live_backends false. tenant pull false. checklist, not an accuracy percent. refused write-back.</p>
    <p>Fragments <strong>${report.fragmentCount}</strong>. Mean checklist score <strong>${mean}</strong>.</p>
    <div class="charts">
      <section class="chart-card"><header><h3>Volume by sourceKind</h3></header>${volume}</section>
      <section class="chart-card"><header><h3>Score distribution</h3></header>${distribution}</section>
      <section class="chart-card"><header><h3>Top defect classes</h3></header>${defects}</section>
    </div>
    <table>
      <thead><tr><th>Source</th><th>Fragment</th><th>Score</th><th>Flags</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4">No peer fragments on this machine.</td></tr>`}</tbody>
    </table>
    <p class="quiet"><a href="/api/inbound-quality">Inbound quality JSON</a> · <a href="/api/inbound-quality.txt">Human report</a>. Files stay at <code>${esc(report.path)}</code>, <code>${esc(report.textPath)}</code>, and <code>${esc(report.auditPath)}</code>.</p>`;
}

export function renderMonitoring(snapshot: OperatorSnapshot): string {
  const board = snapshot.monitoring;
  const map = positionMap(
    board.positions.pins.map((pin) => ({
      label: pin.kind === "truck" ? `${pin.technicianName ?? pin.technicianId} · truck` : (pin.technicianName ?? pin.technicianId),
      lat: pin.lat,
      lng: pin.lng
    }))
  );
  const cards = (rows: { id: string; label: string; value: string; note?: string }[]) =>
    rows
      .map(
        (card) => `<article class="metric" data-kpi="${esc(card.id)}">
          <span>${esc(card.label)}</span>
          <strong>${esc(card.value)}</strong>
          ${card.note ? `<p class="quiet">${esc(card.note)}</p>` : ""}
        </article>`
      )
      .join("");
  const tech = board.techCards
    .map(
      (card) => `<article class="score" data-tech="${esc(card.id)}">
        <span>Rank ${card.rank}</span>
        <strong>${esc(card.name)}</strong>
        <p>Avg ticket ${esc(card.avgTicket)}</p>
        <p class="quiet">Recall ${esc(card.recall)} · Friction ${esc(card.friction)}</p>
      </article>`
    )
    .join("");
  const columns = board.columns
    .map((column) => {
      const jobs = column.calls
        .map(
          (call) => `<article class="job-card">
            <strong>${esc(call.id)}</strong>
            <span>${esc(call.lane ?? "Lane open")} · ${esc(call.technicianName ?? call.technicianId ?? "Unassigned")}</span>
            <span>${esc(call.status ?? "status open")} · ${esc(call.day)}</span>
          </article>`
        )
        .join("");
      return `<section class="call-col" data-column="${esc(column.id)}">
        <h3>${esc(column.label)} <span>${column.calls.length}</span></h3>
        ${jobs || `<p class="quiet">None on this board.</p>`}
      </section>`;
    })
    .join("");
  const quality = countBars(
    snapshot.inboundQuality.scoreDistribution.map((row) => ({ label: row.band, value: row.count })),
    "Inbound quality bands",
    "No checklist scores on this machine."
  );
  const tickets = rankedBars(
    snapshot.performance.employees.slice(0, 5).map((row) => ({ label: row.label, value: row.avgTicket ?? 0 })),
    "Average ticket"
  );
  const friction = rankedBars(
    [...snapshot.friction.employees]
      .filter((row) => row.frictionRate != null && row.frictionRank != null)
      .sort((a, b) => (a.frictionRank ?? 99) - (b.frictionRank ?? 99))
      .slice(0, 5)
      .map((row) => ({ label: row.label, value: Math.round((row.frictionRate ?? 0) * 100) })),
    "Friction"
  );
  return `<p>${esc(board.humanAuthorityRule)}</p>
    <p class="quiet">${esc(board.note)} Monitoring only. refused: ${esc(board.refused)}. ServiceTitan write false. ProBooks write false. live_backends false.</p>
    <div class="monitor-top">
      <section>
        <h3>Positions</h3>
        <p class="quiet">${esc(board.positions.note)}</p>
        ${map}
      </section>
      <section>
        <h3>Drive</h3>
        <div class="kpis">${cards(board.driveCards)}</div>
      </section>
    </div>
    <h3 class="subhead">Tech scores</h3>
    <div class="tech-cards">${tech || `<p class="quiet">No ranked techs on this desk.</p>`}</div>
    <h3 class="subhead">Call board</h3>
    <div class="call-board">${columns}</div>
    <h3 class="subhead">Today</h3>
    <div class="kpis">${cards(board.kpis)}</div>
    <div class="charts">
      <section class="chart-card"><header><h3>Miles</h3></header>${milesChart(snapshot.drive.days)}</section>
      <section class="chart-card"><header><h3>Inbound quality</h3><p>Checklist bands. Not an accuracy percent.</p></header>${quality}</section>
      <section class="chart-card"><header><h3>Avg ticket</h3></header>${tickets}</section>
      <section class="chart-card"><header><h3>Friction</h3></header>${friction}</section>
    </div>
    <p class="quiet"><a href="/api/monitoring">Monitoring JSON</a>. Pins refresh when the local file changes. Not a live GPS feed.</p>`;
}

export function renderOptionCStartGate(snapshot: OperatorSnapshot): string {
  const gate = snapshot.optionCStartGate;
  const items = gate.gates
    .map(
      (item) => `<li>
        <span class="gate-state">${esc(item.state)}</span>
        <h3>${esc(item.label)}</h3>
        <p>${esc(item.detail)}</p>
      </li>`
    )
    .join("");
  return `<p class="quiet">${esc(gate.claim)}</p>
    <p class="quiet">option C ${esc(gate.optionC)}. pilot ${esc(gate.pilot)}. pilot_started false. pilot may start false. option D ${esc(gate.optionD)}. cutover false. live_backends false. Pages ${esc(gate.pages)}.</p>
    <ul class="gates">${items}</ul>
    <p class="quiet"><a href="/api/option-c-start-gate">Start-gate JSON</a>. This panel does not start a pilot.</p>`;
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
    .why { color: var(--ink); margin: 0.35rem 0 0; }
    .why-row td { color: var(--ink); font-size: 0.86rem; }
    .banner-detail { font-size: 0.92rem; }
    .subhead { margin: 0.95rem 0 0.25rem; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); font-weight: 650; }
    .filters { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.55rem 0 0.2rem; }
    .filters a {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.18rem 0.65rem;
      color: var(--muted);
      text-decoration: none;
      font-size: 0.78rem;
    }
    .filters a[aria-current="page"] { color: var(--ink); border-color: var(--accent); }
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
    details.stubs { margin-top: 0.45rem; }
    details.stubs summary { cursor: pointer; color: var(--accent); }
    .stub { margin: 0.45rem 0 0; padding-top: 0.35rem; border-top: 1px dashed var(--line); }
    .stub h4 { margin: 0.15rem 0; font-size: 0.95rem; }
    .gates { list-style: none; padding: 0; margin: 0.4rem 0 0; }
    .monitor-top { display: grid; grid-template-columns: 1.4fr 0.8fr; gap: 0.8rem; margin-top: 0.7rem; }
    .kpis, .tech-cards { display: grid; gap: 0.6rem; }
    .kpis { grid-template-columns: repeat(4, 1fr); margin-top: 0.8rem; }
    .tech-cards { grid-template-columns: repeat(5, 1fr); margin-top: 0.7rem; }
    .call-board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.7rem; margin-top: 0.7rem; }
    .call-col h3 { display: flex; justify-content: space-between; gap: 0.6rem; align-items: baseline; }
    .call-col h3 span { font-family: var(--mono); color: var(--muted); font-size: 0.85rem; }
    .job-card { border: 1px solid var(--line); border-radius: 12px; padding: 0.55rem 0.7rem; margin-top: 0.45rem; background: var(--bg); }
    .job-card strong { display: block; font-size: 0.92rem; }
    .job-card span { color: var(--muted); font-size: 0.78rem; }
    .gates li { border-top: 1px solid var(--line); padding: 0.55rem 0; }
    .gate-state { font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--hold); }
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
      .charts, .board, .split, .monitor-top { grid-template-columns: 1fr; }
      .kpis, .tech-cards, .call-board { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 560px) {
      .metrics, .scores, .kpis, .tech-cards, .call-board { grid-template-columns: 1fr; }
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
        <a class="text-btn" href="${snapshot.callFilter.value === "all" ? "/api/receipt" : `/api/receipt?calls=${snapshot.callFilter.value}`}">Print snapshot</a>
        <a class="text-btn" href="/api/huddle">Print huddle</a>
        <a class="text-btn" href="/api/stock">Stock JSON</a>
        <a class="text-btn" href="/api/drive">Drive JSON</a>
        <a class="text-btn" href="/api/performance">Performance JSON</a>
        <a class="text-btn" href="/api/work-together">Work together JSON</a>
        <a class="text-btn" href="/api/friction">Friction JSON</a>
        <a class="text-btn" href="/api/calls/week.json">Callback week JSON</a>
        <a class="text-btn" href="/api/inbound-quality">Inbound quality JSON</a>
        <a class="text-btn" href="/api/alert-actions">Alert action stubs</a>
        <a class="text-btn" href="/api/monitoring">Monitoring</a>
        <a class="text-btn" href="/api/option-c-start-gate">Option C start gate</a>
        <a class="text-btn" href="/api/alerts/digest.json">Alert digest JSON</a>
        <a class="text-btn" href="/api/alerts/digest.csv">Alert digest CSV</a>
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
    <section class="panel" style="margin-top:0.8rem" id="monitoring-board">
      <h2>Monitoring</h2>
      <div id="monitoring">${renderMonitoring(snapshot)}</div>
    </section>
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
    <section class="panel" style="margin-top:0.8rem" id="calls-board">
      <h2>Calls</h2>
      <div id="calls">${renderCalls(snapshot)}</div>
    </section>
    <section class="split">
      <div class="panel" id="huddle-board">
        <h2>Morning huddle</h2>
        <div id="huddle">${renderHuddle(snapshot)}</div>
      </div>
      <div class="panel">
        <h2>Callback week</h2>
        <div id="callback-week">${renderCallbackWeek(snapshot)}</div>
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
      <div class="panel" id="drive-board">
        <h2>Miles and drive performance</h2>
        <div id="drive">${renderDrive(snapshot)}</div>
      </div>
      <div class="panel" id="performance-board">
        <h2>Performance board</h2>
        <div id="performance">${renderPerformance(snapshot)}</div>
      </div>
    </section>
    <section class="panel" style="margin-top:0.8rem" id="work-together-board">
      <h2>Work together</h2>
      <div id="work-together">${renderWorkTogether(snapshot)}</div>
    </section>
    <section class="split">
      <div class="panel" id="part-cost-board">
        <h2>Part cost</h2>
        <div id="part-cost">${renderPartCosts(snapshot)}</div>
      </div>
      <div class="panel" id="behavior-board">
        <h2>Department behavior</h2>
        <div id="behavior">${renderBehavior(snapshot)}</div>
      </div>
    </section>
    <section class="split">
      <div class="panel">
        <h2>Fulfillment and truck counts</h2>
        <div id="fulfillment">${renderFulfillment(snapshot)}</div>
      </div>
      <div class="panel">
        <h2>Inbound</h2>
        <div id="inbound">${renderInbound(snapshot)}</div>
      </div>
    </section>
    <section class="panel" style="margin-top:0.8rem" id="inbound-quality-board">
      <h2>Inbound quality</h2>
      <div id="inbound-quality">${renderInboundQuality(snapshot)}</div>
    </section>
    <section class="panel" style="margin-top:0.8rem" id="option-c-board">
      <h2>Option C start gate</h2>
      <div id="option-c">${renderOptionCStartGate(snapshot)}</div>
    </section>
    <footer>
      Human surface. Agent MCP stays a separate read-only bridge and does not carry this desk.
      Drop folders: <code>data/inbound/servicetitan</code>, <code>data/inbound/probooks</code>, <code>data/inbound/trades-app</code>.
      Optional miles file: <code>data/runtime/&lt;instanceId&gt;/drive-miles.json</code> or <code>data/inbound/drive-miles.json</code>. Copy <code>data/runtime/drive-miles.json.example</code>. No GPS vendor.
      Optional positions file: <code>data/runtime/&lt;instanceId&gt;/positions.json</code> or <code>data/inbound/positions.json</code>. Copy <code>data/runtime/positions.json.example</code>. Local or demo pins only. Not a live GPS vendor.
      Alert rules: copy <code>data/runtime/alerts.json.example</code> to <code>data/runtime/&lt;instanceId&gt;/alerts.json</code>.
      Inbound quality and alert-action stubs write under <code>data/runtime/&lt;instanceId&gt;/</code> on this machine. They do not call a tenant.
      Option C remains prep until a human operator starts a real pilot. Option D is out of scope. No cutover.
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
    const slots = ["banner", "rule-banner", "monitoring", "metrics", "charts", "scores", "alerts", "mission", "tech", "calls", "huddle", "callback-week", "lanes", "drive", "performance", "work-together", "part-cost", "behavior", "fulfillment", "inbound", "inbound-quality", "option-c"];
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
      const source = new EventSource("/api/events" + window.location.search);
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
    monitoring: renderMonitoring(snapshot),
    metrics: renderMetrics(snapshot),
    charts: renderCharts(snapshot),
    scores: renderScores(snapshot),
    alerts: renderAlerts(snapshot),
    mission: renderMission(snapshot),
    tech: renderTech(snapshot),
    calls: renderCalls(snapshot),
    huddle: renderHuddle(snapshot),
    "callback-week": renderCallbackWeek(snapshot),
    lanes: renderLanes(snapshot),
    drive: renderDrive(snapshot),
    performance: renderPerformance(snapshot),
    "work-together": renderWorkTogether(snapshot),
    "part-cost": renderPartCosts(snapshot),
    behavior: renderBehavior(snapshot),
    fulfillment: renderFulfillment(snapshot),
    inbound: renderInbound(snapshot),
    "inbound-quality": renderInboundQuality(snapshot),
    "option-c": renderOptionCStartGate(snapshot)
  };
}
