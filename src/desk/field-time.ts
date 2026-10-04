import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../core/hash.js";
import type { DrivePerformance } from "../domain/drive-miles.js";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";

/**
 * Local field time events on the operator desk.
 *
 * Familiar labels, not live clients:
 * ServiceTitan public time controls — Clock in, Clock out, Start Meal, End Meal,
 * commute / first-drive, and a timesheet overtime alert.
 * ServiceTitan objects named in public APIs: jobs, invoices, timesheets.
 * Jobber public labels — Driving, Office, Supplies, Break. Jobber states it does not
 * calculate overtime or enforce meal rules. Jobber objects: Client, Job, Invoice, TimeSheetEntry.
 * Housecall Pro, Service Fusion, FieldEdge, and Workiz timesheet APIs are not clients here.
 *
 * Start Meal and End Meal are used because the desk needs both edges of one meal.
 * Jobber's Break is the same event, described in the hint. Drive time home is the
 * office-visible extended-drive request. This module does not calculate an overtime total
 * and does not write a provider timesheet.
 *
 * Not a live GPS feed. Not Field 1.0. Not Office Softwares 1.0.
 */

export const FIELD_EVENT_KINDS = ["clock-in", "clock-out", "meal-start", "meal-end", "extended-drive"] as const;
export type FieldEventKind = (typeof FIELD_EVENT_KINDS)[number];

export const FIELD_EVENT_LABELS: Record<FieldEventKind, string> = {
  "clock-in": "Clock in",
  "clock-out": "Clock out",
  "meal-start": "Start Meal",
  "meal-end": "End Meal",
  "extended-drive": "Drive time home"
};

export interface FieldTimeEvent {
  id: string;
  kind: FieldEventKind;
  label: string;
  at: string;
  technicianId: string;
  technicianName: string | null;
  jobId: string | null;
  /** True when the technician id was not on the desk roster. The event is still recorded. */
  localStub: boolean;
  vendorWrite: false;
  servicetitanWrite: false;
  jobberWrite: false;
  probooksWrite: false;
  liveGps: false;
  note: string;
}

export interface DriveLongAlert {
  technicianId: string;
  technicianName: string | null;
  driveMinutes: number;
  minutesPerStop: number;
  boardMinutesPerStop: number;
  severity: "watch";
  liveGps: false;
  telematicsVendor: false;
  source: DrivePerformance["source"];
  note: string;
}

export interface FieldHint {
  id: string;
  control: string;
  text: string;
}

export const AZTRADES_TRY_PATH =
  "Try path: Point A is ServiceTitan, or another existing bring-your-own drop-in. The shadow bridge is trades-runtime. Point B is the AZTrades shell. A shop tries AZTrades by shadowing its own export through this desk. Trying is not a commit. Committing to AZTrades is a later human choice. pilot_started false. live_backends false. field_claim false. This cut does not write ServiceTitan.";

export const FIELD_HINTS: readonly FieldHint[] = [
  {
    id: "clock-in",
    control: "Clock in",
    text: "Clock in records the start of this technician's timesheet on this machine. ServiceTitan techs know this control as Clock in. Jobber records the same kind of time on a TimeSheetEntry. This button does not write ServiceTitan, Jobber, or any other provider."
  },
  {
    id: "clock-out",
    control: "Clock out",
    text: "Clock out records the end of the timesheet on this machine. End Meal first if a meal is still open. Office and management see the same event. Nothing is written back to a provider."
  },
  {
    id: "meal-start",
    control: "Start Meal",
    text: "Start Meal records the meal break opening. ServiceTitan publishes Start Meal and End Meal. Jobber calls the same break Break, and Jobber does not enforce meal rules. This desk records the start so the other roles can see it. It does not enforce a meal law."
  },
  {
    id: "meal-end",
    control: "End Meal",
    text: "End Meal records the meal break closing. Pair it with Start Meal. Jobber's Break is one label for this same span. The event stays on this desk."
  },
  {
    id: "extended-drive",
    control: "Drive time home",
    text: "Drive time home is the office button for extended drive (drive time home and similar). It records one event the office and management already share. It is not a GPS trace. Jobber's Driving label is the familiar name. ServiceTitan's commute or first-drive control is a different published button. This desk does not invent an overtime total. Jobber does not calculate overtime, and neither does this button."
  },
  {
    id: "drive-alert",
    control: "Drive time runs long",
    text: "The alert uses the drive measures already on this desk: a technician's known minutes per stop compared with the board's minutes per stop. A missing number stays unknown and does not fire. This is not live GPS and not a telematics vendor."
  },
  {
    id: "schedule",
    control: "Schedule",
    text: "Schedule is the calls board already on this desk. ServiceTitan and Jobber both call the day's work a schedule or jobs. The rows are local drop-in records or the labeled synthetic demo."
  },
  {
    id: "invoice",
    control: "Invoices",
    text: "Invoices is the invoice count already on this desk. ServiceTitan invoices and Jobber Invoice are the bridge names. Opening the count does not create or write an invoice."
  },
  {
    id: "property",
    control: "Property card",
    text: "The property card is the job's service address when this desk already has one, kept as company service history. Zillow, Redfin, and a county assessor are not connected. Listing numbers are not invented and those sites are not scraped."
  },
  {
    id: "price",
    control: "Job price",
    text: "Immediate price is part cost plus labor plus task costs, times the profit-margin multiplier the company types. Discounts apply after that. A typed cost stays typed. SupplyHouse is a read-only public product page: a number is used only when that page returns one, and otherwise the live price is unavailable. Johnstone, Ruud, Rheem, Bryant, Carrier, Duncan, Gustave A. Larson, Habegger, Lee Supply, Lowe's, and Home Depot are named and not connected. No supplier order is placed. Prices are not written to ServiceTitan or Jobber."
  },
  {
    id: "kpi",
    control: "KPI boards",
    text: "Jobs, ticket, friction, drive, clock, capacity, and huddle keep their existing meanings. The checklist score is not an accuracy percent. Evidence trust is not truth. The performance board is an operator order, not a skill score."
  }
];

