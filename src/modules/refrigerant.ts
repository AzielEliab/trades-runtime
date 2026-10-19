import {
  addDays,
  daysBetween,
  dayOf,
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
 * Refrigerant log and leak-rate check (EPA Section 608 and the AIM Act HFC rule).
 *
 * Sources (checked 2026-10-19, eCFR "current"):
 *  - 40 CFR 82.157(a), (c)(2): Section 608 leak repair applies to appliances with a
 *    full charge of 50 or more pounds of a class I or class II (ozone-depleting)
 *    refrigerant. Trigger rates: 20% commercial refrigeration, 30% industrial process
 *    refrigeration, 10% comfort cooling and all other appliances.
 *    https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-82/subpart-F/section-82.157
 *    https://www.epa.gov/section608/stationary-refrigeration-leak-repair-requirements
 *  - 40 CFR 84.106(a), (c)(2): from January 1, 2026, the AIM Act rule applies to appliances
 *    with a full charge of 15 or more pounds of refrigerant that contains an HFC (or a
 *    substitute with GWP > 53). Same 20 / 30 / 10% rates (10% also covers refrigerated
 *    transport). Excludes residential and light commercial AC and heat pumps and
 *    appliances containing solely an ODS.
 *    https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-84/subpart-C/section-84.106
 *  - 40 CFR 82.152 "leak rate": annualizing method and rolling average method.
 *    https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-82/subpart-F/section-82.152
 *  - EPA summary: repair within 30 days of discovery, or a retrofit/retire plan within 30 days
 *    (120 days when an industrial process shutdown is required).
 *
 * This is a record-keeping aid. It is not legal advice and not an EPA filing. The
 * operator stays responsible for applicability, the facility's single leak-rate
 * method, seasonal variances, and verification tests.
 */

export const REFRIGERANT_RULES = {
  section608: {
    citation: "40 CFR 82.157",
    appliesTo: "class I or class II (ODS) refrigerant, full charge >= 50 lb",
    thresholdLbs: 50,
    rates: { "commercial-refrigeration": 20, "industrial-process": 30, "comfort-cooling": 10, "refrigerated-transport": 10, other: 10 },
    effective: "2019-01-01 (50 lb ODS-only scope from 2020-04-10)"
  },
  aimActHfc: {
    citation: "40 CFR 84.106",
    appliesTo: "refrigerant containing an HFC (or a substitute with GWP > 53), full charge >= 15 lb; not residential/light-commercial AC and heat pumps; not ODS-only",
    thresholdLbs: 15,
    rates: { "commercial-refrigeration": 20, "industrial-process": 30, "comfort-cooling": 10, "refrigerated-transport": 10, other: 10 },
    effective: "2026-01-01"
  },
  repairDays: 30,
  industrialShutdownRepairDays: 120,
  sourcesCheckedOn: "2026-10-19"
} as const;

export const APPLIANCE_TYPES = ["comfort-cooling", "commercial-refrigeration", "industrial-process", "refrigerated-transport", "other"] as const;
export type ApplianceType = (typeof APPLIANCE_TYPES)[number];
export const REFRIGERANT_CLASSES = ["ods", "hfc", "other", "unknown"] as const;
export type RefrigerantClass = (typeof REFRIGERANT_CLASSES)[number];
export const REFRIGERANT_ACTIONS = ["charge", "recover", "reclaim", "leak-check", "repair", "verification-test", "install", "retire"] as const;
export type RefrigerantAction = (typeof REFRIGERANT_ACTIONS)[number];

/**
 * Known codes only. ODS = HCFC/CFC refrigerants and blends that contain them.
 * HFC = HFC refrigerants and blends that contain an HFC (AIM Act "regulated substance").
 * Anything else stays unknown until the operator sets refrigerantClass on the appliance.
 */
const ODS_CODES = new Set(["R-11", "R-12", "R-22", "R-113", "R-114", "R-123", "R-124", "R-500", "R-502", "R-401A", "R-401B", "R-402A", "R-402B", "R-408A", "R-409A"]);
const HFC_CODES = new Set(["R-32", "R-125", "R-134A", "R-143A", "R-404A", "R-407A", "R-407C", "R-407F", "R-410A", "R-417A", "R-421A", "R-422B", "R-422D", "R-427A", "R-438A", "R-448A", "R-449A", "R-452A", "R-452B", "R-454B", "R-507A", "R-513A"]);

export function normalizeRefrigerant(code: string): string {
  const cleaned = code.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return "";
  const withR = cleaned.startsWith("R-") ? cleaned : cleaned.startsWith("R") ? `R-${cleaned.slice(1)}` : `R-${cleaned}`;
  return withR;
}

export function classifyRefrigerant(code: string): RefrigerantClass {
  const normalized = normalizeRefrigerant(code);
  if (ODS_CODES.has(normalized)) return "ods";
  if (HFC_CODES.has(normalized)) return "hfc";
  return "unknown";
}

export interface Appliance {
  applianceId: string;
  label?: string;
  applianceType: ApplianceType;
  fullChargeLbs?: number;
  refrigerant?: string;
  refrigerantClass: RefrigerantClass;
  /** True for residential / light commercial AC and heat pumps (excluded from 84.106). */
  residentialLightCommercial: boolean;
  leakRateMethod: "annualizing" | "rolling-average";
  customerId?: string;
  site?: string;
}

export interface RefrigerantEvent {
  eventId: string;
  at: string;
  applianceId: string;
  action: RefrigerantAction;
  refrigerant?: string;
  pounds?: number;
  jobId?: string;
  technicianId?: string;
  technicianName?: string;
  /** EPA Section 608 technician certification number, as recorded. Not verified here. */
  techCertNumber?: string;
  cylinderId?: string;
  /** For leak-check / verification-test: passed or failed. */
  result?: string;
  /** Seasonal variance or post-retrofit/install top-off excluded from leak rate (82.157(b)). */
  excludeFromLeakRate?: boolean;
  source: string;
}

export interface Cylinder {
  cylinderId: string;
  refrigerant?: string;
  kind: "virgin" | "recovery" | "reclaim-return" | "unknown";
  startLbs?: number;
}

export type Regime = "section608" | "aimActHfc" | "not-covered" | "undetermined";

export interface ApplianceLeakRow {
  applianceId: string;
  label: string | null;
  applianceType: ApplianceType;
  refrigerant: string | null;
  refrigerantClass: RefrigerantClass;
  fullChargeLbs: number | null;
  regime: Regime;
  regimeReason: string;
  triggerRatePct: number | null;
  method: "annualizing" | "rolling-average";
  lastAdditionAt: string | null;
  lastAdditionLbs: number | null;
  leakRatePct: number | null;
  exceeds: boolean;
  repairDueBy: string | null;
  chargedLbs: number;
  recoveredLbs: number;
  reclaimedLbs: number;
  events: number;
}

export interface RefrigerantAlert {
  id: string;
  applianceId: string;
  severity: "hold" | "watch";
  message: string;
  citation: string;
}

export interface RefrigerantBoard {
  module: "refrigerant";
  generatedAt: string;
  rules: typeof REFRIGERANT_RULES;
  appliances: ApplianceLeakRow[];
  cylinders: Array<{ cylinderId: string; refrigerant: string | null; kind: Cylinder["kind"]; startLbs: number | null; chargedOutLbs: number; recoveredInLbs: number; balanceLbs: number | null }>;
  byTechnician: Array<{ technicianId: string; technicianName: string | null; techCertNumber: string | null; chargedLbs: number; recoveredLbs: number; events: number; missingCert: boolean }>;
  totals: { chargedLbs: number; recoveredLbs: number; reclaimedLbs: number; events: number };
  alerts: RefrigerantAlert[];
  source: ModuleSourceNote;
  note: string;
}

function parseAppliance(row: Record<string, unknown>): Appliance | undefined {
  const applianceId = pickText(row, ["applianceId", "equipmentId", "id", "serialNumber"]);
  if (!applianceId) return undefined;
  const typeRaw = pickText(row, ["applianceType", "type"]).toLowerCase();
  const applianceType = (APPLIANCE_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as ApplianceType) : "comfort-cooling";
  const refrigerant = normalizeRefrigerant(pickText(row, ["refrigerant", "refrigerantType"])) || undefined;
  const classRaw = pickText(row, ["refrigerantClass"]).toLowerCase();
  const refrigerantClass = (REFRIGERANT_CLASSES as readonly string[]).includes(classRaw)
    ? (classRaw as RefrigerantClass)
    : refrigerant
      ? classifyRefrigerant(refrigerant)
      : "unknown";
  return {
    applianceId,
    label: pickText(row, ["label", "name", "model"]) || undefined,
    applianceType,
    fullChargeLbs: pickNum(row, ["fullChargeLbs", "fullCharge", "chargeLbs"]),
    refrigerant,
    refrigerantClass,
    residentialLightCommercial: row.residentialLightCommercial === true,
    leakRateMethod: pickText(row, ["leakRateMethod"]) === "rolling-average" ? "rolling-average" : "annualizing",
    customerId: pickText(row, ["customerId"]) || undefined,
    site: pickText(row, ["site", "address"]) || undefined
  };
}

export function parseRefrigerantEvent(row: Record<string, unknown>, source: string, fallbackId?: string): RefrigerantEvent | undefined {
  const applianceId = pickText(row, ["applianceId", "equipmentId", "unitId"]);
  const actionRaw = pickText(row, ["action", "kind", "type"]).toLowerCase();
  const action = (REFRIGERANT_ACTIONS as readonly string[]).includes(actionRaw) ? (actionRaw as RefrigerantAction) : undefined;
  const at = pickText(row, ["at", "date", "serviceDate"]);
  if (!applianceId || !action || !at || !Number.isFinite(Date.parse(at))) return undefined;
  const pounds = pickNum(row, ["pounds", "lbs", "poundsAdded", "poundsRecovered"]);
  if (pounds !== undefined && pounds < 0) return undefined;
  const eventId = pickText(row, ["eventId", "id"]) || fallbackId || `${applianceId}:${action}:${at}`;
  return {
    eventId,
    at,
    applianceId,
    action,
    refrigerant: normalizeRefrigerant(pickText(row, ["refrigerant", "refrigerantType"])) || undefined,
    pounds,
    jobId: pickText(row, ["jobId"]) || undefined,
    technicianId: pickText(row, ["technicianId", "techId"]) || undefined,
    technicianName: pickText(row, ["technicianName", "techName"]) || undefined,
    techCertNumber: pickText(row, ["techCertNumber", "certNumber", "epaCertNumber"]) || undefined,
    cylinderId: pickText(row, ["cylinderId"]) || undefined,
    result: pickText(row, ["result"]) || undefined,
    excludeFromLeakRate: row.excludeFromLeakRate === true || row.seasonalVariance === true,
    source
  };
}

/** Inbound job rows may carry a refrigerant array (explicit fields only). */
export function refrigerantFromInbound(rows: InboundRow[]): { events: RefrigerantEvent[]; appliances: Appliance[] } {
  const events: RefrigerantEvent[] = [];
  const appliances: Appliance[] = [];
  for (const row of rows) {
    if (row.entity === "equipment") {
      const appliance = isRecord(row.raw) && (row.raw.fullChargeLbs != null || row.raw.applianceType != null) ? parseAppliance({ applianceId: row.externalId, ...row.raw }) : undefined;
      if (appliance) appliances.push(appliance);
      continue;
    }
    if (row.entity !== "job" && row.entity !== "appointment") continue;
    const entries = listOf(row.raw.refrigerant ?? row.raw.refrigerantLog ?? row.raw.refrigerantEvents);
    entries.forEach((entry, index) => {
      const event = parseRefrigerantEvent(
        {
          jobId: row.externalId,
          technicianId: row.technicianId,
          technicianName: row.technicianName,
          at: row.observedAt,
          ...entry
        },
        `${row.peerClass}:${row.file}`,
        `${row.sourceId}:refrigerant:${index + 1}`
      );
      if (event) events.push(event);
    });
  }
  return { events, appliances };
}

function regimeFor(appliance: Appliance, now: string): { regime: Regime; reason: string; rate: number | null } {
  const charge = appliance.fullChargeLbs;
  if (charge === undefined) return { regime: "undetermined", reason: "full charge not recorded", rate: null };
  if (appliance.refrigerantClass === "ods") {
    if (charge >= REFRIGERANT_RULES.section608.thresholdLbs) {
      return { regime: "section608", reason: `ODS refrigerant, full charge ${charge} lb >= 50 lb (40 CFR 82.157)`, rate: REFRIGERANT_RULES.section608.rates[appliance.applianceType] };
    }
    return { regime: "not-covered", reason: `ODS refrigerant, full charge ${charge} lb < 50 lb`, rate: null };
  }
  if (appliance.refrigerantClass === "hfc") {
    if (now.slice(0, 10) < REFRIGERANT_RULES.aimActHfc.effective) return { regime: "not-covered", reason: "84.106 applies from 2026-01-01", rate: null };
    if (appliance.residentialLightCommercial) {
      return { regime: "not-covered", reason: "residential / light commercial AC and heat pumps are excluded from 84.106", rate: null };
    }
    if (charge >= REFRIGERANT_RULES.aimActHfc.thresholdLbs) {
      return { regime: "aimActHfc", reason: `HFC-containing refrigerant, full charge ${charge} lb >= 15 lb (40 CFR 84.106)`, rate: REFRIGERANT_RULES.aimActHfc.rates[appliance.applianceType] };
    }
    return { regime: "not-covered", reason: `HFC-containing refrigerant, full charge ${charge} lb < 15 lb`, rate: null };
  }
  if (appliance.refrigerantClass === "other") return { regime: "not-covered", reason: "operator marked refrigerant as not ODS / not HFC", rate: null };
  return { regime: "undetermined", reason: "refrigerant class unknown; set refrigerantClass on the appliance", rate: null };
}

/**
 * Leak rate per 40 CFR 82.152.
 * Annualizing: (lbs added / full charge) / (min(days since previous addition, 365) / 365) × 100.
 * Rolling average: (lbs added in the prior 365 days) / full charge × 100.
 * For a first 84.106 calculation, 84.106(b)(1) substitutes 365 days when there is no prior addition.
 */
export function leakRatePct(args: {
  method: "annualizing" | "rolling-average";
  fullChargeLbs: number;
  additions: Array<{ at: string; pounds: number }>;
}): number | null {
  const additions = [...args.additions].filter((row) => row.pounds > 0).sort((a, b) => a.at.localeCompare(b.at));
  if (!additions.length || args.fullChargeLbs <= 0) return null;
  const last = additions[additions.length - 1]!;
  if (args.method === "rolling-average") {
    const windowStart = Date.parse(last.at) - 365 * 86_400_000;
    const sum = additions.filter((row) => Date.parse(row.at) > windowStart).reduce((total, row) => total + row.pounds, 0);
    return round((sum / args.fullChargeLbs) * 100, 1);
  }
  const previous = additions.length > 1 ? additions[additions.length - 2]! : undefined;
  const days = previous ? Math.min(Math.max(daysBetween(previous.at, last.at), 1), 365) : 365;
  return round((last.pounds / args.fullChargeLbs / (days / 365)) * 100, 1);
}

export function buildRefrigerantBoard(ctx: ModuleContext, rows?: InboundRow[]): RefrigerantBoard {
  const file = readModuleFile(ctx.cwd, ctx.instanceId, "refrigerant");
  const inbound = rows ?? readInboundRows(ctx);
  const fromInbound = refrigerantFromInbound(inbound);
  const appliances = new Map<string, Appliance>();
  for (const appliance of fromInbound.appliances) appliances.set(appliance.applianceId, appliance);
  for (const row of listOf(file.data.appliances)) {
    const appliance = parseAppliance(row);
    if (appliance) appliances.set(appliance.applianceId, appliance);
  }
  const events = new Map<string, RefrigerantEvent>();
  for (const event of fromInbound.events) events.set(event.eventId, event);
  listOf(file.data.events).forEach((row, index) => {
    const event = parseRefrigerantEvent(row, "local-log", `local:${index + 1}`);
    if (event) events.set(event.eventId, event);
  });
  const allEvents = [...events.values()].sort((a, b) => a.at.localeCompare(b.at));
  const cylinders = listOf(file.data.cylinders).map((row): Cylinder => {
    const kind = pickText(row, ["kind"]);
    return {
      cylinderId: pickText(row, ["cylinderId", "id"]),
      refrigerant: normalizeRefrigerant(pickText(row, ["refrigerant"])) || undefined,
      kind: kind === "virgin" || kind === "recovery" || kind === "reclaim-return" ? kind : "unknown",
      startLbs: pickNum(row, ["startLbs", "netLbs"])
    };
  }).filter((row) => row.cylinderId);

  const alerts: RefrigerantAlert[] = [];
  for (const event of allEvents) if (!appliances.has(event.applianceId)) {
    appliances.set(event.applianceId, {
      applianceId: event.applianceId,
      applianceType: "comfort-cooling",
      refrigerant: event.refrigerant,
      refrigerantClass: event.refrigerant ? classifyRefrigerant(event.refrigerant) : "unknown",
      residentialLightCommercial: false,
      leakRateMethod: "annualizing"
    });
  }

  const applianceRows: ApplianceLeakRow[] = [...appliances.values()]
    .sort((a, b) => a.applianceId.localeCompare(b.applianceId))
    .map((appliance) => {
      const mine = allEvents.filter((event) => event.applianceId === appliance.applianceId);
      const sum = (action: RefrigerantAction) => round(mine.filter((event) => event.action === action).reduce((total, event) => total + (event.pounds ?? 0), 0));
      const additions = mine
        .filter((event) => event.action === "charge" && !event.excludeFromLeakRate && (event.pounds ?? 0) > 0)
        .map((event) => ({ at: event.at, pounds: event.pounds ?? 0 }));
      const regime = regimeFor(appliance, ctx.now);
      const rate = appliance.fullChargeLbs ? leakRatePct({ method: appliance.leakRateMethod, fullChargeLbs: appliance.fullChargeLbs, additions }) : null;
      const last = additions[additions.length - 1];
      const exceeds = regime.rate !== null && rate !== null && rate > regime.rate;
      const repairDays = REFRIGERANT_RULES.repairDays;
      const repairDueBy = exceeds && last ? addDays(last.at, repairDays) : null;
      const repairedAfter = exceeds && last ? mine.some((event) => event.action === "verification-test" && event.at > last.at && /pass/i.test(event.result ?? "")) : false;
      if (exceeds && !repairedAfter) {
        alerts.push({
          id: `refrigerant-leak:${appliance.applianceId}`,
          applianceId: appliance.applianceId,
          severity: "hold",
          message: `${appliance.applianceId} leak rate ${rate}% is over the ${regime.rate}% trigger (${regime.reason}). Repair or plan retrofit/retirement by ${repairDueBy} (30 days from the addition; 120 days if an industrial process shutdown is required); record verification tests.`,
          citation: regime.regime === "section608" ? "40 CFR 82.157(c)-(f)" : "40 CFR 84.106(c)-(f)"
        });
      }
      if (regime.regime === "undetermined" && mine.some((event) => event.action === "charge")) {
        alerts.push({
          id: `refrigerant-undetermined:${appliance.applianceId}`,
          applianceId: appliance.applianceId,
          severity: "watch",
          message: `${appliance.applianceId}: refrigerant added but leak-repair applicability is undetermined (${regime.reason}).`,
          citation: "40 CFR 82.157(a), 84.106(a)"
        });
      }
      return {
        applianceId: appliance.applianceId,
        label: appliance.label ?? null,
        applianceType: appliance.applianceType,
        refrigerant: appliance.refrigerant ?? null,
        refrigerantClass: appliance.refrigerantClass,
        fullChargeLbs: appliance.fullChargeLbs ?? null,
        regime: regime.regime,
        regimeReason: regime.reason,
        triggerRatePct: regime.rate,
        method: appliance.leakRateMethod,
        lastAdditionAt: last?.at ?? null,
        lastAdditionLbs: last?.pounds ?? null,
        leakRatePct: rate,
        exceeds,
        repairDueBy,
        chargedLbs: sum("charge"),
        recoveredLbs: sum("recover"),
        reclaimedLbs: sum("reclaim"),
        events: mine.length
      };
    });

  const cylinderRows = cylinders.map((cylinder) => {
    const mine = allEvents.filter((event) => event.cylinderId === cylinder.cylinderId);
    const chargedOut = round(mine.filter((event) => event.action === "charge").reduce((t, e) => t + (e.pounds ?? 0), 0));
    const recoveredIn = round(mine.filter((event) => event.action === "recover").reduce((t, e) => t + (e.pounds ?? 0), 0));
    return {
      cylinderId: cylinder.cylinderId,
      refrigerant: cylinder.refrigerant ?? null,
      kind: cylinder.kind,
      startLbs: cylinder.startLbs ?? null,
      chargedOutLbs: chargedOut,
      recoveredInLbs: recoveredIn,
      balanceLbs: cylinder.startLbs === undefined ? null : round(cylinder.startLbs - chargedOut + recoveredIn)
    };
  });
  for (const event of allEvents) {
    if (event.refrigerant && event.cylinderId) {
      const cylinder = cylinders.find((row) => row.cylinderId === event.cylinderId);
      if (cylinder?.refrigerant && cylinder.refrigerant !== event.refrigerant) {
        alerts.push({
          id: `refrigerant-cylinder-mismatch:${event.eventId}`,
          applianceId: event.applianceId,
          severity: "watch",
          message: `${event.eventId}: ${event.refrigerant} logged against cylinder ${cylinder.cylinderId} (${cylinder.refrigerant}).`,
          citation: "recordkeeping"
        });
      }
    }
  }

  const techs = new Map<string, RefrigerantBoard["byTechnician"][number]>();
  for (const event of allEvents) {
    const id = event.technicianId ?? event.technicianName;
    if (!id) continue;
    const current = techs.get(id) ?? { technicianId: id, technicianName: event.technicianName ?? null, techCertNumber: null, chargedLbs: 0, recoveredLbs: 0, events: 0, missingCert: true };
    current.events += 1;
    if (event.action === "charge") current.chargedLbs = round(current.chargedLbs + (event.pounds ?? 0));
    if (event.action === "recover") current.recoveredLbs = round(current.recoveredLbs + (event.pounds ?? 0));
    if (event.techCertNumber) current.techCertNumber = event.techCertNumber;
    current.missingCert = !current.techCertNumber;
    techs.set(id, current);
  }
  for (const tech of techs.values()) {
    if (tech.missingCert && (tech.chargedLbs > 0 || tech.recoveredLbs > 0)) {
      alerts.push({
        id: `refrigerant-cert:${tech.technicianId}`,
        applianceId: "",
        severity: "watch",
        message: `${tech.technicianName ?? tech.technicianId} handled refrigerant with no Section 608 certification number on the log.`,
        citation: "40 CFR 82.161"
      });
    }
  }

  return {
    module: "refrigerant",
    generatedAt: ctx.now,
    rules: REFRIGERANT_RULES,
    appliances: applianceRows,
    cylinders: cylinderRows,
    byTechnician: [...techs.values()].sort((a, b) => a.technicianId.localeCompare(b.technicianId)),
    totals: {
      chargedLbs: round(applianceRows.reduce((t, row) => t + row.chargedLbs, 0)),
      recoveredLbs: round(applianceRows.reduce((t, row) => t + row.recoveredLbs, 0)),
      reclaimedLbs: round(applianceRows.reduce((t, row) => t + row.reclaimedLbs, 0)),
      events: allEvents.length
    },
    alerts,
    source: sourceNote(file, inbound.filter((row) => listOf(row.raw.refrigerant ?? row.raw.refrigerantLog ?? row.raw.refrigerantEvents).length > 0)),
    note: "Record-keeping aid from local files and admitted rows. Not legal advice and not an EPA filing. Leak rates use 40 CFR 82.152; trigger rates from 40 CFR 82.157 and 84.106 as of 2026-10-19."
  };
}

export function validateRefrigerantWrite(args: Record<string, unknown>): RefrigerantEvent {
  const event = parseRefrigerantEvent(args, "approved-write");
  if (!event) throw new Error(`refrigerant entry needs applianceId, action (${REFRIGERANT_ACTIONS.join(", ")}), an ISO at, and non-negative pounds`);
  if ((event.action === "charge" || event.action === "recover" || event.action === "reclaim") && event.pounds === undefined) {
    throw new Error(`${event.action} needs pounds`);
  }
  return event;
}

export function dayLabel(iso: string | null): string {
  return iso ? (dayOf(iso) ?? iso) : "";
}

