import {
  addDays,
  daysBetween,
  isRecord,
  listOf,
  pickNum,
  pickText,
  readInboundRows,
  readModuleFile,
  round,
  sourceNote,
  type InboundRow,
  type ModuleContext,
  type ModuleSourceNote
} from "./common.js";

/**
 * Maintenance agreements (memberships / service plans).
 * Renewals due, missed tune-ups, and members not visited in N days.
 * Revenue at risk sums only the agreement prices the shop's own data names:
 * a price on the agreement itself, or (optional) the shop's own plan price list
 * in settings.planPrices. An agreement with neither is counted as "price
 * unknown", never as zero and never as an estimate.
 */

export interface Agreement {
  agreementId: string;
  customerId?: string;
  customerName?: string;
  plan?: string;
  startOn?: string;
  renewalOn?: string;
  status: "active" | "expired" | "cancelled" | "unknown";
  /** Price per term, exactly as the data names it (or the shop's plan price list). */
  price?: number;
  /** Where the price came from. Absent when no price is on file. */
  priceSource?: "agreement" | "plan-price-list";
  visitsPerTerm?: number;
  visits: string[];
  source: string;
}

export interface AgreementSettings {
  renewalWindowDays: number;
  notVisitedDays: number;
  /** Optional shop-supplied price per term, keyed by plan name (case-insensitive). Used only when an agreement names no price. */
  planPrices: Record<string, number>;
}

export const DEFAULT_AGREEMENT_SETTINGS: AgreementSettings = { renewalWindowDays: 60, notVisitedDays: 180, planPrices: {} };

export interface AgreementRow extends Agreement {
  daysToRenewal: number | null;
  renewalDue: boolean;
  lapsed: boolean;
  lastVisitOn: string | null;
  daysSinceVisit: number | null;
  expectedVisitsToDate: number | null;
  completedVisitsThisTerm: number;
  missedTuneUps: number;
  notVisited: boolean;
}

export interface AgreementBoard {
  module: "agreements";
  generatedAt: string;
  settings: AgreementSettings;
  agreements: AgreementRow[];
  renewalsDue: string[];
  lapsed: string[];
  missedTuneUps: string[];
  notVisited: string[];
  revenueAtRisk: {
    amount: number;
    agreementsPriced: number;
    agreementsPriceUnknown: number;
    /** How many priced at-risk agreements took their price from the agreement vs the shop's plan price list. */
    pricedFrom: { agreement: number; planPriceList: number };
    basis: string;
  };
  alerts: Array<{ id: string; agreementId: string; severity: "watch" | "hold"; message: string }>;
  source: ModuleSourceNote;
  note: string;
}

function iso(value: string): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function parseAgreement(row: Record<string, unknown>, source: string): Agreement | undefined {
  const agreementId = pickText(row, ["agreementId", "membershipId", "planId", "id"]);
  if (!agreementId) return undefined;
  const statusRaw = pickText(row, ["status"]).toLowerCase();
  const status = statusRaw === "active" || statusRaw === "expired" || statusRaw === "cancelled" ? statusRaw : statusRaw === "canceled" ? "cancelled" : "unknown";
  const visits = Array.isArray(row.visits)
    ? row.visits.map((value) => (typeof value === "string" ? value : isRecord(value) ? pickText(value, ["completedOn", "date", "at"]) : "")).filter((value) => iso(value))
    : [];
  return {
    agreementId,
    customerId: pickText(row, ["customerId"]) || undefined,
    customerName: pickText(row, ["customerName", "customer"]) || undefined,
    plan: pickText(row, ["plan", "planName", "name"]) || undefined,
    startOn: iso(pickText(row, ["startOn", "startDate", "from"])),
    renewalOn: iso(pickText(row, ["renewalOn", "endOn", "endDate", "expiresOn", "to"])),
    status,
    price: pickNum(row, ["price", "agreementPrice", "amount", "termPrice"]),
    visitsPerTerm: pickNum(row, ["visitsPerTerm", "visitsPerYear", "tuneUpsPerYear"]),
    visits,
    source
  };
}

/** Agreements named on admitted rows (agreement / membership / servicePlan objects) and the job dates that visited them. */
export function agreementsFromInbound(rows: InboundRow[]): { agreements: Agreement[]; visits: Array<{ agreementId: string; on: string }> } {
  const agreements: Agreement[] = [];
  const visits: Array<{ agreementId: string; on: string }> = [];
  for (const row of rows) {
    const candidates = [row.raw.agreement, row.raw.membership, row.raw.servicePlan, row.raw.service_plan].filter(isRecord);
    for (const candidate of candidates) {
      const agreement = parseAgreement(
        { customerId: row.raw.customerId, customerName: row.raw.customerName, ...candidate },
        `${row.peerClass}:${row.file}`
      );
      if (!agreement) continue;
      agreements.push(agreement);
      const done = /complet|done|closed|finished|paid|invoic/i.test(row.status ?? "");
      if (row.entity === "job" && done && row.observedAt) visits.push({ agreementId: agreement.agreementId, on: row.observedAt });
    }
  }
  return { agreements, visits };
}

