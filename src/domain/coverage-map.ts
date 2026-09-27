import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Local service-coverage shapes for the operator desk.
 * Zip codes, counties, cities, and roads or highways.
 * An optional GeoJSON-ish file on this machine. A missing file stays empty,
 * except the empty-folder desk, which may show a labeled synthetic demo.
 * Layer switches are a human toggle stored on this machine.
 * This is not a live map-tile vendor and not a GPS feed.
 */

export const COVERAGE_LAYERS = ["zipcodes", "counties", "cities", "roads"] as const;
export type CoverageLayerId = (typeof COVERAGE_LAYERS)[number];

export interface CoverageJobSite {
  id: string;
  trade: string | null;
  label: string | null;
  lat: number | null;
  lng: number | null;
}

export interface CoverageFeature {
  id: string;
  name: string;
  layer: CoverageLayerId;
  kind: "polygon" | "line";
  /** [lng, lat] ring or line. Not a live tile. */
  coordinates: number[][];
  jobs: string[];
  techs: string[];
}

export interface CoveragePlaceCount {
  id: string;
  name: string;
  jobs: number;
  techs: number;
}

export interface CoverageBreakdown {
  layer: CoverageLayerId;
  label: string;
  enabled: boolean;
  features: number;
  jobs: number;
  techs: number;
  places: CoveragePlaceCount[];
}

export type CoverageLayerState = Record<CoverageLayerId, boolean>;

export interface CoverageBoard {
  product: "trades-runtime";
  author: "Aziel Eliab";
  live_backends: false;
  writes: false;
  phoneHome: false;
  liveTelematics: false;
  telematicsVendor: false;
  mapTileVendor: false;
  vendorClaim: false;
  notALiveGps: true;
  addressMapDrawn: false;
  source: "synthetic-demo" | "local-file" | "unknown";
  dataLabel: "synthetic-demo" | "local-file" | "unknown";
  path: string | null;
  layerPath: string;
  note: string;
  layers: CoverageLayerState;
  jobs: CoverageJobSite[];
  features: CoverageFeature[];
  breakdowns: CoverageBreakdown[];
  totals: { features: number; jobs: number; techs: number };
}

export interface CoveragePin {
  technicianId: string;
  technicianName: string | null;
  lat: number;
  lng: number;
}

const LAYER_LABELS: Record<CoverageLayerId, string> = {
  zipcodes: "Zip codes",
  counties: "Counties",
  cities: "Cities",
  roads: "Roads / highways"
};

const DEMO_NOTE =
  "Synthetic demo coverage on this machine. Zip codes, counties, cities, and roads are a labeled fixture. Not a live map-tile vendor. Not a live GPS feed. Not a company export. live_backends false.";

const LOCAL_NOTE =
  "BYO drop-in coverage on this machine. Shapes and counts refresh when this local file changes. Not a live map-tile vendor. Not a live GPS feed. live_backends false.";

function rect(minLng: number, minLat: number, maxLng: number, maxLat: number): number[][] {
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat]
  ];
}

const SYNTHETIC_JOBS: CoverageJobSite[] = [
  { id: "SYN-DESK-HVAC-1", trade: "hvac", label: "No cool", lat: 41.9, lng: -87.66 },
  { id: "SYN-DESK-PL-1", trade: "plumbing", label: "Return visit", lat: 41.845, lng: -87.71 },
  { id: "SYN-DESK-EL-1", trade: "electrical", label: "Panel", lat: 41.905, lng: -87.675 },
  { id: "SYN-DESK-SW-1", trade: "sewer", label: "Sewer line", lat: 41.8, lng: -87.6 },
  { id: "SYN-DESK-XT-1", trade: "cross-trades", label: "Cross trade", lat: 41.855, lng: -87.56 }
];

