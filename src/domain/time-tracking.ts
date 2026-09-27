import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../core/hash.js";

/**
 * Local time cards for techs on the current call.
 * An optional file on this machine. A missing file stays empty, except the empty-folder desk,
 * which may show a labeled synthetic demo.
 * Elapsed time recomputes from the local clock when the desk refreshes.
 * This is not a live GPS feed and not a telematics vendor.
 */

export type TimeSegmentKind = "clocked" | "travel" | "idle";
export type TimeCardStatus = "on-call" | "travel" | "idle" | "off";

export interface TimeSegment {
  kind: TimeSegmentKind;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  open: boolean;
}

export interface TimeCard {
  technicianId: string;
  technicianName: string | null;
  jobId: string | null;
  jobLabel: string | null;
  trade: string | null;
  status: TimeCardStatus;
  skills: string[];
  clockedMinutes: number;
  travelMinutes: number;
  idleMinutes: number;
  /** Minutes on the open segment. Clocked when on a call, travel when driving, idle when waiting. */
  elapsedMinutes: number;
  /** Minutes until this tech is free for another job. Zero when idle or off. */
  estimatedRemainingMinutes: number | null;
  segments: TimeSegment[];
}

export interface TimeTrackingBoard {
  product: "trades-runtime";
  author: "Aziel Eliab";
  live_backends: false;
  writes: false;
  phoneHome: false;
  liveTelematics: false;
  telematicsVendor: false;
  vendorClaim: false;
  notALiveGps: true;
  source: "synthetic-demo" | "local-file" | "unknown";
  dataLabel: "synthetic-demo" | "local-file" | "unknown";
  path: string;
  auditPath: string;
  sourcePath: string | null;
  sourceDigest: string;
  written: boolean;
  note: string;
  generatedAt: string;
  cards: TimeCard[];
  totals: {
    techs: number;
    onCall: number;
    traveling: number;
    idle: number;
    clockedMinutes: number;
    travelMinutes: number;
    idleMinutes: number;
  };
}

interface TimeCardInput {
  technicianId: string;
  technicianName: string | null;
  jobId: string | null;
  jobLabel: string | null;
  trade: string | null;
  status: TimeCardStatus | null;
  skills: string[];
  estimatedMinutes: number | null;
  travelEstimateMinutes: number | null;
  segments: { kind: TimeSegmentKind; startedAt: string; endedAt: string | null; minutes: number | null }[];
}

const DEMO_NOTE =
  "Synthetic demo time cards on this machine. Clock, travel, and idle come from a labeled fixture. Not a live GPS feed. Not a telematics vendor. Not a company export. live_backends false.";

const LOCAL_NOTE =
  "BYO drop-in time cards on this machine. Elapsed and remaining recompute when this local file or the desk clock changes. Not a live GPS feed. Not a telematics vendor. live_backends false.";