function settingsFrom(raw: unknown): AgreementSettings {
  const record = isRecord(raw) ? raw : {};
  const pick = (key: "renewalWindowDays" | "notVisitedDays"): number => {
    const value = record[key];
    return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 730 ? value : DEFAULT_AGREEMENT_SETTINGS[key];
  };
  const planPrices: Record<string, number> = {};
  if (isRecord(record.planPrices)) {
    for (const [plan, value] of Object.entries(record.planPrices)) {
      const price = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(/[$,]/g, "")) : NaN;
      if (plan.trim() && Number.isFinite(price) && price >= 0) planPrices[plan.trim().toLowerCase()] = price;
    }
  }
  return { renewalWindowDays: pick("renewalWindowDays"), notVisitedDays: pick("notVisitedDays"), planPrices };
}

export function buildAgreementBoard(ctx: ModuleContext, rows?: InboundRow[]): AgreementBoard {
  const file = readModuleFile(ctx.cwd, ctx.instanceId, "agreements");
  const inbound = rows ?? readInboundRows(ctx);
  const settings = settingsFrom(file.data.settings);
  const fromInbound = agreementsFromInbound(inbound);
  const byId = new Map<string, Agreement>();
  for (const agreement of fromInbound.agreements) {
    const prior = byId.get(agreement.agreementId);
    byId.set(agreement.agreementId, prior ? { ...prior, ...Object.fromEntries(Object.entries(agreement).filter(([, v]) => v !== undefined)), visits: prior.visits } as Agreement : agreement);
  }
  for (const row of listOf(file.data.agreements)) {
    const agreement = parseAgreement(row, "local-log");
    if (!agreement) continue;
    const prior = byId.get(agreement.agreementId);
    byId.set(agreement.agreementId, prior ? { ...prior, ...Object.fromEntries(Object.entries(agreement).filter(([, v]) => v !== undefined)), visits: [...prior.visits, ...agreement.visits] } as Agreement : agreement);
  }
  for (const visit of fromInbound.visits) byId.get(visit.agreementId)?.visits.push(visit.on);
  for (const agreement of byId.values()) {
    if (agreement.price !== undefined) agreement.priceSource = "agreement";
    else if (agreement.plan && settings.planPrices[agreement.plan.toLowerCase()] !== undefined) {
      agreement.price = settings.planPrices[agreement.plan.toLowerCase()];
      agreement.priceSource = "plan-price-list";
    }
  }

  const now = ctx.now;
  const alerts: AgreementBoard["alerts"] = [];
  const rowsOut: AgreementRow[] = [...byId.values()]
    .sort((a, b) => a.agreementId.localeCompare(b.agreementId))
    .map((agreement) => {
      const visits = [...new Set(agreement.visits.map((v) => v.slice(0, 10)))].sort();
      const lastVisitOn = visits.length ? visits[visits.length - 1]! : null;
      const daysSinceVisit = lastVisitOn ? daysBetween(lastVisitOn, now) : null;
      const daysToRenewal = agreement.renewalOn ? daysBetween(now, agreement.renewalOn) : null;
      const active = agreement.status === "active" || agreement.status === "unknown";
      const lapsed = active && daysToRenewal !== null && daysToRenewal < 0;
      const renewalDue = active && daysToRenewal !== null && daysToRenewal >= 0 && daysToRenewal <= settings.renewalWindowDays;
      const termStart = agreement.startOn ?? (agreement.renewalOn ? addDays(agreement.renewalOn, -365) : undefined);
      let expectedVisitsToDate: number | null = null;
      let completedVisitsThisTerm = visits.length;
      if (termStart && agreement.visitsPerTerm !== undefined) {
        const termEnd = agreement.renewalOn ?? addDays(termStart, 365);
        const termDays = Math.max(daysBetween(termStart, termEnd), 1);
        const elapsed = Math.min(Math.max(daysBetween(termStart, now), 0), termDays);
        // A visit is "expected" once its slot in the term has fully passed.
        expectedVisitsToDate = Math.floor((agreement.visitsPerTerm * elapsed) / termDays);
        completedVisitsThisTerm = visits.filter((v) => v >= termStart.slice(0, 10) && v <= termEnd.slice(0, 10)).length;
      }
      const missedTuneUps = expectedVisitsToDate === null ? 0 : Math.max(expectedVisitsToDate - completedVisitsThisTerm, 0);
      const notVisited = active && !lapsed && (daysSinceVisit === null ? Boolean(termStart && daysBetween(termStart, now) > settings.notVisitedDays) : daysSinceVisit > settings.notVisitedDays);
      const label = agreement.customerName ?? agreement.customerId ?? agreement.agreementId;
      if (lapsed) alerts.push({ id: `agreement-lapsed:${agreement.agreementId}`, agreementId: agreement.agreementId, severity: "hold", message: `${label}: agreement passed its renewal date ${agreement.renewalOn!.slice(0, 10)} without a renewal on file.` });
      else if (renewalDue) alerts.push({ id: `agreement-renewal:${agreement.agreementId}`, agreementId: agreement.agreementId, severity: "watch", message: `${label}: renewal due in ${daysToRenewal} days.` });
      if (missedTuneUps > 0) alerts.push({ id: `agreement-missed:${agreement.agreementId}`, agreementId: agreement.agreementId, severity: "watch", message: `${label}: ${missedTuneUps} tune-up(s) behind this term.` });
      if (notVisited) alerts.push({ id: `agreement-not-visited:${agreement.agreementId}`, agreementId: agreement.agreementId, severity: "watch", message: `${label}: no visit in ${daysSinceVisit ?? `over ${settings.notVisitedDays}`} days.` });
      return { ...agreement, visits, daysToRenewal, renewalDue, lapsed, lastVisitOn, daysSinceVisit, expectedVisitsToDate, completedVisitsThisTerm, missedTuneUps, notVisited };
    });
  const atRisk = rowsOut.filter((row) => row.renewalDue || row.lapsed || row.missedTuneUps > 0 || row.notVisited);
  const priced = atRisk.filter((row) => row.price !== undefined);
  return {
    module: "agreements",
    generatedAt: now,
    settings,
    agreements: rowsOut,
    renewalsDue: rowsOut.filter((row) => row.renewalDue).map((row) => row.agreementId),
    lapsed: rowsOut.filter((row) => row.lapsed).map((row) => row.agreementId),
    missedTuneUps: rowsOut.filter((row) => row.missedTuneUps > 0).map((row) => row.agreementId),
    notVisited: rowsOut.filter((row) => row.notVisited).map((row) => row.agreementId),
    revenueAtRisk: {
      amount: round(priced.reduce((total, row) => total + (row.price ?? 0), 0)),
      agreementsPriced: priced.length,
      agreementsPriceUnknown: atRisk.length - priced.length,
      pricedFrom: {
        agreement: priced.filter((row) => row.priceSource === "agreement").length,
        planPriceList: priced.filter((row) => row.priceSource === "plan-price-list").length
      },
      basis: "Sum of the term price on each at-risk agreement (renewal due, lapsed, missed tune-up, or not visited): the agreement's own price, else the shop's settings.planPrices entry for its plan. Agreements with neither are counted, not valued."
    },
    alerts,
    source: sourceNote(file, inbound.filter((row) => [row.raw.agreement, row.raw.membership, row.raw.servicePlan, row.raw.service_plan].some(isRecord))),
    note: "From the shop's own agreement files and admitted rows. No made-up prices and no forecast."
  };
}