/** In-repo shapes for the empty-folder desk. A fixture, not a surveyed boundary and not a tile service. */
export const SYNTHETIC_COVERAGE_FEATURES: readonly CoverageFeature[] = [
  { id: "60607", name: "60607", layer: "zipcodes", kind: "polygon", coordinates: rect(-87.68, 41.86, -87.62, 41.91), jobs: ["SYN-DESK-HVAC-1"], techs: ["tech-maya"] },
  { id: "60608", name: "60608", layer: "zipcodes", kind: "polygon", coordinates: rect(-87.76, 41.82, -87.68, 41.87), jobs: ["SYN-DESK-PL-1"], techs: ["tech-luis"] },
  { id: "60622", name: "60622", layer: "zipcodes", kind: "polygon", coordinates: rect(-87.72, 41.89, -87.65, 41.94), jobs: ["SYN-DESK-EL-1"], techs: ["tech-priya"] },
  { id: "60616", name: "60616", layer: "zipcodes", kind: "polygon", coordinates: rect(-87.64, 41.76, -87.54, 41.83), jobs: ["SYN-DESK-SW-1"], techs: ["tech-andre"] },
  { id: "60611", name: "60611", layer: "zipcodes", kind: "polygon", coordinates: rect(-87.6, 41.83, -87.52, 41.88), jobs: ["SYN-DESK-XT-1"], techs: ["tech-sam"] },
  {
    id: "cook",
    name: "Cook",
    layer: "counties",
    kind: "polygon",
    coordinates: rect(-87.8, 41.74, -87.5, 41.96),
    jobs: SYNTHETIC_JOBS.map((job) => job.id),
    techs: ["tech-maya", "tech-luis", "tech-priya", "tech-andre", "tech-sam"]
  },
  {
    id: "chicago",
    name: "Chicago",
    layer: "cities",
    kind: "polygon",
    coordinates: rect(-87.78, 41.75, -87.52, 41.95),
    jobs: SYNTHETIC_JOBS.map((job) => job.id),
    techs: ["tech-maya", "tech-luis", "tech-priya", "tech-andre", "tech-sam"]
  },
  {
    id: "i-90",
    name: "I-90/94",
    layer: "roads",
    kind: "line",
    coordinates: [
      [-87.65, 41.76],
      [-87.65, 41.94]
    ],
    jobs: ["SYN-DESK-HVAC-1"],
    techs: []
  },
  {
    id: "i-290",
    name: "I-290",
    layer: "roads",
    kind: "line",
    coordinates: [
      [-87.76, 41.87],
      [-87.54, 41.87]
    ],
    jobs: ["SYN-DESK-XT-1"],
    techs: []
  }
];

const ROAD_NEAR_DEGREES = 0.03;

function assertLocalCoveragePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === "data/tenants" || normalized.startsWith("data/tenants/") || normalized.includes("/tenants/")) {
    throw new Error("hosted coverage layout is refused; coverage stays on this machine");
  }
  return filePath;
}

function sanitizeInstanceId(instanceId: string): string {
  const id = instanceId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!id || id === "shared" || id === "hosted" || id === "tenants") {
    throw new Error("local coverage requires a local instance id (not shared/hosted/tenants)");
  }
  return id;
}

export function defaultCoveragePath(instanceId: string, root = "data/runtime"): string {
  return assertLocalCoveragePath(join(root, sanitizeInstanceId(instanceId), "coverage.json"));
}

export function inboundCoveragePath(root = "data/inbound"): string {
  return assertLocalCoveragePath(join(root, "coverage.json"));
}

export function defaultCoverageLayersPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalCoveragePath(join(root, sanitizeInstanceId(instanceId), "coverage-layers.json"));
}

function resolvePath(cwd: string, filePath: string): string {
  if (filePath.startsWith("/")) return assertLocalCoveragePath(filePath);
  return assertLocalCoveragePath(join(cwd, filePath));
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

export function normalizeCoverageLayer(value: string): CoverageLayerId | null {
  const text = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (text === "zip" || text === "zipcode" || text === "zipcodes" || text === "zips") return "zipcodes";
  if (text === "county" || text === "counties") return "counties";
  if (text === "city" || text === "cities") return "cities";
  if (text === "road" || text === "roads" || text === "highway" || text === "highways" || text === "roads-highways") return "roads";
  return null;
}

export function defaultCoverageLayers(): CoverageLayerState {
  return { zipcodes: true, counties: true, cities: true, roads: true };
}

export function coverageLayerLabel(layer: CoverageLayerId): string {
  return LAYER_LABELS[layer];
}

function refuseVendorClaim(doc: Record<string, unknown>): void {
  if (doc.liveTelematics === true || doc.liveGps === true || doc.live_backends === true || doc.liveMap === true) {
    throw new Error("local coverage file must not claim a live map, telematics, or GPS backend");
  }
  for (const key of ["telematicsVendor", "vendor", "gpsVendor", "mapTileVendor", "tileVendor"] as const) {
    if (typeof doc[key] === "string" && doc[key].trim()) {
      throw new Error("local coverage file must not claim a live map or GPS vendor");
    }
  }
  if (typeof doc.source === "string" && doc.source.trim() && doc.source !== "operator-file" && doc.source !== "local-file") {
    throw new Error("local coverage file must not claim a live map or GPS vendor");
  }
}

function pairList(value: unknown, label: string): number[][] {
  if (!Array.isArray(value) || value.length < 2) throw new Error(`${label} needs coordinates`);
  return value.map((pair, index) => {
    if (!Array.isArray(pair) || pair.length < 2) throw new Error(`${label} coordinate ${index + 1} needs longitude and latitude`);
    const lng = readNumber(pair[0]);
    const lat = readNumber(pair[1]);
    if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error(`${label} coordinate ${index + 1} is outside range`);
    }
    return [lng, lat];
  });
}

