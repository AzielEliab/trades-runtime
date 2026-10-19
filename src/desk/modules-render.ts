import type { RefrigerantBoard } from "../modules/refrigerant.js";
import type { PermitBoard } from "../modules/permits.js";
import type { AgreementBoard } from "../modules/agreements.js";

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cell(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : esc(value);
}

function alertList(alerts: Array<{ severity: string; message: string; citation?: string }>): string {
  if (!alerts.length) return `<p class="quiet">No alerts from the local files.</p>`;
  return `<ul class="module-alerts">${alerts
    .map((alert) => `<li data-severity="${esc(alert.severity)}"><strong>${esc(alert.severity)}</strong> ${esc(alert.message)}${alert.citation ? ` <span class="quiet">(${esc(alert.citation)})</span>` : ""}</li>`)
    .join("")}</ul>`;
}

function sourceLine(source: { file: string; filePresent: boolean; fileError?: string; inboundRows: number; peers: string[]; synthetic: boolean }, module: string): string {
  const file = source.filePresent
    ? `Local file <code>${esc(source.file.replace(/^.*\/data\/runtime\//, "data/runtime/"))}</code>.`
    : source.fileError
      ? `Local file not applied: ${esc(source.fileError)}.`
      : `No local file yet. Copy <code>data/runtime/${esc(module)}.json.example</code> to <code>data/runtime/&lt;instanceId&gt;/${esc(module)}.json</code>.`;
  const inbound = source.inboundRows ? ` ${source.inboundRows} admitted row(s) from ${esc(source.peers.join(", "))}${source.synthetic ? " (synthetic fixtures)" : ""}.` : " No admitted rows carry this data.";
  return `<p class="quiet">${file}${inbound}</p>`;
}

