import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describeConfidence, type ConfidenceSeparation } from "../core/confidence.js";
import { requireReportMetadata, type ReportMetadata } from "../domain/analytics.js";
import { emptyFulfillmentStream, fulfillmentTrail, runFulfillmentTo } from "../domain/fulfillment-machine.js";
import { openMissionDay, type MissionDayBoard } from "../domain/mission-board.js";
import { FULFILLMENT_STEPS, type FulfillmentStep, type StockRequest } from "../domain/truck-stock.js";
import { recommendBlock, type BookingBlock } from "../domain/workforce-capacity.js";
import { RUNTIME_MANIFEST } from "../manifest.js";
import {
  admitDropInFolder,
  type DropInFileResult,
  type DropInPeerClass
} from "../spine/drop-in.js";
import { BYO_INBOUND_ROOT, type ByoInboundKind } from "../spine/inbound-layout.js";
import { defaultLocalInboundConfig, parseLocalInboundConfig, type LocalInboundConfig } from "../spine/local-inbound-config.js";
import {
  applyDeskAlerts,
  defaultAlertStatePath,
  dispatchLocalHooks,
  emptyAlertState,
  enabledRuleList,
  readAlertState,
  resolveAlertConfig,
  writeAlertState,
  type AlertConfig,
  type AlertRuleKind,
  type DeskRuleSignals,
  type ResolvedAlertConfig,
  type StoredAlert
} from "./alerts.js";

/** Recorded synthetic shadow-day confidence from src/demo/shadow-day.ts. A fixture, not measured accuracy. */
export const RECORDED_SYNTHETIC_SHADOW_CONFIDENCE: ConfidenceSeparation = {
  predictionConfidence: 0.72,
  evidenceStrength: "MEDIUM",
  sourceQuality: "HIGH",
  agreement: "MEDIUM",
  verificationStatus: "PARTIAL"
};

export const SYNTHETIC_CAPACITY_LANE = 12;

export const SYNTHETIC_DESK_DAYS: { t: string; jobs: number; completed: number }[] = [
  { t: "2026-09-19", jobs: 6, completed: 4 },
  { t: "2026-09-20", jobs: 7, completed: 5 },
  { t: "2026-09-21", jobs: 5, completed: 5 },
  { t: "2026-09-22", jobs: 8, completed: 6 },
  { t: "2026-09-23", jobs: 9, completed: 7 },
  { t: "2026-09-24", jobs: 8, completed: 6 },
  { t: "2026-09-25", jobs: 7, completed: 3 }
];

export const DESK_REFRESH_MS = 2000;

export type DeskDataLabel = "synthetic-demo" | "byo-admitted" | "byo-admitted-synthetic";

export interface DeskScore {
  id: string;
  label: string;
  value: string;
  note: string;
  inventedAccuracy: false;
}

export interface DeskAlert {
  severity: "info" | "watch" | "hold";
  title: string;
  detail: string;
}

export interface DeskInboundRow {
  file: string;
  peerClass: DropInPeerClass;
  profileId: string;
  vendorHint: string;
  records: number;
  trust: "MEDIUM";
  verificationStatus: "UNVERIFIED";
  live: false;
  write: false;
  synthetic: boolean;
  sampleHashes: string[];
}

export interface DeskSeriesPoint {
  t: string;
  jobs: number;
  completed: number;
}

export interface DeskCapacityPoint {
  t: string;
  booked: number;
  open: number | null;
}

export interface OperatorSnapshot {
  product: "trades-runtime";
  version: string;
  author: "Aziel Eliab";
  generatedAt: string;
  live_backends: false;
  writes: false;
  dataLabel: DeskDataLabel;
  honesty: string;
  pilot: { optionC: "not-started"; optionD: "not-started" };
  tracking: { transport: "sse"; intervalMs: number; source: string };
  metrics: {
    jobs: number;
    appointments: number;
    customers: number;
    pricebookItems: number;
    invoices: number;
    admittedPackets: number;
    receiptLines: number;
    unverified: number;
  };
  series: DeskSeriesPoint[];
  capacity: DeskCapacityPoint[];
  capacityFormula: string;
  mission: MissionDayBoard;
  bookingBlock: BookingBlock;
  fulfillment: { label: DeskDataLabel | "none"; steps: { step: FulfillmentStep; reached: boolean }[] };
  scores: DeskScore[];
  alerts: DeskAlert[];
  ruleAlerts: StoredAlert[];
  alertHistory: StoredAlert[];
  alertRules: {
    source: ResolvedAlertConfig["source"];
    enabled: AlertRuleKind[];
    hooks: { file: boolean; webhook: boolean };
  };
  inbound: DeskInboundRow[];
  refused: { file: string; code: string; reason: string }[];
  readEndpointHints: string[];
  report: ReportMetadata;
}