export function validateAgreementWrite(args: Record<string, unknown>): { agreementId: string; kind: "visit" | "renewal" | "upsert"; row: Record<string, unknown> } {
  const agreementId = pickText(args, ["agreementId"]);
  const kind = pickText(args, ["kind"]);
  if (!agreementId) throw new Error("agreementId is required");
  if (kind === "visit") {
    const on = pickText(args, ["on"]);
    if (!iso(on)) throw new Error("visit needs on (ISO date)");
    return { agreementId, kind, row: { agreementId, visitOn: on } };
  }
  if (kind === "renewal") {
    const renewalOn = pickText(args, ["renewalOn"]);
    if (!iso(renewalOn)) throw new Error("renewal needs renewalOn (ISO date)");
    const row: Record<string, unknown> = { agreementId, renewalOn, status: "active" };
    const startOn = pickText(args, ["startOn"]);
    if (iso(startOn)) row.startOn = startOn;
    const price = pickNum(args, ["price"]);
    if (price !== undefined) row.price = price;
    return { agreementId, kind, row };
  }
  if (kind === "upsert") {
    const parsed = parseAgreement(args, "approved-write");
    if (!parsed) throw new Error("upsert needs agreementId");
    const { source: _source, visits: _visits, ...row } = parsed;
    return { agreementId, kind, row: Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) };
  }
  throw new Error("kind must be visit, renewal, or upsert");
}