function geometryOf(row: Record<string, unknown>, label: string): { kind: "polygon" | "line"; coordinates: number[][] } {
  const geometry = isRecord(row.geometry) ? row.geometry : row;
  const type = typeof geometry.type === "string" ? geometry.type.trim().toLowerCase() : "";
  const coordinates = geometry.coordinates;
  if (type === "linestring" || type === "line") {
    return { kind: "line", coordinates: pairList(coordinates, label) };
  }
  if (type === "polygon") {
    if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) throw new Error(`${label} polygon needs a ring`);
    const ring = Array.isArray(coordinates[0][0]) ? coordinates[0] : coordinates;
    return { kind: "polygon", coordinates: pairList(ring, label) };
  }
  if (Array.isArray(coordinates) && Array.isArray(coordinates[0]) && typeof coordinates[0][0] === "number") {
    return { kind: "polygon", coordinates: pairList(coordinates, label) };
  }
  throw new Error(`${label} needs a Polygon or LineString`);
}

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function featureFromRow(row: Record<string, unknown>, index: number): CoverageFeature {
  const layerRaw = typeof row.layer === "string" ? row.layer : typeof row.properties === "object" && row.properties && typeof (row.properties as Record<string, unknown>).layer === "string" ? String((row.properties as Record<string, unknown>).layer) : "";
  const layer = normalizeCoverageLayer(layerRaw);
  if (!layer) throw new Error(`coverage feature ${index + 1} layer must be zipcodes, counties, cities, or roads`);
  const props = isRecord(row.properties) ? row.properties : row;
  const id = typeof props.id === "string" && props.id.trim() ? props.id.trim() : typeof row.id === "string" ? row.id.trim() : "";
  if (!id) throw new Error(`coverage feature ${index + 1} needs an id`);
  const name = typeof props.name === "string" && props.name.trim() ? props.name.trim() : id;
  const geometry = geometryOf(row, `coverage feature ${index + 1}`);
  return {
    id,
    name,
    layer,
    kind: geometry.kind,
    coordinates: geometry.coordinates,
    jobs: idList(props.jobs ?? row.jobs),
    techs: idList(props.techs ?? row.techs)
  };
}

function jobFromRow(row: Record<string, unknown>, index: number): CoverageJobSite {
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : typeof row.jobId === "string" ? row.jobId.trim() : "";
  if (!id) throw new Error(`coverage job ${index + 1} needs an id`);
  const lat = row.lat == null && row.latitude == null ? null : readNumber(row.lat ?? row.latitude);
  const lng = row.lng == null && row.lon == null && row.longitude == null ? null : readNumber(row.lng ?? row.lon ?? row.longitude);
  if ((row.lat != null || row.latitude != null) && lat == null) throw new Error(`coverage job ${index + 1} latitude is not a number`);
  if ((row.lng != null || row.lon != null || row.longitude != null) && lng == null) throw new Error(`coverage job ${index + 1} longitude is not a number`);
  if (lat != null && (lat < -90 || lat > 90)) throw new Error(`coverage job ${index + 1} latitude is outside range`);
  if (lng != null && (lng < -180 || lng > 180)) throw new Error(`coverage job ${index + 1} longitude is outside range`);
  return {
    id,
    trade: typeof row.trade === "string" && row.trade.trim() ? row.trade.trim().toLowerCase() : null,
    label: typeof row.label === "string" && row.label.trim() ? row.label.trim() : null,
    lat,
    lng
  };
}