export interface FieldShell {
  product: "trades-runtime";
  surface: "aztrades";
  productLabel: "Local Softwares 1.0";
  author: "Aziel Eliab";
  live_backends: false;
  writes: false;
  vendorWrite: false;
  servicetitanWrite: false;
  probooksWrite: false;
  jobberWrite: false;
  liveGps: false;
  field_claim: false;
  office_claim: false;
  pilot_started: false;
  pages: false;
  notField10: true;
  notOffice10: true;
  notCompanyOs: true;
  tryPath: string;
  path: string;
  dataLabel: string;
  missionDay: string;
  generatedAt: string;
  note: string;
  hints: readonly FieldHint[];
  techs: { id: string; name: string | null }[];
  todayJob: {
    id: string;
    lane: string | null;
    technicianId: string | null;
    technicianName: string | null;
    status: string | null;
    serviceAddress: string | null;
  } | null;
  events: FieldTimeEvent[];
  driveAlerts: DriveLongAlert[];
}

function assertLocalPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === "data/tenants" || normalized.startsWith("data/tenants/") || normalized.includes("/tenants/")) {
    throw new Error("hosted field layout is refused; field events stay on this machine");
  }
  return filePath;
}

export function defaultFieldEventsPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalPath(join(root, sanitizeInstanceId(instanceId), "field-events.jsonl"));
}

function resolvePath(cwd: string, filePath: string): string {
  if (filePath.startsWith("/")) return assertLocalPath(filePath);
  return assertLocalPath(join(cwd, filePath));
}

export function clockStatus(events: readonly FieldTimeEvent[]): "off" | "clocked" | "meal" {
  let clocked = false;
  let meal = false;
  for (const event of events) {
    if (event.kind === "clock-in") {
      clocked = true;
      meal = false;
    } else if (event.kind === "clock-out") {
      clocked = false;
      meal = false;
    } else if (event.kind === "meal-start" && clocked) {
      meal = true;
    } else if (event.kind === "meal-end") {
      meal = false;
    }
  }
  if (!clocked) return "off";
  return meal ? "meal" : "clocked";
}

export function assertFieldTransition(events: readonly FieldTimeEvent[], kind: FieldEventKind): void {
  const status = clockStatus(events);
  if (kind === "extended-drive") return;
  if (kind === "clock-in") {
    if (status !== "off") throw new Error("already clocked in; Clock out before Clock in");
    return;
  }
  if (kind === "clock-out") {
    if (status === "off") throw new Error("Clock in before Clock out");
    if (status === "meal") throw new Error("End Meal before Clock out");
    return;
  }
  if (kind === "meal-start") {
    if (status === "off") throw new Error("Clock in before Start Meal");
    if (status === "meal") throw new Error("meal already started; End Meal first");
    return;
  }
  if (status !== "meal") throw new Error("Start Meal before End Meal");
}

/**
 * A technician runs long when their known minutes per stop are above the board measure.
 * Missing minutes or stops do not fire. They are not treated as zero. Not GPS.
 */
export function driveRunsLong(drive: DrivePerformance): DriveLongAlert[] {
  if (drive.minutesPerStop == null) return [];
  const board = drive.minutesPerStop;
  const alerts: DriveLongAlert[] = [];
  for (const tech of drive.techs) {
    if (tech.minutesPerStop == null || tech.driveMinutes == null) continue;
    if (tech.minutesPerStop <= board) continue;
    alerts.push({
      technicianId: tech.technicianId,
      technicianName: tech.technicianName,
      driveMinutes: tech.driveMinutes,
      minutesPerStop: tech.minutesPerStop,
      boardMinutesPerStop: board,
      severity: "watch",
      liveGps: false,
      telematicsVendor: false,
      source: drive.source,
      note: `${tech.technicianName ?? tech.technicianId} drive time runs long: ${tech.minutesPerStop} minutes per stop, above the desk measure of ${board}. Source ${drive.source}. Not a GPS trace. Not a telematics vendor. Not an overtime total.`
    });
  }
  return alerts;
}

