import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Local miles and drive performance.
 * An optional file on this machine is read-only.
 * A missing file stays unknown, except the empty-folder desk, which may show a labeled synthetic demo.
 * Coordinates are ignored. This module does not talk to a GPS or telematics vendor.
 */

export interface DriveLeg {
  day: string;
  technicianId: string;
  technicianName: string | null;
  miles: number;
  driveMinutes: number | null;
  stops: number | null;
}

export interface DriveDayPoint {
  t: string;
  miles: number;
}

export interface DriveTechRow {
  technicianId: string;
  technicianName: string | null;
  miles: number;
  driveMinutes: number | null;
  stops: number | null;
  milesPerStop: number | null;
  minutesPerStop: number | null;
}

export interface DrivePerformance {
  product: "trades-runtime";
  live_backends: false;
  writes: false;
  phoneHome: false;
  liveTelematics: false;
  telematicsVendor: false;
  vendorClaim: false;
  notAGpsTrace: true;
  coordinatesIgnored: boolean;
  source: "synthetic-demo" | "local-file" | "unknown";
  path: string | null;
  note: string;
  totalMiles: number | null;
  totalDriveMinutes: number | null;
  totalStops: number | null;
  milesPerStop: number | null;
  minutesPerStop: number | null;
  milesPerCompletedJob: number | null;
  completedJobs: number | null;
  days: DriveDayPoint[];
  techs: DriveTechRow[];
}

/** In-repo miles for the empty-folder desk. A fixture, not a GPS trace and not a company export. */
export const SYNTHETIC_DRIVE_LEGS: readonly DriveLeg[] = [
  { day: "2026-09-19", technicianId: "tech-andre", technicianName: "Andre Cole", miles: 38, driveMinutes: 55, stops: 2 },
  { day: "2026-09-20", technicianId: "tech-priya", technicianName: "Priya Shah", miles: 22, driveMinutes: 40, stops: 2 },
  { day: "2026-09-21", technicianId: "tech-priya", technicianName: "Priya Shah", miles: 31, driveMinutes: 48, stops: 2 },
  { day: "2026-09-22", technicianId: "tech-luis", technicianName: "Luis Ortega", miles: 27, driveMinutes: 44, stops: 2 },
  { day: "2026-09-23", technicianId: "tech-maya", technicianName: "Maya Chen", miles: 19, driveMinutes: 30, stops: 2 },
  { day: "2026-09-24", technicianId: "tech-maya", technicianName: "Maya Chen", miles: 24, driveMinutes: 36, stops: 2 },
  { day: "2026-09-24", technicianId: "tech-sam", technicianName: "Sam Okonkwo", miles: 18, driveMinutes: 28, stops: 2 },
  { day: "2026-09-25", technicianId: "tech-maya", technicianName: "Maya Chen", miles: 16, driveMinutes: 25, stops: 1 },
  { day: "2026-09-25", technicianId: "tech-luis", technicianName: "Luis Ortega", miles: 33, driveMinutes: 50, stops: 2 },
  { day: "2026-09-25", technicianId: "tech-andre", technicianName: "Andre Cole", miles: 41, driveMinutes: 62, stops: 2 }
];

const COORD_KEYS = new Set([
  "lat",
  "lng",
  "latitude",
  "longitude",
  "coordinates",
  "coord",
  "heading",
  "speed",
  "gps",
  "trace"
]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function assertLocalDrivePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === "data/tenants" || normalized.startsWith("data/tenants/") || normalized.includes("/tenants/")) {
    throw new Error("hosted miles layout is refused; drive miles stay on this machine");
  }
  return filePath;
}

/** Operator-machine path. Read-only. Not a vendor account. */
export function defaultDriveMilesPath(instanceId: string, root = "data/runtime"): string {
  const id = instanceId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!id || id === "shared" || id === "hosted" || id === "tenants") {
    throw new Error("drive miles require a local instance id (not shared/hosted/tenants)");
  }
  return assertLocalDrivePath(join(root, id, "drive-miles.json"));
}