export interface DeskSnapshotOptions {
  cwd?: string;
  now?: string;
  config?: LocalInboundConfig;
  folders?: { dir: string; preferClass: DropInPeerClass }[];
  receiptPath?: string;
  alertConfig?: AlertConfig;
  alertStatePath?: string;
  persistAlertState?: boolean;
}

function isCompleted(status: string | undefined): boolean {
  if (!status) return false;
  return /complete|completed|closed|done|invoiced|reconciled/i.test(status);
}

function dayKey(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    return undefined;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function clockOnDay(day: string, nowIso: string): string {
  const now = new Date(nowIso);
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${day}T${hh}:${mm}:${ss}Z`;
}

function countReceiptLines(filePath: string | undefined): number {
  if (!filePath || !existsSync(filePath)) return 0;
  const text = readFileSync(filePath, "utf8").trim();
  if (!text) return 0;
  return text.split(/\r?\n/).filter((line) => line.trim()).length;
}

function resolveUnder(cwd: string, path: string): string {
  if (path.startsWith("/")) return path;
  return join(cwd, path);
}

function loadConfig(cwd: string): { config: LocalInboundConfig; configAlert?: DeskAlert; inlineAlerts?: unknown } {
  const path = join(cwd, BYO_INBOUND_ROOT, "local.json");
  if (!existsSync(path)) return { config: defaultLocalInboundConfig() };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
    return {
      config: parseLocalInboundConfig(raw),
      inlineAlerts: record && "alerts" in record ? record.alerts : undefined
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      config: defaultLocalInboundConfig(),
      configAlert: {
        severity: "hold",
        title: "local.json was not applied",
        detail: message
      }
    };
  }
}

function countLateJobs(args: {
  dataLabel: DeskDataLabel;
  series: DeskSeriesPoint[];
  records: CollectedRecord[];
  missionDay: string;
  elapsedFraction: number;
  sameDayAt: number;
}): { count: number; basis: string } {
  const sameDayNote = `Same-day unfinished jobs count only after day fraction ${args.sameDayAt.toFixed(2)}. Current day fraction is ${args.elapsedFraction.toFixed(2)}.`;
  if (args.dataLabel === "synthetic-demo") {
    let prior = 0;
    let today = 0;
    for (const point of args.series) {
      const open = Math.max(0, point.jobs - point.completed);
      if (point.t < args.missionDay) prior += open;
      else if (point.t === args.missionDay) today += open;
    }
    const countedToday = args.elapsedFraction >= args.sameDayAt ? today : 0;
    return {
      count: prior + countedToday,
      basis: `Synthetic desk series: ${prior} unfinished jobs on days before the mission clock, ${countedToday} counted today. ${sameDayNote}`
    };
  }
  let prior = 0;
  let today = 0;
  for (const record of args.records) {
    if (record.entity !== "job" || isCompleted(record.status)) continue;
    if (record.day < args.missionDay) prior += 1;
    else if (record.day === args.missionDay) today += 1;
  }
  const countedToday = args.elapsedFraction >= args.sameDayAt ? today : 0;
  return {
    count: prior + countedToday,
    basis: `Admitted job rows: ${prior} unfinished before the mission day, ${countedToday} counted today. ${sameDayNote}`
  };
}

function oldestObservation(dataLabel: DeskDataLabel, series: DeskSeriesPoint[], records: CollectedRecord[]): string | null {
  if (dataLabel === "synthetic-demo") {
    const first = [...series].sort((a, b) => a.t.localeCompare(b.t))[0];
    return first ? `${first.t}T00:00:00Z` : null;
  }
  let best: { at: number; iso: string } | null = null;
  for (const record of records) {
    if (!record.observedAt) continue;
    const at = Date.parse(record.observedAt);
    if (!Number.isFinite(at)) continue;
    if (!best || at < best.at) best = { at, iso: new Date(at).toISOString() };
  }
  return best?.iso ?? null;
}

function endpointHints(config: LocalInboundConfig | undefined): string[] {
  if (!config) return [];
  const hints: string[] = [];
  if (config.servicetitanReadEndpoint) hints.push("ServiceTitan read endpoint is configured locally and is not called.");
  if (config.probooksReadEndpoint) hints.push("ProBooks read endpoint is configured locally and is not called.");
  if (config.tradesAppReadEndpoint) hints.push("Trades-app read endpoint is configured locally and is not called.");
  return hints;
}

interface CollectedRecord {
  entity: string;
  status?: string;
  observedAt?: string;
  day: string;
}

function collect(files: DropInFileResult[], receivedAt: string): {
  inbound: DeskInboundRow[];
  refused: OperatorSnapshot["refused"];
  records: CollectedRecord[];
} {
  const inbound: DeskInboundRow[] = [];
  const refused: OperatorSnapshot["refused"] = [];
  const records: CollectedRecord[] = [];
  for (const file of files) {
    if (!file.result.ok) {
      refused.push({ file: file.file, code: file.result.code, reason: file.result.reason });
      continue;
    }
    inbound.push({
      file: file.file,
      peerClass: file.result.peerClass,
      profileId: file.result.profileId,
      vendorHint: file.result.vendorHint,
      records: file.result.records.length,
      trust: "MEDIUM",
      verificationStatus: "UNVERIFIED",
      live: false,
      write: false,
      synthetic: file.result.synthetic,
      sampleHashes: file.result.records.slice(0, 4).map((record) => record.packetHash)
    });
    for (const record of file.result.records) {
      records.push({
        entity: record.entity,
        status: record.status,
        observedAt: record.observedAt,
        day: dayKey(record.observedAt) ?? dayKey(receivedAt) ?? receivedAt.slice(0, 10)
      });
    }
  }
  return { inbound, refused, records };
}

function seriesFrom(records: CollectedRecord[]): DeskSeriesPoint[] {
  const jobs = records.filter((record) => record.entity === "job");
  const byDay = new Map<string, DeskSeriesPoint>();
  for (const job of jobs) {
    const point = byDay.get(job.day) ?? { t: job.day, jobs: 0, completed: 0 };
    point.jobs += 1;
    if (isCompleted(job.status)) point.completed += 1;
    byDay.set(job.day, point);
  }
  return [...byDay.values()].sort((a, b) => a.t.localeCompare(b.t));
}

function syntheticFulfillment(at: string): OperatorSnapshot["fulfillment"] {
  const request: StockRequest = {
    requestId: "syn-desk-req",
    callId: "syn-desk-call",
    vanId: "syn-desk-van",
    partNumber: "SYN-PART",
    quantity: 1,
    location: "BRANCH_STOCK",
    step: "REQUESTED"
  };
  const ran = runFulfillmentTo(request, "READY", emptyFulfillmentStream(), at);
  const reached = new Set<string>(["REQUESTED", ...fulfillmentTrail(ran.stream)]);
  return {
    label: "synthetic-demo",
    steps: FULFILLMENT_STEPS.map((step) => ({ step, reached: reached.has(step) }))
  };
}

function emptyFulfillment(): OperatorSnapshot["fulfillment"] {
  return {
    label: "none",
    steps: FULFILLMENT_STEPS.map((step) => ({ step, reached: false }))
  };
}

export function buildOperatorSnapshot(options: DeskSnapshotOptions = {}): OperatorSnapshot {
  const now = options.now ?? new Date().toISOString();
  const cwd = options.cwd ?? process.cwd();
  const loaded = options.folders ? undefined : loadConfig(cwd);
  const config = options.config ?? loaded?.config;
  const folders =
    options.folders ??
    (["servicetitan", "probooks", "trades-app"] as ByoInboundKind[]).map((kind) => ({
      dir: resolveUnder(
        cwd,
        kind === "servicetitan"
          ? (config?.servicetitanPath ?? "data/inbound/servicetitan")
          : kind === "probooks"
            ? (config?.probooksPath ?? "data/inbound/probooks")
            : (config?.tradesAppPath ?? "data/inbound/trades-app")
      ),
      preferClass: kind
    }));

  const admitted = folders.flatMap((folder) => admitDropInFolder(folder.dir, { preferClass: folder.preferClass }).files);
  const collected = collect(admitted, now);
  const hasByo = collected.inbound.length > 0;
  const syntheticFiles = hasByo && collected.inbound.every((row) => row.synthetic);
  const dataLabel: DeskDataLabel = !hasByo ? "synthetic-demo" : syntheticFiles ? "byo-admitted-synthetic" : "byo-admitted";

  const series = dataLabel === "synthetic-demo" ? SYNTHETIC_DESK_DAYS.map((point) => ({ ...point })) : seriesFrom(collected.records);
  const jobEntities = collected.records.filter((record) => record.entity === "job");
  const jobCount = dataLabel === "synthetic-demo" ? series.reduce((sum, point) => sum + point.jobs, 0) : jobEntities.length;
  const missionDay = dataLabel === "synthetic-demo" ? SYNTHETIC_DESK_DAYS[SYNTHETIC_DESK_DAYS.length - 1]!.t : now.slice(0, 10);
  const todayPoint = series.find((point) => point.t === missionDay) ?? series[series.length - 1];
  const missionTarget = dataLabel === "synthetic-demo" ? (todayPoint?.jobs ?? 0) : Math.max(jobEntities.length, 0);
  const missionActual = dataLabel === "synthetic-demo" ? (todayPoint?.completed ?? 0) : jobEntities.filter((record) => isCompleted(record.status) && (series.length < 2 || record.day === missionDay)).length;

  const mission = openMissionDay({
    branchId: dataLabel === "synthetic-demo" ? "synthetic-demo" : "local",
    day: missionDay,
    openedAt: `${missionDay}T00:00:00Z`,
    closesAt: `${missionDay}T23:59:59Z`,
    clock: clockOnDay(missionDay, now),
    goals: [
      {
        id: "calls-completed",
        measure: "calls-completed",
        target: missionTarget,
        actual: missionActual
      }
    ]
  });

  const pace = mission.goals[0];
  const demandSurge = Boolean(pace && pace.elapsedFraction > 0.6 && pace.actual < pace.expectedPace);
  const bookingBlock = recommendBlock({ hardUnavailable: false, protectEmergency: false, demandSurge });

  const capacity: DeskCapacityPoint[] =
    dataLabel === "synthetic-demo"
      ? SYNTHETIC_DESK_DAYS.map((point) => ({
          t: point.t,
          booked: point.jobs,
          open: Math.max(0, SYNTHETIC_CAPACITY_LANE - point.jobs)
        }))
      : series.map((point) => ({ t: point.t, booked: point.jobs, open: null }));

  const capacityFormula =
    dataLabel === "synthetic-demo"
      ? `Synthetic lane of ${SYNTHETIC_CAPACITY_LANE} slots minus that day's jobs. Simulated. Not a live capacity board.`
      : "Booked bars are admitted job rows per day. Open slots stay blank until a local capacity sample exists. No accuracy is inferred.";

  const fulfillment = dataLabel === "synthetic-demo" ? syntheticFulfillment(now) : emptyFulfillment();
  const receiptLines = countReceiptLines(
    options.receiptPath ?? (config?.receiptPath ? resolveUnder(cwd, config.receiptPath) : undefined)
  );
  const admittedPackets = collected.inbound.reduce((sum, row) => sum + row.records, 0);

  const scores: DeskScore[] = [
    {
      id: "verification",
      label: "Verification",
      value: "UNVERIFIED",
      note: "FragGate wrapper admission is not verification.",
      inventedAccuracy: false
    },
    {
      id: "evidence-trust",
      label: "Evidence trust",
      value: hasByo ? "MEDIUM" : "n/a",
      note: hasByo
        ? "Trust band on admitted ServiceTitan, ProBooks, and trades-app packets. Trust is not truth."
        : "No BYO packet is on this desk. Trust is not shown as a company score.",
      inventedAccuracy: false
    },
    {
      id: "mission-pace",
      label: "Mission pace",
      value: pace ? `${pace.actual} actual / ${pace.expectedPace.toFixed(2)} expected` : "n/a",
      note: "openMissionDay pace from completions and the local clock. A pace gap is not a forecast accuracy.",
      inventedAccuracy: false
    },
    {
      id: "capacity-block",
      label: "Booking block",
      value: bookingBlock,
      note: "recommendBlock from local load versus pace. A booking recommendation, not a prediction score.",
      inventedAccuracy: false
    }
  ];

  if (dataLabel === "synthetic-demo") {
    scores.push({
      id: "recorded-shadow-confidence",
      label: "Recorded shadow confidence",
      value: describeConfidence(RECORDED_SYNTHETIC_SHADOW_CONFIDENCE),
      note: "Copied from the in-repo synthetic shadow-day fixture. Not measured accuracy. Not a live pilot.",
      inventedAccuracy: false
    });
  } else {
    scores.push({
      id: "prediction-confidence",
      label: "Prediction confidence",
      value: "withheld",
      note: "A drop-in file does not create a sealed shadow settlement. Prediction confidence stays withheld.",
      inventedAccuracy: false
    });
  }

  const alerts: DeskAlert[] = [];
  if (loaded?.configAlert) alerts.push(loaded.configAlert);
  if (dataLabel === "synthetic-demo") {
    alerts.push({
      severity: "info",
      title: "Synthetic demo",
      detail: "No BYO export is admitted from the inbound folders. Charts use the in-repo synthetic desk series."
    });
  } else if (dataLabel === "byo-admitted-synthetic") {
    alerts.push({
      severity: "info",
      title: "BYO-admitted synthetic drill",
      detail: "Local files declared synthetic:true. Hashed and UNVERIFIED. These are not a live company dump."
    });
  } else {
    alerts.push({
      severity: "info",
      title: "BYO-admitted",
      detail: "Local files were admitted and hashed. Verification stays UNVERIFIED. Nothing was written back."
    });
  }
  alerts.push({
    severity: "info",
    title: "Writes refused",
    detail: "live_backends is false. ServiceTitan, ProBooks, and trades-app POST/PUT/PATCH stay refused."
  });
  alerts.push({
    severity: "info",
    title: "Pilots",
    detail: "Option C is code-ready and the pilot is not started. Option D is not started."
  });
  if (pace && pace.elapsedFraction > 0.25 && pace.actual + 0.001 < pace.expectedPace) {
    alerts.push({
      severity: "watch",
      title: "Behind expected pace",
      detail: `${pace.measure} actual ${pace.actual} is under expected pace ${pace.expectedPace.toFixed(2)} at this clock.`
    });
  }
  for (const refused of collected.refused) {
    alerts.push({
      severity: refused.code === "FG-REFUSE-SCRAPE" || refused.code === "FG-REFUSE-UNAUTHORIZED" ? "hold" : "watch",
      title: `${refused.file} refused`,
      detail: `${refused.code}: ${refused.reason}`
    });
  }
  if (dataLabel !== "synthetic-demo") {
    alerts.push({
      severity: "info",
      title: "Fulfillment sample",
      detail: "No local fulfillment event stream is attached. The rail stays empty rather than inventing steps."
    });
  }
  for (const hint of endpointHints(config)) {
    alerts.push({ severity: "info", title: "Read endpoint hint", detail: hint });
  }

  const resolvedAlerts = resolveAlertConfig({
    cwd,
    instanceId: config?.instanceId ?? "local",
    alertsPath: config?.alertsPath,
    inline: loaded?.inlineAlerts,
    override: options.alertConfig
  });
  if (resolvedAlerts.hold) alerts.push(resolvedAlerts.hold);
  const enabledRules = enabledRuleList(resolvedAlerts.config);
  alerts.push({
    severity: "info",
    title: "Local alert rules",
    detail: `Source ${resolvedAlerts.source}. Enabled: ${enabledRules.join(", ") || "none"}. File hook ${resolvedAlerts.config.hooks.file ? "on" : "off"}. Webhook hook ${resolvedAlerts.config.hooks.webhook ? "loopback" : "off"}. Hooks stay on this machine.`
  });

  const late = countLateJobs({
    dataLabel,
    series,
    records: collected.records,
    missionDay,
    elapsedFraction: pace?.elapsedFraction ?? 0,
    sameDayAt: resolvedAlerts.config.rules.lateJobs.sameDayElapsedFractionAtOrAbove
  });
  const capacityPoint = capacity.find((point) => point.t === missionDay) ?? capacity[capacity.length - 1];
  const trustValue = scores.find((score) => score.id === "evidence-trust")?.value;
  const verificationValue = scores.find((score) => score.id === "verification")?.value;
  const signals: DeskRuleSignals = {
    dataLabel,
    now,
    evidenceTrust: trustValue === "LOW" || trustValue === "MEDIUM" || trustValue === "HIGH" ? trustValue : "n/a",
    verification:
      verificationValue === "PARTIAL" || verificationValue === "VERIFIED" || verificationValue === "CONFLICTED"
        ? verificationValue
        : "UNVERIFIED",
    bookingBlock,
    openSlots: capacityPoint?.open ?? null,
    booked: capacityPoint?.booked ?? 0,
    lane: dataLabel === "synthetic-demo" ? SYNTHETIC_CAPACITY_LANE : null,
    lateJobs: late.count,
    lateBasis: late.basis,
    oldestObservationAt: oldestObservation(dataLabel, series, collected.records),
    missionElapsedFraction: pace?.elapsedFraction ?? 0,
    missionActual: pace?.actual ?? 0,
    missionExpectedPace: pace?.expectedPace ?? 0
  };
  const instanceId = config?.instanceId ?? "local";
  const statePath = options.alertStatePath ?? defaultAlertStatePath(cwd, instanceId);
  const applied = applyDeskAlerts({
    signals,
    config: resolvedAlerts.config,
    state: options.persistAlertState ? readAlertState(statePath) : emptyAlertState(),
    now
  });
  if (options.persistAlertState) {
    writeAlertState(statePath, applied.state);
    dispatchLocalHooks({ cwd, config: resolvedAlerts.config, raised: applied.raised, now });
  }
  for (const notice of applied.notices) alerts.push(notice);

  const sampleHashes = collected.inbound.flatMap((row) => row.sampleHashes).slice(0, 6);
  const report = requireReportMetadata({
    scope: dataLabel === "synthetic-demo" ? "local-operator-desk:synthetic" : "local-operator-desk:byo",
    dataSources: dataLabel === "synthetic-demo" ? ["synthetic-desk-series", "shadow-day-fixture"] : ["local-inbound"],
    sampleSize: jobCount,
    formula: capacityFormula,
    assumptions: [
      "live_backends false",
      "writes refused",
      "wrapper admission is not verification",
      "prediction confidence is withheld on BYO drops"
    ],
    confidenceNote:
      dataLabel === "synthetic-demo"
        ? "Recorded synthetic shadow-day confidence is labeled as a fixture."
        : "Prediction confidence is withheld. MEDIUM trust is not truth.",
    status: dataLabel === "synthetic-demo" ? "simulated" : "observed",
    versionLineage: RUNTIME_MANIFEST.version,
    receiptRefs: sampleHashes.length ? sampleHashes : ["none"]
  });

  const honesty =
    dataLabel === "synthetic-demo"
      ? "Synthetic demo on this machine. Not BYO company data. Not a live GM pilot."
      : dataLabel === "byo-admitted-synthetic"
        ? "BYO-admitted synthetic drill. Local files only. UNVERIFIED. Writes refused."
        : "BYO-admitted local export. UNVERIFIED. Writes refused. Authoring node is not a custodian of this desk.";

  return {
    product: "trades-runtime",
    version: RUNTIME_MANIFEST.version,
    author: "Aziel Eliab",
    generatedAt: now,
    live_backends: false,
    writes: false,
    dataLabel,
    honesty,
    pilot: { optionC: "not-started", optionD: "not-started" },
    tracking: {
      transport: "sse",
      intervalMs: DESK_REFRESH_MS,
      source: "local inbound folders, mission clock, and isolate receipt line count"
    },
    metrics: {
      jobs: jobCount,
      appointments: collected.records.filter((record) => record.entity === "appointment").length,
      customers: collected.records.filter((record) => record.entity === "customer").length,
      pricebookItems: collected.records.filter((record) => record.entity === "pricebook" || record.entity === "item").length,
      invoices: collected.records.filter((record) => record.entity === "invoice").length,
      admittedPackets,
      receiptLines,
      unverified: admittedPackets
    },
    series,
    capacity,
    capacityFormula,
    mission,
    bookingBlock,
    fulfillment,
    scores,
    alerts,
    ruleAlerts: applied.active,
    alertHistory: applied.history,
    alertRules: {
      source: resolvedAlerts.source,
      enabled: enabledRules,
      hooks: {
        file: Boolean(resolvedAlerts.config.hooks.file),
        webhook: Boolean(resolvedAlerts.config.hooks.webhook)
      }
    },
    inbound: collected.inbound,
    refused: collected.refused,
    readEndpointHints: endpointHints(config),
    report
  };
}