/** In-repo cards for the empty-folder desk. A fixture, not a company timeclock and not a GPS trace. */
export const SYNTHETIC_TIME_INPUTS: readonly TimeCardInput[] = [
  {
    technicianId: "tech-maya",
    technicianName: "Maya Chen",
    jobId: "SYN-DESK-HVAC-1",
    jobLabel: "No cool",
    trade: "hvac",
    status: "on-call",
    skills: ["hvac"],
    estimatedMinutes: 90,
    travelEstimateMinutes: null,
    segments: [
      { kind: "travel", startedAt: "2026-09-27T16:40:00Z", endedAt: "2026-09-27T17:02:00Z", minutes: null },
      { kind: "clocked", startedAt: "2026-09-27T17:10:00Z", endedAt: null, minutes: null }
    ]
  },
  {
    technicianId: "tech-luis",
    technicianName: "Luis Ortega",
    jobId: "SYN-DESK-PL-1",
    jobLabel: "Return visit",
    trade: "plumbing",
    status: "travel",
    skills: ["plumbing"],
    estimatedMinutes: 70,
    travelEstimateMinutes: 35,
    segments: [{ kind: "travel", startedAt: "2026-09-27T17:45:00Z", endedAt: null, minutes: null }]
  },
  {
    technicianId: "tech-priya",
    technicianName: "Priya Shah",
    jobId: null,
    jobLabel: null,
    trade: null,
    status: "idle",
    skills: ["electrical"],
    estimatedMinutes: null,
    travelEstimateMinutes: null,
    segments: [{ kind: "idle", startedAt: "2026-09-27T16:30:00Z", endedAt: null, minutes: null }]
  },
  {
    technicianId: "tech-andre",
    technicianName: "Andre Cole",
    jobId: "SYN-DESK-SW-1",
    jobLabel: "Sewer line",
    trade: "sewer",
    status: "on-call",
    skills: ["sewer"],
    estimatedMinutes: 150,
    travelEstimateMinutes: null,
    segments: [{ kind: "clocked", startedAt: "2026-09-27T16:30:00Z", endedAt: null, minutes: null }]
  },
  {
    technicianId: "tech-sam",
    technicianName: "Sam Okonkwo",
    jobId: null,
    jobLabel: null,
    trade: null,
    status: "idle",
    skills: ["cross-trades"],
    estimatedMinutes: null,
    travelEstimateMinutes: null,
    segments: [{ kind: "idle", startedAt: "2026-09-27T17:00:00Z", endedAt: null, minutes: null }]
  }
];

function assertLocalTimePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === "data/tenants" || normalized.startsWith("data/tenants/") || normalized.includes("/tenants/")) {
    throw new Error("hosted time layout is refused; time cards stay on this machine");
  }
  return filePath;
}

function sanitizeInstanceId(instanceId: string): string {
  const id = instanceId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!id || id === "shared" || id === "hosted" || id === "tenants") {
    throw new Error("local time tracking requires a local instance id (not shared/hosted/tenants)");
  }
  return id;
}

export function defaultTimeCardsPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalTimePath(join(root, sanitizeInstanceId(instanceId), "time-cards.json"));
}

export function inboundTimeCardsPath(root = "data/inbound"): string {
  return assertLocalTimePath(join(root, "time-cards.json"));
}

export function defaultTimeTrackingPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalTimePath(join(root, sanitizeInstanceId(instanceId), "time-tracking.json"));
}

export function defaultTimeTrackingAuditPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalTimePath(join(root, sanitizeInstanceId(instanceId), "time-tracking.jsonl"));
}

function resolvePath(cwd: string, filePath: string): string {
  if (filePath.startsWith("/")) return assertLocalTimePath(filePath);
  return assertLocalTimePath(join(cwd, filePath));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function refuseVendorClaim(doc: Record<string, unknown>): void {
  if (doc.liveTelematics === true || doc.liveGps === true || doc.live_backends === true) {
    throw new Error("local time file must not claim a live telematics or GPS backend");
  }
  for (const key of ["telematicsVendor", "vendor", "gpsVendor"] as const) {
    if (typeof doc[key] === "string" && doc[key].trim()) {
      throw new Error("local time file must not claim a live telematics or GPS vendor");
    }
  }
  if (typeof doc.source === "string" && doc.source.trim() && doc.source !== "operator-file" && doc.source !== "local-file") {
    throw new Error("local time file must not claim a live telematics or GPS vendor");
  }
}

function minutesBetween(startedAt: string, endedAt: string, open: boolean): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error("time segment has a clock that cannot be read");
  }
  if (end < start) {
    if (open) return 0;
    throw new Error("time segment end is before the start");
  }
  return Math.round((end - start) / 60000);
}

function parseStatus(value: unknown): TimeCardStatus | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim().toLowerCase();
  if (text === "on-call" || text === "on call" || text === "clocked" || text === "working") return "on-call";
  if (text === "travel" || text === "driving" || text === "en route" || text === "enroute") return "travel";
  if (text === "idle" || text === "waiting") return "idle";
  if (text === "off" || text === "done") return "off";
  throw new Error(`time card status "${value}" is not on-call, travel, idle, or off`);
}

function parseSkills(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim().toLowerCase()];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().toLowerCase());
}