export function readCoverageFile(filePath: string): { features: CoverageFeature[]; jobs: CoverageJobSite[] } {
  assertLocalCoveragePath(filePath);
  if (!existsSync(filePath)) throw new Error("coverage file is not on this machine");
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) throw new Error("local coverage file must be an object with features");
  refuseVendorClaim(parsed);
  const list = Array.isArray(parsed.features) ? parsed.features : null;
  if (!list?.length) throw new Error("local coverage file must be an object with features");
  const features = list.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`coverage feature ${index + 1} is not an object`);
    return featureFromRow(entry, index);
  });
  const jobs = Array.isArray(parsed.jobs)
    ? parsed.jobs.map((entry, index) => {
        if (!isRecord(entry)) throw new Error(`coverage job ${index + 1} is not an object`);
        return jobFromRow(entry, index);
      })
    : [];
  return { features, jobs };
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function nearLine(lng: number, lat: number, line: number[][]): boolean {
  for (let i = 1; i < line.length; i += 1) {
    const ax = line[i - 1]![0]!;
    const ay = line[i - 1]![1]!;
    const bx = line[i]![0]!;
    const by = line[i]![1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || Number.EPSILON;
    const t = Math.max(0, Math.min(1, ((lng - ax) * dx + (lat - ay) * dy) / len2));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const dist = Math.hypot(lng - px, lat - py);
    if (dist <= ROAD_NEAR_DEGREES) return true;
  }
  return false;
}

function enrichFeature(feature: CoverageFeature, pins: readonly CoveragePin[], jobs: readonly CoverageJobSite[]): CoverageFeature {
  const techs = new Set(feature.techs);
  const jobIds = new Set(feature.jobs);
  for (const pin of pins) {
    const inside = feature.kind === "polygon" ? pointInRing(pin.lng, pin.lat, feature.coordinates) : nearLine(pin.lng, pin.lat, feature.coordinates);
    if (inside) techs.add(pin.technicianId);
  }
  for (const job of jobs) {
    if (job.lat == null || job.lng == null) continue;
    const inside = feature.kind === "polygon" ? pointInRing(job.lng, job.lat, feature.coordinates) : nearLine(job.lng, job.lat, feature.coordinates);
    if (inside) jobIds.add(job.id);
  }
  return { ...feature, techs: [...techs], jobs: [...jobIds] };
}

export function readCoverageLayers(filePath: string): CoverageLayerState {
  const layers = defaultCoverageLayers();
  if (!existsSync(filePath)) return layers;
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) return layers;
  if (parsed.live_backends === true || parsed.liveTelematics === true) {
    throw new Error("coverage layer file must not claim a live backend");
  }
  const source = isRecord(parsed.layers) ? parsed.layers : parsed;
  for (const layer of COVERAGE_LAYERS) {
    if (typeof source[layer] === "boolean") layers[layer] = source[layer];
  }
  return layers;
}