/** Optional drop at the inbound root. Not inside a vendor folder and not a GPS feed. */
export function inboundDriveMilesPath(root = "data/inbound"): string {
  return assertLocalDrivePath(join(root, "drive-miles.json"));
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function assertNonNegative(value: number, label: string): number {
  if (value < 0) throw new Error(`${label} must be a non-negative number`);
  return value;
}

function rowHasCoordinates(row: Record<string, unknown>): boolean {
  return Object.keys(row).some((key) => COORD_KEYS.has(key.toLowerCase()));
}

export function readDriveMilesFile(filePath: string): { rows: DriveLeg[]; coordinatesIgnored: boolean } {
  assertLocalDrivePath(filePath);
  if (!existsSync(filePath)) throw new Error("drive miles file is not on this machine");
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("local miles file must be an object with rows");
  }
  const doc = parsed as Record<string, unknown>;
  if (doc.liveTelematics === true) {
    throw new Error("local miles file must not claim a live telematics vendor");
  }
  for (const key of ["telematicsVendor", "vendor", "gpsVendor"] as const) {
    if (typeof doc[key] === "string" && doc[key].trim()) {
      throw new Error("local miles file must not claim a live telematics vendor");
    }
  }
  if (typeof doc.source === "string" && doc.source.trim() && doc.source !== "operator-file" && doc.source !== "local-file") {
    throw new Error("local miles file must not claim a live telematics vendor");
  }
  if (!Array.isArray(doc.rows)) throw new Error("local miles file must be an object with rows");

  let coordinatesIgnored = false;
  const rows: DriveLeg[] = doc.rows.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`miles row ${index + 1} is not an object`);
    }
    const row = entry as Record<string, unknown>;
    if (rowHasCoordinates(row)) coordinatesIgnored = true;
    const day = typeof row.day === "string" ? row.day.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`miles row ${index + 1} needs a YYYY-MM-DD day`);
    const technicianId = typeof row.technicianId === "string" ? row.technicianId.trim() : "";
    if (!technicianId) throw new Error(`miles row ${index + 1} needs a technicianId`);
    const miles = readNumber(row.miles);
    if (miles == null) throw new Error(`miles row ${index + 1} is missing miles`);
    const driveMinutes = row.driveMinutes == null || row.driveMinutes === "" ? null : readNumber(row.driveMinutes);
    if (row.driveMinutes != null && row.driveMinutes !== "" && driveMinutes == null) {
      throw new Error(`miles row ${index + 1} has a driveMinutes value that is not a number`);
    }
    const stops = row.stops == null || row.stops === "" ? null : readNumber(row.stops);
    if (row.stops != null && row.stops !== "" && stops == null) {
      throw new Error(`miles row ${index + 1} has a stops value that is not a number`);
    }
    if (stops != null && !Number.isInteger(stops)) throw new Error(`miles row ${index + 1} stops must be a whole number`);
    const name = typeof row.technicianName === "string" && row.technicianName.trim() ? row.technicianName.trim() : null;
    return {
      day,
      technicianId,
      technicianName: name,
      miles: round2(assertNonNegative(miles, `miles row ${index + 1}`)),
      driveMinutes: driveMinutes == null ? null : round2(assertNonNegative(driveMinutes, `miles row ${index + 1} drive minutes`)),
      stops: stops == null ? null : assertNonNegative(stops, `miles row ${index + 1} stops`)
    };
  });
  return { rows, coordinatesIgnored };
}

function sum(values: number[]): number {
  return round2(values.reduce((total, value) => total + value, 0));
}