function parseSegment(entry: unknown, index: number, cardIndex: number): TimeCardInput["segments"][number] {
  if (!isRecord(entry)) throw new Error(`time card ${cardIndex + 1} segment ${index + 1} is not an object`);
  const kindText = typeof entry.kind === "string" ? entry.kind.trim().toLowerCase() : "";
  const kind: TimeSegmentKind | null =
    kindText === "clocked" || kindText === "work" ? "clocked" : kindText === "travel" || kindText === "drive" ? "travel" : kindText === "idle" ? "idle" : null;
  if (!kind) throw new Error(`time card ${cardIndex + 1} segment ${index + 1} kind must be clocked, travel, or idle`);
  const startedAt = typeof entry.startedAt === "string" ? entry.startedAt.trim() : "";
  if (!Number.isFinite(Date.parse(startedAt))) throw new Error(`time card ${cardIndex + 1} segment ${index + 1} needs a startedAt time`);
  const endedRaw = entry.endedAt;
  const endedAt = endedRaw == null || endedRaw === "" ? null : typeof endedRaw === "string" ? endedRaw.trim() : null;
  if (endedRaw != null && endedRaw !== "" && !endedAt) throw new Error(`time card ${cardIndex + 1} segment ${index + 1} endedAt is not a time`);
  if (endedAt && !Number.isFinite(Date.parse(endedAt))) throw new Error(`time card ${cardIndex + 1} segment ${index + 1} endedAt is not a time`);
  const minutes = entry.minutes == null || entry.minutes === "" ? null : readNumber(entry.minutes);
  if (entry.minutes != null && entry.minutes !== "" && minutes == null) {
    throw new Error(`time card ${cardIndex + 1} segment ${index + 1} minutes is not a number`);
  }
  if (minutes != null && minutes < 0) throw new Error(`time card ${cardIndex + 1} segment ${index + 1} minutes must be non-negative`);
  return { kind, startedAt, endedAt, minutes };
}

function cardFromRow(row: Record<string, unknown>, index: number): TimeCardInput {
  const technicianId = typeof row.technicianId === "string" ? row.technicianId.trim() : "";
  if (!technicianId) throw new Error(`time card ${index + 1} needs a technicianId`);
  const list = Array.isArray(row.segments) ? row.segments : null;
  if (!list?.length) throw new Error(`time card ${index + 1} needs at least one segment`);
  const estimated = row.estimatedMinutes == null || row.estimatedMinutes === "" ? null : readNumber(row.estimatedMinutes);
  if (row.estimatedMinutes != null && row.estimatedMinutes !== "" && estimated == null) {
    throw new Error(`time card ${index + 1} estimatedMinutes is not a number`);
  }
  if (estimated != null && estimated < 0) throw new Error(`time card ${index + 1} estimatedMinutes must be non-negative`);
  const travelEstimate = row.travelEstimateMinutes == null || row.travelEstimateMinutes === "" ? null : readNumber(row.travelEstimateMinutes);
  if (row.travelEstimateMinutes != null && row.travelEstimateMinutes !== "" && travelEstimate == null) {
    throw new Error(`time card ${index + 1} travelEstimateMinutes is not a number`);
  }
  if (travelEstimate != null && travelEstimate < 0) throw new Error(`time card ${index + 1} travelEstimateMinutes must be non-negative`);
  return {
    technicianId,
    technicianName: typeof row.technicianName === "string" && row.technicianName.trim() ? row.technicianName.trim() : null,
    jobId: typeof row.jobId === "string" && row.jobId.trim() ? row.jobId.trim() : null,
    jobLabel: typeof row.jobLabel === "string" && row.jobLabel.trim() ? row.jobLabel.trim() : null,
    trade: typeof row.trade === "string" && row.trade.trim() ? row.trade.trim().toLowerCase() : null,
    status: parseStatus(row.status),
    skills: parseSkills(row.skills),
    estimatedMinutes: estimated,
    travelEstimateMinutes: travelEstimate,
    segments: list.map((entry, segmentIndex) => parseSegment(entry, segmentIndex, index))
  };
}