export function readFieldEvents(filePath: string): FieldTimeEvent[] {
  assertLocalPath(filePath);
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, "utf8").split("\n");
  const events: FieldTimeEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as FieldTimeEvent;
      if (!parsed || typeof parsed.id !== "string" || !FIELD_EVENT_KINDS.includes(parsed.kind)) continue;
      events.push(parsed);
    } catch {
      continue;
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

function cleanId(value: string, label: string): string {
  const text = value.trim();
  if (!text || text.length > 80 || /[\\/\0]/.test(text)) throw new Error(`${label} is missing or not a local id`);
  return text;
}

export function recordFieldEvent(args: {
  cwd: string;
  instanceId: string;
  kind: FieldEventKind;
  at: string;
  technicianId: string;
  technicianName?: string | null;
  jobId?: string | null;
  rosterIds?: readonly string[];
}): FieldTimeEvent {
  if (!FIELD_EVENT_KINDS.includes(args.kind)) throw new Error("unknown field event");
  if (!Number.isFinite(Date.parse(args.at))) throw new Error("field event needs a readable time");
  const technicianId = cleanId(args.technicianId, "technicianId");
  const jobId = args.jobId?.trim() ? cleanId(args.jobId, "jobId") : null;
  const path = resolvePath(args.cwd, defaultFieldEventsPath(args.instanceId));
  const existing = readFieldEvents(path);
  const mine = existing.filter((event) => event.technicianId === technicianId);
  assertFieldTransition(mine, args.kind);
  const localStub = args.rosterIds != null && !args.rosterIds.includes(technicianId);
  const event: FieldTimeEvent = {
    id: sha256({ kind: args.kind, technicianId, at: args.at, jobId }).slice(0, 16),
    kind: args.kind,
    label: FIELD_EVENT_LABELS[args.kind],
    at: args.at,
    technicianId,
    technicianName: args.technicianName?.trim() || null,
    jobId,
    localStub,
    vendorWrite: false,
    servicetitanWrite: false,
    jobberWrite: false,
    probooksWrite: false,
    liveGps: false,
    note: localStub
      ? `${FIELD_EVENT_LABELS[args.kind]} recorded on this machine for an id that is not on the desk roster. Local stub. Not a provider write. Not GPS.`
      : `${FIELD_EVENT_LABELS[args.kind]} recorded on this machine. Office and management read this same event. Not a provider write. Not GPS.`
  };
  if (existing.some((row) => row.id === event.id)) return existing.find((row) => row.id === event.id)!;
  mkdirSync(join(path, ".."), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export interface FieldShellCall {
  id: string;
  day: string;
  technicianId: string | null;
  technicianName: string | null;
  status: string | null;
  lane: string | null;
  serviceAddress: string | null;
  open: boolean;
}

export function buildFieldShell(args: {
  cwd: string;
  instanceId: string;
  now: string;
  missionDay: string;
  dataLabel: string;
  calls: readonly FieldShellCall[];
  drive: DrivePerformance;
  extraTechs?: readonly { id: string; name: string | null }[];
}): FieldShell {
  const path = defaultFieldEventsPath(args.instanceId);
  const events = readFieldEvents(resolvePath(args.cwd, path));
  const techs = new Map<string, string | null>();
  for (const call of args.calls) {
    if (call.technicianId) techs.set(call.technicianId, call.technicianName);
  }
  for (const tech of args.extraTechs ?? []) techs.set(tech.id, tech.name);
  for (const tech of args.drive.techs) techs.set(tech.technicianId, tech.technicianName);
  const today = args.calls.filter((call) => call.day === args.missionDay);
  const todayJob = today.find((call) => call.open) ?? today[0] ?? null;
  return {
    product: "trades-runtime",
    surface: "aztrades",
    productLabel: "Local Softwares 1.0",
    author: "Aziel Eliab",
    live_backends: false,
    writes: false,
    vendorWrite: false,
    servicetitanWrite: false,
    probooksWrite: false,
    jobberWrite: false,
    liveGps: false,
    field_claim: false,
    office_claim: false,
    pilot_started: false,
    pages: false,
    notField10: true,
    notOffice10: true,
    notCompanyOs: true,
    tryPath: AZTRADES_TRY_PATH,
    path,
    dataLabel: args.dataLabel,
    missionDay: args.missionDay,
    generatedAt: args.now,
    note: `AZTrades is the local field shell on this operator desk. trades-runtime is the bridge. Point A stays the company's current provider through the existing drop-in profiles. Point B is this desk. Clock, meal, and drive events are local records the field, office, and management read together. This is Local Softwares 1.0 (installable). It is not a Field 1.0 claim, not Office Softwares 1.0, and not a live company OS. pilot_started false. live_backends false. Provider writes stay refused. ${AZTRADES_TRY_PATH}`,
    hints: FIELD_HINTS,
    techs: [...techs.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id)),
    todayJob: todayJob
      ? {
          id: todayJob.id,
          lane: todayJob.lane,
          technicianId: todayJob.technicianId,
          technicianName: todayJob.technicianName,
          status: todayJob.status,
          serviceAddress: todayJob.serviceAddress
        }
      : null,
    events,
    driveAlerts: driveRunsLong(args.drive)
  };
}