export function summarizeDrive(args: {
  source: "synthetic-demo" | "local-file";
  path: string | null;
  rows: readonly DriveLeg[];
  completedJobs: number | null;
  coordinatesIgnored?: boolean;
  note?: string;
}): DrivePerformance {
  const miles = args.rows.map((row) => row.miles);
  const totalMiles = sum(miles);
  const minutesNamed = args.rows.every((row) => row.driveMinutes != null);
  const stopsNamed = args.rows.every((row) => row.stops != null);
  const totalDriveMinutes = args.rows.length && minutesNamed ? sum(args.rows.map((row) => row.driveMinutes ?? 0)) : null;
  const totalStops = args.rows.length && stopsNamed ? args.rows.reduce((total, row) => total + (row.stops ?? 0), 0) : null;
  const completed = args.completedJobs != null && args.completedJobs > 0 ? args.completedJobs : null;
  const byDay = new Map<string, number>();
  const byTech = new Map<string, DriveTechRow>();
  for (const row of args.rows) {
    byDay.set(row.day, round2((byDay.get(row.day) ?? 0) + row.miles));
    const existing = byTech.get(row.technicianId) ?? {
      technicianId: row.technicianId,
      technicianName: row.technicianName,
      miles: 0,
      driveMinutes: 0,
      stops: 0,
      milesPerStop: null,
      minutesPerStop: null
    };
    if (!existing.technicianName && row.technicianName) existing.technicianName = row.technicianName;
    existing.miles = round2(existing.miles + row.miles);
    if (row.driveMinutes == null) existing.driveMinutes = null;
    else if (existing.driveMinutes != null) existing.driveMinutes = round2(existing.driveMinutes + row.driveMinutes);
    if (row.stops == null) existing.stops = null;
    else if (existing.stops != null) existing.stops += row.stops;
    byTech.set(row.technicianId, existing);
  }
  const techs = [...byTech.values()]
    .map((tech) => ({
      ...tech,
      milesPerStop: tech.stops != null && tech.stops > 0 ? round2(tech.miles / tech.stops) : null,
      minutesPerStop:
        tech.driveMinutes != null && tech.stops != null && tech.stops > 0 ? round2(tech.driveMinutes / tech.stops) : null
    }))
    .sort((a, b) => a.technicianName?.localeCompare(b.technicianName ?? "") || a.technicianId.localeCompare(b.technicianId));
  const defaultNote =
    args.source === "synthetic-demo"
      ? "Synthetic demo miles on this machine. Not a GPS trace. Not a telematics vendor. Not a company export. Missing drive minutes or stops stay unknown and are not treated as zero."
      : "Miles read from a local file on this machine. live telematics false. No GPS vendor integration. Coordinates, if present, are ignored. Missing drive minutes or stops stay unknown and are not treated as zero.";
  return {
    product: "trades-runtime",
    live_backends: false,
    writes: false,
    phoneHome: false,
    liveTelematics: false,
    telematicsVendor: false,
    vendorClaim: false,
    notAGpsTrace: true,
    coordinatesIgnored: args.coordinatesIgnored === true,
    source: args.source,
    path: args.path,
    note: args.note ?? defaultNote,
    totalMiles,
    totalDriveMinutes,
    totalStops,
    milesPerStop: totalStops != null && totalStops > 0 ? round2(totalMiles / totalStops) : null,
    minutesPerStop:
      totalDriveMinutes != null && totalStops != null && totalStops > 0 ? round2(totalDriveMinutes / totalStops) : null,
    milesPerCompletedJob: completed != null ? round2(totalMiles / completed) : null,
    completedJobs: args.completedJobs,
    days: [...byDay.entries()].map(([t, dayMiles]) => ({ t, miles: dayMiles })).sort((a, b) => a.t.localeCompare(b.t)),
    techs
  };
}

function unknownDrive(path: string | null, note: string, coordinatesIgnored = false): DrivePerformance {
  return {
    product: "trades-runtime",
    live_backends: false,
    writes: false,
    phoneHome: false,
    liveTelematics: false,
    telematicsVendor: false,
    vendorClaim: false,
    notAGpsTrace: true,
    coordinatesIgnored,
    source: "unknown",
    path,
    note,
    totalMiles: null,
    totalDriveMinutes: null,
    totalStops: null,
    milesPerStop: null,
    minutesPerStop: null,
    milesPerCompletedJob: null,
    completedJobs: null,
    days: [],
    techs: []
  };
}

function resolvePath(cwd: string, filePath: string): string {
  if (filePath.startsWith("/")) return filePath;
  return join(cwd, filePath);
}

/**
 * Read a local miles file when one is present.
 * A missing file stays unknown unless the empty-folder desk is allowed to show the synthetic fixture.
 * A file that claims a live vendor stays unknown. The fixture is not substituted for that refusal.
 */
export function loadDrivePerformance(args: {
  cwd: string;
  instanceId: string;
  explicitPath?: string;
  allowSynthetic: boolean;
  completedJobs: number | null;
}): DrivePerformance {
  const explicit = args.explicitPath ? resolvePath(args.cwd, args.explicitPath) : undefined;
  const candidates = explicit
    ? [explicit]
    : [
        resolvePath(args.cwd, defaultDriveMilesPath(args.instanceId)),
        resolvePath(args.cwd, inboundDriveMilesPath())
      ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const read = readDriveMilesFile(path);
      return summarizeDrive({
        source: "local-file",
        path,
        rows: read.rows,
        completedJobs: args.completedJobs,
        coordinatesIgnored: read.coordinatesIgnored
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return unknownDrive(
        path,
        `${message} Miles stay unknown. A synthetic demo is not substituted for a refused or unreadable file.`
      );
    }
  }
  if (explicit) {
    return unknownDrive(explicit, "The named miles file is not on this machine. Miles stay unknown. They are not invented from jobs.");
  }
  if (args.allowSynthetic) {
    return summarizeDrive({
      source: "synthetic-demo",
      path: null,
      rows: SYNTHETIC_DRIVE_LEGS,
      completedJobs: args.completedJobs
    });
  }
  return unknownDrive(null, "No local miles file. Miles stay unknown. They are not invented from jobs.");
}