export function renderRefrigerantPanel(board: RefrigerantBoard): string {
  const rows = board.appliances
    .map(
      (row) => `<tr data-exceeds="${row.exceeds}">
        <td>${esc(row.applianceId)}</td><td>${cell(row.applianceType)}</td><td>${cell(row.refrigerant)}</td><td>${cell(row.fullChargeLbs)}</td>
        <td>${esc(row.regime)}</td><td>${cell(row.triggerRatePct === null ? null : `${row.triggerRatePct}%`)}</td>
        <td>${cell(row.leakRatePct === null ? null : `${row.leakRatePct}%`)}</td><td>${row.exceeds ? "over" : "—"}</td>
        <td>${row.chargedLbs}</td><td>${row.recoveredLbs}</td><td>${row.reclaimedLbs}</td><td>${cell(row.repairDueBy)}</td>
      </tr>`
    )
    .join("");
  const cylinders = board.cylinders.map((c) => `<tr><td>${esc(c.cylinderId)}</td><td>${cell(c.refrigerant)}</td><td>${esc(c.kind)}</td><td>${cell(c.startLbs)}</td><td>${c.chargedOutLbs}</td><td>${c.recoveredInLbs}</td><td>${cell(c.balanceLbs)}</td></tr>`).join("");
  const techs = board.byTechnician.map((t) => `<tr><td>${esc(t.technicianName ?? t.technicianId)}</td><td>${cell(t.techCertNumber)}</td><td>${t.chargedLbs}</td><td>${t.recoveredLbs}</td><td>${t.events}</td></tr>`).join("");
  return `<section class="panel lift" id="refrigerant-board" data-az="field office management" data-view="section:refrigerant-board">
      <h2>Refrigerant log (EPA 608)</h2>
      <p class="quiet">${esc(board.note)} Section 608: ODS refrigerant, full charge ≥ ${board.rules.section608.thresholdLbs} lb (${esc(board.rules.section608.citation)}). AIM Act: HFC refrigerant, full charge ≥ ${board.rules.aimActHfc.thresholdLbs} lb, from ${esc(board.rules.aimActHfc.effective)} (${esc(board.rules.aimActHfc.citation)}). Trigger rates 20% commercial refrigeration, 30% industrial process, 10% comfort cooling and other.</p>
      ${sourceLine(board.source, "refrigerant")}
      <p>Charged ${board.totals.chargedLbs} lb. Recovered ${board.totals.recoveredLbs} lb. Reclaimed ${board.totals.reclaimedLbs} lb. ${board.totals.events} log entries.</p>
      ${alertList(board.alerts)}
      <div class="table-scroll"><table>
        <thead><tr><th>Appliance</th><th>Type</th><th>Refrigerant</th><th>Full charge lb</th><th>Rule</th><th>Trigger</th><th>Leak rate</th><th>Status</th><th>Charged</th><th>Recovered</th><th>Reclaimed</th><th>Repair by</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="12">No appliances on the local log.</td></tr>`}</tbody>
      </table></div>
      <div class="split">
        <div class="table-scroll"><table><thead><tr><th>Cylinder</th><th>Refrigerant</th><th>Kind</th><th>Start lb</th><th>Out</th><th>In</th><th>Balance</th></tr></thead><tbody>${cylinders || `<tr><td colspan="7">No cylinders on file.</td></tr>`}</tbody></table></div>
        <div class="table-scroll"><table><thead><tr><th>Tech</th><th>608 cert #</th><th>Charged</th><th>Recovered</th><th>Entries</th></tr></thead><tbody>${techs || `<tr><td colspan="5">No techs on the log.</td></tr>`}</tbody></table></div>
      </div>
    </section>`;
}

export function renderPermitsPanel(board: PermitBoard): string {
  const rows = board.permits
    .map((p) => `<tr data-blocking="${p.blocking}"><td>${esc(p.jobId)}</td><td>${esc(p.jurisdiction)}</td><td>${cell(p.permitType)}</td><td>${cell(p.permitNumber)}</td><td>${esc(p.status)}</td><td>${cell(p.inspectionScheduledFor?.slice(0, 10))}</td><td>${cell(p.ageDays)}</td><td>${p.blocking ? "blocking" : "—"}</td></tr>`)
    .join("");
  const juris = board.byJurisdiction.map((j) => `<tr><td>${esc(j.jurisdiction)}</td><td>${j.open}</td><td>${j.failed}</td><td>${j.passed}</td><td>${cell(j.avgDaysToPass)}</td></tr>`).join("");
  return `<section class="panel lift" id="permits-board" data-az="office management" data-view="section:permits-board">
      <h2>Permits and inspections</h2>
      <p class="quiet">${esc(board.note)} Aging: pending over ${board.settings.pendingDays} days, issued with no inspection over ${board.settings.pulledNoInspectionDays} days, failed with no re-inspection over ${board.settings.failedDays} days.</p>
      ${sourceLine(board.source, "permits")}
      <p>${board.blockedJobs.length} job(s) waiting on a permit or inspection. ${Object.entries(board.byStatus).map(([status, count]) => `${esc(status)} ${count}`).join(" · ")}</p>
      ${alertList(board.alerts)}
      <div class="table-scroll"><table><thead><tr><th>Job</th><th>Jurisdiction</th><th>Type</th><th>Number</th><th>Status</th><th>Inspection</th><th>Age days</th><th>Blocking</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8">No permits on file.</td></tr>`}</tbody></table></div>
      <div class="table-scroll"><table><thead><tr><th>Jurisdiction</th><th>Open</th><th>Failed</th><th>Passed</th><th>Avg days to pass</th></tr></thead><tbody>${juris || `<tr><td colspan="5">—</td></tr>`}</tbody></table></div>
    </section>`;
}

export function renderAgreementsPanel(board: AgreementBoard): string {
  const rows = board.agreements
    .map((a) => `<tr><td>${esc(a.customerName ?? a.customerId ?? a.agreementId)}</td><td>${cell(a.plan)}</td><td>${cell(a.renewalOn?.slice(0, 10))}</td><td>${cell(a.daysToRenewal)}</td><td>${cell(a.lastVisitOn)}</td><td>${a.completedVisitsThisTerm}/${cell(a.expectedVisitsToDate)}</td><td>${cell(a.price)}</td><td>${[a.lapsed ? "lapsed" : "", a.renewalDue ? "renewal due" : "", a.missedTuneUps ? `${a.missedTuneUps} missed` : "", a.notVisited ? "not visited" : ""].filter(Boolean).join(", ") || "—"}</td></tr>`)
    .join("");
  const risk = board.revenueAtRisk;
  return `<section class="panel lift" id="agreements-board" data-az="office management" data-view="section:agreements-board">
      <h2>Maintenance agreements</h2>
      <p class="quiet">${esc(board.note)} Renewal window ${board.settings.renewalWindowDays} days. Not-visited threshold ${board.settings.notVisitedDays} days.</p>
      ${sourceLine(board.source, "agreements")}
      <p>Renewals due ${board.renewalsDue.length}. Lapsed ${board.lapsed.length}. Behind on tune-ups ${board.missedTuneUps.length}. Not visited ${board.notVisited.length}.
      Revenue at risk ${risk.agreementsPriced ? `$${risk.amount.toFixed(2)} across ${risk.agreementsPriced} priced agreement(s)` : "not computed (no prices in the data)"}${risk.agreementsPriceUnknown ? `; ${risk.agreementsPriceUnknown} at-risk agreement(s) have no price on file` : ""}.</p>
      <p class="quiet">${esc(risk.basis)}</p>
      ${alertList(board.alerts)}
      <div class="table-scroll"><table><thead><tr><th>Member</th><th>Plan</th><th>Renews</th><th>Days</th><th>Last visit</th><th>Visits done/expected</th><th>Price</th><th>Flags</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8">No agreements on file.</td></tr>`}</tbody></table></div>
    </section>`;
}

export function renderModulePanels(boards: Record<string, unknown>): string {
  const out: string[] = [];
  if (boards.refrigerant) out.push(renderRefrigerantPanel(boards.refrigerant as RefrigerantBoard));
  if (boards.permits) out.push(renderPermitsPanel(boards.permits as PermitBoard));
  if (boards.agreements) out.push(renderAgreementsPanel(boards.agreements as AgreementBoard));
  return out.join("\n    ");
}
