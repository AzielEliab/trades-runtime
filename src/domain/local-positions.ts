import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Local tech and truck pins for the operator desk map.
 * An optional file on this machine. A missing file stays empty, except the empty-folder desk,
 * which may show a labeled synthetic demo.
 * This is not a live GPS feed and not a telematics vendor.
 */

export interface LocalPin {
  technicianId: string;
  technicianName: string | null;
  lat: number;
  lng: number;
  kind: "tech" | "truck";
  at: string | null;
}

export interface LocalPositionBoard {
  product: "trades-runtime";
  live_backends: false;
  writes: false;
  phoneHome: false;
  liveTelematics: false;
  telematicsVendor: false;
  vendorClaim: false;
  notALiveGps: true;
  source: "synthetic-demo" | "local-file" | "unknown";
  path: string | null;
  note: string;
  pins: LocalPin[];
}

/** In-repo pins for the empty-folder desk. A fixture, not a live trace and not a company export. */
export const SYNTHETIC_POSITIONS: readonly LocalPin[] = [
  { technicianId: "tech-maya", technicianName: "Maya Chen", lat: 41.88, lng: -87.63, kind: "tech", at: "2026-09-25T14:10:00Z" },
  { technicianId: "tech-luis", technicianName: "Luis Ortega", lat: 41.84, lng: -87.72, kind: "tech", at: "2026-09-25T14:12:00Z" },
  { technicianId: "tech-priya", technicianName: "Priya Shah", lat: 41.91, lng: -87.68, kind: "tech", at: "2026-09-25T14:05:00Z" },
  { technicianId: "tech-andre", technicianName: "Andre Cole", lat: 41.79, lng: -87.59, kind: "truck", at: "2026-09-25T14:20:00Z" },
  { technicianId: "tech-sam", technicianName: "Sam Okonkwo", lat: 41.86, lng: -87.55, kind: "tech", at: "2026-09-25T13:55:00Z" }
];

const DEMO_NOTE =
  "Synthetic demo positions on this machine. Not a live GPS feed. Not a telematics vendor. Not a company export. live_backends false.";

const LOCAL_NOTE =
  "BYO drop-in positions on this machine. Not a live GPS feed. Not a telematics vendor. Pins refresh when this local file changes. live_backends false.";

const MILES_NOTE =
  "Positions copied from the local miles file. Mile totals still ignore coordinates. Not a live GPS feed. Not a telematics vendor. live_backends false.";

function assertLocalPositionPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === "data/tenants" || normalized.startsWith("data/tenants/") || normalized.includes("/tenants/")) {
    throw new Error("hosted position layout is refused; pins stay on this machine");
  }
  return filePath;
}

function sanitizeInstanceId(instanceId: string): string {
  const id = instanceId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!id || id === "shared" || id === "hosted" || id === "tenants") {
    throw new Error("local positions require a local instance id (not shared/hosted/tenants)");
  }
  return id;
}

export function defaultPositionsPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalPositionPath(join(root, sanitizeInstanceId(instanceId), "positions.json"));
}

export function inboundPositionsPath(root = "data/inbound"): string {
  return assertLocalPositionPath(join(root, "positions.json"));
}

function resolvePath(cwd: string, filePath: string): string {
  if (filePath.startsWith("/")) return assertLocalPositionPath(filePath);
  return assertLocalPositionPath(join(cwd, filePath));
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function refuseVendorClaim(doc: Record<string, unknown>): void {
  if (doc.liveTelematics === true || doc.liveGps === true || doc.live_backends === true) {
    throw new Error("local position file must not claim a live telematics or GPS backend");
  }
  for (const key of ["telematicsVendor", "vendor", "gpsVendor"] as const) {
    if (typeof doc[key] === "string" && doc[key].trim()) {
      throw new Error("local position file must not claim a live telematics or GPS vendor");
    }
  }
  if (typeof doc.source === "string" && doc.source.trim() && doc.source !== "operator-file" && doc.source !== "local-file") {
    throw new Error("local position file must not claim a live telematics or GPS vendor");
  }
}

function pinFromRow(row: Record<string, unknown>, index: number): LocalPin | null {
  const lat = readNumber(row.lat ?? row.latitude);
  const lng = readNumber(row.lng ?? row.lon ?? row.longitude);
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error(`position row ${index + 1} has a latitude or longitude outside range`);
  }
  const technicianId = typeof row.technicianId === "string" ? row.technicianId.trim() : "";
  if (!technicianId) throw new Error(`position row ${index + 1} needs a technicianId`);
  const name = typeof row.technicianName === "string" && row.technicianName.trim() ? row.technicianName.trim() : null;
  const kind = row.kind === "truck" ? "truck" : "tech";
  const at = typeof row.at === "string" && row.at.trim() ? row.at.trim() : typeof row.day === "string" ? row.day.trim() : null;
  return { technicianId, technicianName: name, lat, lng, kind, at };
}