export function readTimeCardsFile(filePath: string): TimeCardInput[] {
  assertLocalTimePath(filePath);
  if (!existsSync(filePath)) throw new Error("time card file is not on this machine");
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) throw new Error("local time file must be an object with cards");
  refuseVendorClaim(parsed);
  const list = Array.isArray(parsed.cards) ? parsed.cards : Array.isArray(parsed.rows) ? parsed.rows : null;
  if (!list?.length) throw new Error("local time file must be an object with cards");
  return list.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`time card ${index + 1} is not an object`);
    return cardFromRow(entry, index);
  });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function inferStatus(input: TimeCardInput, segments: TimeSegment[]): TimeCardStatus {
  if (input.status) return input.status;
  if (segments.some((segment) => segment.open && segment.kind === "clocked")) return "on-call";
  if (segments.some((segment) => segment.open && segment.kind === "travel")) return "travel";
  if (segments.some((segment) => segment.open && segment.kind === "idle")) return "idle";
  return "off";
}

export function recomputeTimeCard(input: TimeCardInput, now: string): TimeCard {
  const segments: TimeSegment[] = input.segments.map((segment) => {
    const open = segment.endedAt == null;
    const minutes =
      segment.minutes != null ? Math.round(segment.minutes) : minutesBetween(segment.startedAt, open ? now : segment.endedAt!, open);
    return { kind: segment.kind, startedAt: segment.startedAt, endedAt: segment.endedAt, minutes, open };
  });
  const clockedMinutes = sum(segments.filter((segment) => segment.kind === "clocked").map((segment) => segment.minutes));
  const travelMinutes = sum(segments.filter((segment) => segment.kind === "travel").map((segment) => segment.minutes));
  const idleMinutes = sum(segments.filter((segment) => segment.kind === "idle").map((segment) => segment.minutes));
  const status = inferStatus(input, segments);
  const openSegment = [...segments].reverse().find((segment) => segment.open) ?? null;
  const elapsedMinutes = openSegment?.minutes ?? clockedMinutes;
  const jobLeft = input.estimatedMinutes == null ? null : Math.max(0, Math.round(input.estimatedMinutes) - clockedMinutes);
  const openTravel = sum(segments.filter((segment) => segment.kind === "travel" && segment.open).map((segment) => segment.minutes));
  const travelLeft =
    input.travelEstimateMinutes == null ? null : Math.max(0, Math.round(input.travelEstimateMinutes) - openTravel);
  let estimatedRemainingMinutes: number | null;
  if (status === "idle" || status === "off") estimatedRemainingMinutes = 0;
  else if (status === "on-call") estimatedRemainingMinutes = jobLeft;
  else if (travelLeft == null && jobLeft == null) estimatedRemainingMinutes = null;
  else estimatedRemainingMinutes = (travelLeft ?? 0) + (jobLeft ?? 0);
  return {
    technicianId: input.technicianId,
    technicianName: input.technicianName,
    jobId: input.jobId,
    jobLabel: input.jobLabel,
    trade: input.trade,
    status,
    skills: input.skills,
    clockedMinutes,
    travelMinutes,
    idleMinutes,
    elapsedMinutes,
    estimatedRemainingMinutes,
    segments
  };
}

function totalsFor(cards: TimeCard[]): TimeTrackingBoard["totals"] {
  return {
    techs: cards.length,
    onCall: cards.filter((card) => card.status === "on-call").length,
    traveling: cards.filter((card) => card.status === "travel").length,
    idle: cards.filter((card) => card.status === "idle").length,
    clockedMinutes: sum(cards.map((card) => card.clockedMinutes)),
    travelMinutes: sum(cards.map((card) => card.travelMinutes)),
    idleMinutes: sum(cards.map((card) => card.idleMinutes))
  };
}