export function writeCoverageLayer(filePath: string, layer: string, enabled: boolean): CoverageLayerState {
  const id = normalizeCoverageLayer(layer);
  if (!id) throw new Error("coverage layer must be zipcodes, counties, cities, or roads");
  assertLocalCoveragePath(filePath);
  const layers = existsSync(filePath) ? readCoverageLayers(filePath) : defaultCoverageLayers();
  layers[id] = enabled;
  mkdirSync(join(filePath, ".."), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify({ live_backends: false, writes: false, phoneHome: false, layers }, null, 2)}\n`,
    "utf8"
  );
  return layers;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function breakdownsFor(features: CoverageFeature[], layers: CoverageLayerState): CoverageBreakdown[] {
  return COVERAGE_LAYERS.map((layer) => {
    const rows = features.filter((feature) => feature.layer === layer);
    const enabled = layers[layer];
    const places = enabled
      ? rows.map((feature) => ({
          id: feature.id,
          name: feature.name,
          jobs: unique(feature.jobs).length,
          techs: unique(feature.techs).length
        }))
      : [];
    return {
      layer,
      label: LAYER_LABELS[layer],
      enabled,
      features: enabled ? rows.length : 0,
      jobs: enabled ? unique(rows.flatMap((feature) => feature.jobs)).length : 0,
      techs: enabled ? unique(rows.flatMap((feature) => feature.techs)).length : 0,
      places
    };
  });
}

function totalsFor(features: CoverageFeature[], layers: CoverageLayerState): CoverageBoard["totals"] {
  const visible = features.filter((feature) => layers[feature.layer]);
  return {
    features: visible.length,
    jobs: unique(visible.flatMap((feature) => feature.jobs)).length,
    techs: unique(visible.flatMap((feature) => feature.techs)).length
  };
}

function assemble(args: {
  source: CoverageBoard["source"];
  note: string;
  path: string | null;
  instanceId: string;
  layers: CoverageLayerState;
  features: CoverageFeature[];
  jobs: CoverageJobSite[];
  pins: readonly CoveragePin[];
}): CoverageBoard {
  const jobs = args.jobs;
  const features = args.features.map((feature) => enrichFeature(feature, args.pins, jobs));
  return {
    product: "trades-runtime",
    author: "Aziel Eliab",
    live_backends: false,
    writes: false,
    phoneHome: false,
    liveTelematics: false,
    telematicsVendor: false,
    mapTileVendor: false,
    vendorClaim: false,
    notALiveGps: true,
    addressMapDrawn: false,
    source: args.source,
    dataLabel: args.source,
    path: args.path,
    layerPath: defaultCoverageLayersPath(args.instanceId),
    note: args.note,
    layers: args.layers,
    jobs,
    features,
    breakdowns: breakdownsFor(features, args.layers),
    totals: totalsFor(features, args.layers)
  };
}

export function loadCoverage(args: {
  cwd: string;
  instanceId: string;
  allowSynthetic: boolean;
  explicitPath?: string;
  pins: readonly CoveragePin[];
}): CoverageBoard {
  const layerFile = resolvePath(args.cwd, defaultCoverageLayersPath(args.instanceId));
  let layers = defaultCoverageLayers();
  try {
    layers = readCoverageLayers(layerFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return assemble({
      source: "unknown",
      note: `${message} Coverage stays empty. A synthetic demo is not substituted.`,
      path: layerFile,
      instanceId: args.instanceId,
      layers: defaultCoverageLayers(),
      features: [],
      jobs: [],
      pins: []
    });
  }
  const explicit = args.explicitPath ? resolvePath(args.cwd, args.explicitPath) : undefined;
  const candidates = explicit
    ? [explicit]
    : [resolvePath(args.cwd, defaultCoveragePath(args.instanceId)), resolvePath(args.cwd, inboundCoveragePath())];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const file = readCoverageFile(path);
      return assemble({
        source: "local-file",
        note: LOCAL_NOTE,
        path,
        instanceId: args.instanceId,
        layers,
        features: file.features,
        jobs: file.jobs,
        pins: args.pins
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return assemble({
        source: "unknown",
        note: `${message} Coverage stays empty. A synthetic demo is not substituted for a refused or unreadable file.`,
        path,
        instanceId: args.instanceId,
        layers,
        features: [],
        jobs: [],
        pins: []
      });
    }
  }
  if (explicit) {
    return assemble({
      source: "unknown",
      note: "The named coverage file is not on this machine. A live map is not connected.",
      path: explicit,
      instanceId: args.instanceId,
      layers,
      features: [],
      jobs: [],
      pins: []
    });
  }
  if (args.allowSynthetic) {
    return assemble({
      source: "synthetic-demo",
      note: DEMO_NOTE,
      path: null,
      instanceId: args.instanceId,
      layers,
      features: SYNTHETIC_COVERAGE_FEATURES.map((feature) => ({ ...feature, jobs: [...feature.jobs], techs: [...feature.techs], coordinates: feature.coordinates.map((pair) => [...pair]) })),
      jobs: SYNTHETIC_JOBS.map((job) => ({ ...job })),
      pins: args.pins
    });
  }
  return assemble({
    source: "unknown",
    note: "No local coverage file on this machine. A live map is not connected. Boundaries are not invented from jobs.",
    path: null,
    instanceId: args.instanceId,
    layers,
    features: [],
    jobs: [],
    pins: []
  });
}