function latestPins(pins: LocalPin[]): LocalPin[] {
  const byTech = new Map<string, LocalPin>();
  for (const pin of pins) {
    const prior = byTech.get(pin.technicianId);
    if (!prior) {
      byTech.set(pin.technicianId, pin);
      continue;
    }
    const priorAt = prior.at ? Date.parse(prior.at) : Number.NaN;
    const nextAt = pin.at ? Date.parse(pin.at) : Number.NaN;
    if (!Number.isFinite(priorAt) || (Number.isFinite(nextAt) && nextAt >= priorAt)) byTech.set(pin.technicianId, pin);
  }
  return [...byTech.values()].sort((a, b) => (a.technicianName ?? a.technicianId).localeCompare(b.technicianName ?? b.technicianId));
}

export function readPositionFile(filePath: string): LocalPin[] {
  assertLocalPositionPath(filePath);
  if (!existsSync(filePath)) throw new Error("position file is not on this machine");
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) throw new Error("local position file must be an object with pins or rows");
  refuseVendorClaim(parsed);
  const list = Array.isArray(parsed.pins) ? parsed.pins : Array.isArray(parsed.rows) ? parsed.rows : null;
  if (!list) throw new Error("local position file must be an object with pins or rows");
  const pins: LocalPin[] = [];
  list.forEach((entry, index) => {
    if (!isRecord(entry)) throw new Error(`position row ${index + 1} is not an object`);
    const pin = pinFromRow(entry, index);
    if (pin) pins.push(pin);
  });
  if (!pins.length) throw new Error("local position file has no latitude and longitude");
  return latestPins(pins);
}

/** Coordinates on a miles file. The miles reader still ignores them for mile totals. */
export function pinsFromMilesFile(filePath: string): LocalPin[] {
  assertLocalPositionPath(filePath);
  if (!existsSync(filePath)) return [];
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) return [];
  refuseVendorClaim(parsed);
  if (!Array.isArray(parsed.rows)) return [];
  const pins: LocalPin[] = [];
  parsed.rows.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const pin = pinFromRow(entry, index);
    if (pin) pins.push(pin);
  });
  return latestPins(pins);
}

function board(source: LocalPositionBoard["source"], path: string | null, note: string, pins: LocalPin[]): LocalPositionBoard {
  return {
    product: "trades-runtime",
    live_backends: false,
    writes: false,
    phoneHome: false,
    liveTelematics: false,
    telematicsVendor: false,
    vendorClaim: false,
    notALiveGps: true,
    source,
    path,
    note,
    pins
  };
}

function unknownBoard(path: string | null, note: string): LocalPositionBoard {
  return board("unknown", path, note, []);
}

export function loadLocalPositions(args: {
  cwd: string;
  instanceId: string;
  allowSynthetic: boolean;
  explicitPath?: string;
  milesPath?: string;
}): LocalPositionBoard {
  const explicit = args.explicitPath ? resolvePath(args.cwd, args.explicitPath) : undefined;
  const positionCandidates = explicit
    ? [explicit]
    : [resolvePath(args.cwd, defaultPositionsPath(args.instanceId)), resolvePath(args.cwd, inboundPositionsPath())];
  for (const path of positionCandidates) {
    if (!existsSync(path)) continue;
    try {
      return board("local-file", path, LOCAL_NOTE, readPositionFile(path));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return unknownBoard(path, `${message} Positions stay empty. A synthetic demo is not substituted for a refused or unreadable file.`);
    }
  }
  if (explicit) {
    return unknownBoard(explicit, "The named position file is not on this machine. A live GPS feed is not connected.");
  }
  const milesCandidates = args.milesPath
    ? [resolvePath(args.cwd, args.milesPath)]
    : [resolvePath(args.cwd, join("data/runtime", sanitizeInstanceId(args.instanceId), "drive-miles.json")), resolvePath(args.cwd, join("data/inbound", "drive-miles.json"))];
  for (const path of milesCandidates) {
    if (!existsSync(path)) continue;
    try {
      const pins = pinsFromMilesFile(path);
      if (pins.length) return board("local-file", path, MILES_NOTE, pins);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return unknownBoard(path, `${message} Positions stay empty. A synthetic demo is not substituted for a refused miles file.`);
    }
  }
  if (args.allowSynthetic) return board("synthetic-demo", null, DEMO_NOTE, [...SYNTHETIC_POSITIONS]);
  return unknownBoard(null, "No local positions on this machine. A live GPS feed is not connected. Pins are not invented from jobs.");
}