function board(args: {
  source: TimeTrackingBoard["source"];
  note: string;
  generatedAt: string;
  instanceId: string;
  sourcePath: string | null;
  sourceDigest: string;
  cards: TimeCard[];
}): TimeTrackingBoard {
  return {
    product: "trades-runtime",
    author: "Aziel Eliab",
    live_backends: false,
    writes: false,
    phoneHome: false,
    liveTelematics: false,
    telematicsVendor: false,
    vendorClaim: false,
    notALiveGps: true,
    source: args.source,
    dataLabel: args.source,
    path: defaultTimeTrackingPath(args.instanceId),
    auditPath: defaultTimeTrackingAuditPath(args.instanceId),
    sourcePath: args.sourcePath,
    sourceDigest: args.sourceDigest,
    written: false,
    note: args.note,
    generatedAt: args.generatedAt,
    cards: args.cards,
    totals: totalsFor(args.cards)
  };
}

export function loadTimeTracking(args: {
  cwd: string;
  instanceId: string;
  now: string;
  allowSynthetic: boolean;
  explicitPath?: string;
}): TimeTrackingBoard {
  const explicit = args.explicitPath ? resolvePath(args.cwd, args.explicitPath) : undefined;
  const candidates = explicit
    ? [explicit]
    : [resolvePath(args.cwd, defaultTimeCardsPath(args.instanceId)), resolvePath(args.cwd, inboundTimeCardsPath())];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const inputs = readTimeCardsFile(path);
      const text = readFileSync(path, "utf8");
      return board({
        source: "local-file",
        note: LOCAL_NOTE,
        generatedAt: args.now,
        instanceId: args.instanceId,
        sourcePath: path,
        sourceDigest: sha256(text),
        cards: inputs.map((input) => recomputeTimeCard(input, args.now))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return board({
        source: "unknown",
        note: `${message} Time cards stay empty. A synthetic demo is not substituted for a refused or unreadable file.`,
        generatedAt: args.now,
        instanceId: args.instanceId,
        sourcePath: path,
        sourceDigest: "refused",
        cards: []
      });
    }
  }
  if (explicit) {
    return board({
      source: "unknown",
      note: "The named time card file is not on this machine. A live timeclock is not connected.",
      generatedAt: args.now,
      instanceId: args.instanceId,
      sourcePath: explicit,
      sourceDigest: "missing",
      cards: []
    });
  }
  if (args.allowSynthetic) {
    return board({
      source: "synthetic-demo",
      note: DEMO_NOTE,
      generatedAt: args.now,
      instanceId: args.instanceId,
      sourcePath: null,
      sourceDigest: sha256(SYNTHETIC_TIME_INPUTS),
      cards: SYNTHETIC_TIME_INPUTS.map((input) => recomputeTimeCard(input, args.now))
    });
  }
  return board({
    source: "unknown",
    note: "No local time cards on this machine. A live timeclock is not connected. Elapsed time is not invented from jobs.",
    generatedAt: args.now,
    instanceId: args.instanceId,
    sourcePath: null,
    sourceDigest: "empty",
    cards: []
  });
}

export function persistTimeTracking(args: { cwd: string; report: TimeTrackingBoard }): TimeTrackingBoard {
  const jsonPath = assertLocalTimePath(join(args.cwd, args.report.path));
  const auditPath = assertLocalTimePath(join(args.cwd, args.report.auditPath));
  mkdirSync(join(jsonPath, ".."), { recursive: true });
  const stored: TimeTrackingBoard = { ...args.report, written: true };
  writeFileSync(jsonPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  const line = {
    at: stored.generatedAt,
    sourceDigest: stored.sourceDigest,
    source: stored.source,
    cardCount: stored.cards.length,
    onCall: stored.totals.onCall,
    clockedMinutes: stored.totals.clockedMinutes,
    live_backends: false as const,
    writes: false as const,
    phoneHome: false as const,
    author: "Aziel Eliab" as const
  };
  let append = true;
  if (existsSync(auditPath)) {
    const text = readFileSync(auditPath, "utf8").trim();
    const last = text ? text.split("\n").at(-1) : "";
    if (last) {
      try {
        const parsed = JSON.parse(last) as { sourceDigest?: string };
        if (parsed.sourceDigest === stored.sourceDigest) append = false;
      } catch {
        append = true;
      }
    }
  }
  if (append) appendFileSync(auditPath, `${JSON.stringify(line)}\n`, "utf8");
  return stored;
}
