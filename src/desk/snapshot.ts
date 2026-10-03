import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describeConfidence, type ConfidenceSeparation } from "../core/confidence.js";
import { requireReportMetadata, type ReportMetadata } from "../domain/analytics.js";
import {
  aggregateCallClasses,
  callFilterLabel,
  callMatchesFilter,
  classifyCall,
  describeCallClass,
  describeCallReason,
  isNotClassified,
  SYNTHETIC_DESK_CALLS,
  SYNTHETIC_DESK_TECHS,
  type CallClassCounts,
  type CallClassification,
  type CallDeskFilter
} from "../domain/call-class.js";
import { buildWeeklyCallbackDigest, type WeeklyCallbackDigest } from "./callback-week.js";
import { collectDepartmentFlags, flagHandoffBehavior, type DepartmentBehaviorBoard } from "../domain/chain-d.js";
import { flagCrossTradeBehavior } from "../domain/cross-trade-matrix.js";
import { loadDrivePerformance, type DrivePerformance } from "../domain/drive-miles.js";
import { buildFieldShell, type FieldShell } from "./field-time.js";
import { loadLocalLogin, type LocalLoginView } from "./local-login.js";
import { loadJobPriceBoard, stockHitsFromLines, type JobPriceBoard } from "./job-price.js";
import { buildPropertyCard, type PropertyCard } from "./property-card.js";
import { loadLocalPositions } from "../domain/local-positions.js";
import { loadCoverage, type CoverageBoard } from "../domain/coverage-map.js";
import { buildRightTech, type RightTechBoard } from "../domain/right-tech.js";
import { loadTimeTracking, persistTimeTracking, type TimeTrackingBoard } from "../domain/time-tracking.js";
import { buildInboundQualityReport, persistInboundQuality, type InboundQualityReport } from "../domain/inbound-quality.js";
import { buildFriction, type FrictionBoard } from "../domain/friction.js";
import {
  buildWorkTogether,
  nameCollaborations,
  SYNTHETIC_COLLABORATION_ASSIGNMENTS,
  syntheticDelayedHandoff,
  syntheticInstallFlag,
  type WorkTogetherBoard
} from "../domain/work-together.js";
import { buildHuddleBoard, jobCountsAsLate, jobOpenOnBoard, SYNTHETIC_HUDDLE_TRAINING, type HuddleBoard } from "../domain/huddle-board.js";
import {
  buildPerformanceBoard,
  syntheticPerformanceJobs,
  type PerformanceBoard,
  type PerformanceJob
} from "../domain/performance-board.js";
import { rollupPartCosts } from "../domain/job-economics.js";
import { adaptPartCost } from "../domain/pricebook.js";
import { flagRecognitionBehavior } from "../domain/recognition.js";
import { type PatternEvidence } from "../domain/regional-recalibration.js";
import { emptyFulfillmentStream, fulfillmentTrail, runFulfillmentTo } from "../domain/fulfillment-machine.js";
import { explainMissionPace, openMissionDay, type MissionDayBoard } from "../domain/mission-board.js";
import {
  defaultStockCountPath,
  emptyStockBook,
  FULFILLMENT_STEPS,
  fulfillmentQueueFromCounts,
  readStockBook,
  recordStockCount,
  type FulfillmentStep,
  type StockCountLine,
  type StockRequest
} from "../domain/truck-stock.js";
import { explainBookingBlock, type BookingBlock, type BookingBlockExplanation } from "../domain/workforce-capacity.js";
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
import { buildAlertActionReport, persistAlertActions, type AlertActionReport } from "./alert-actions.js";
import { optionCStartGate, type OptionCStartGate } from "../spine/option-c-start-gate.js";
import { buildMonitoring, type MonitoringBoard } from "./monitoring.js";

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
  /** Short human reason for this score or band. */
  why: string;
  note: string;
  band?: string;
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

export interface DeskLane {
  id: string;
  label: string;
  kind: "capacity" | "trade";
  booked: number;
  open: number | null;
  note: string;
  geographic: false;
}

export interface DeskReceiptEntry {
  type: "genesis" | "receipt" | "unparsed";
  id?: string;
  kind?: string;
  at?: string;
  hash?: string;
}

export interface DeskReceiptDigest {
  lines: number;
  entries: DeskReceiptEntry[];
}

export interface DeskCallRow {
  id: string;
  lane: string | null;
  day: string;
  technicianId: string | null;
  technicianName: string | null;
  status: string | null;
  open: boolean;
  late: boolean;
  callback: CallClassification["callback"];
  warranty: CallClassification["warranty"];
  callbackBasis: string;
  warrantyBasis: string;
  reason: string;
  notClassified: boolean;
  /** Reasons come from labels on the row. Coverage is not invented. */
  invented: false;
  /** Service address copied from the job. Null when the row did not name one. */
  serviceAddress: string | null;
}

export interface CallFilterState {
  value: CallDeskFilter;
  label: string;
  shown: number;
  total: number;
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
  pilot_started: boolean;
  pilot: { optionC: "not-started" | "started-local-isolate"; optionD: "not-started" };
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
    callbackCalls: number;
    warrantyCalls: number;
    callsNotClassified: number;
  };
  callClass: {
    source: "synthetic-sample" | "admitted-jobs";
    note: string;
    counts: CallClassCounts;
  };
  callFilter: CallFilterState;
  /** Every call on this desk, with the classify reason. */
  calls: DeskCallRow[];
  /** Calls matching callFilter. Counts above stay the full desk. */
  visibleCalls: DeskCallRow[];
  callbackWeek: WeeklyCallbackDigest;
  huddle: HuddleBoard;
  drive: DrivePerformance;
  monitoring: MonitoringBoard;
  timeTracking: TimeTrackingBoard;
  coverage: CoverageBoard;
  rightTech: RightTechBoard;
  inboundQuality: InboundQualityReport;
  alertActions: AlertActionReport;
  optionCStartGate: OptionCStartGate;
  performance: PerformanceBoard;
  workTogether: WorkTogetherBoard;
  friction: FrictionBoard;
  partCosts: DeskPartCosts;
  behavior: DeskBehavior;
  stock: DeskStock;
  bookingReceipt: BookingBlockExplanation;
  series: DeskSeriesPoint[];
  capacity: DeskCapacityPoint[];
  capacityFormula: string;
  lanes: DeskLane[];
  map: { drawn: false; reason: string };
  receiptDigest: DeskReceiptDigest;
  mission: MissionDayBoard;
  bookingBlock: BookingBlock;
  fulfillment: {
    label: DeskDataLabel | "none";
    steps: { step: FulfillmentStep; reached: boolean }[];
    countNote: string;
  };
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
  fieldShell: FieldShell;
  jobPrices: JobPriceBoard;
  propertyCards: PropertyCard[];
  localLogin: LocalLoginView;
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
  callFilter?: CallDeskFilter;
  stockCountPath?: string;
  driveMilesPath?: string;
  /** Optional local tech and truck pins. Not a live GPS feed. */
  positionsPath?: string;
  /** Optional local time cards. Not a live timeclock. */
  timeCardsPath?: string;
  /** Optional local coverage shapes. Not a live map tile. */
  coveragePath?: string;
  /** Open job id for right-tech suggestions. Suggestions only. */
  rightTechJob?: string;
  /** Write the local quality report and alert-action stubs under data/runtime. */
  persistLocalReports?: boolean;
  /** Local sign-in token from the desk cookie. Not a hosted identity provider. */
  localSessionToken?: string | null;
}

export interface DeskPartCostLine {
  sku: string;
  quantity: number;
  currentCost: number;
  lastCost: number;
  averageCost: number;
  adaptedCost: number;
  costMove: number;
  marketWeight: number;
  weakened: boolean;
  note: string;
  subordinateToHuman: true;
}

export interface DeskPartCosts {
  source: "synthetic-sample" | "none";
  subordinateToHuman: true;
  autoApplied: false;
  weakened: boolean;
  adaptedParts: number | null;
  currentParts: number | null;
  lastParts: number | null;
  note: string;
  lines: DeskPartCostLine[];
}

export interface DeskBehavior extends DepartmentBehaviorBoard {
  source: "synthetic-sample" | "none";
}

export interface DeskStock {
  source: "synthetic-sample" | "local-file" | "none";
  hostedInventory: false;
  liveErp: false;
  path: string | null;
  note: string;
  lines: StockCountLine[];
  sampleRequest: { sku: string; quantity: number; location: string; onVan: number; warehouse: number } | null;
}

const THIN_MARKET: PatternEvidence = {
  sampleSize: 2,
  geographicConcentration: 0.2,
  constructionSimilarity: 0.2,
  materialSimilarity: 0.2,
  technicianConfirmations: 0,
  outcomeConfirmations: 0,
  recencyDays: 800,
  crossBranchAgreement: 0.1,
  conflicting: true,
  stale: true,
  cohortDissimilar: true,
  stoppedRecurring: false
};

const STRONG_MARKET: PatternEvidence = {
  sampleSize: 40,
  geographicConcentration: 0.8,
  constructionSimilarity: 0.85,
  materialSimilarity: 0.9,
  technicianConfirmations: 12,
  outcomeConfirmations: 10,
  recencyDays: 40,
  crossBranchAgreement: 0.8,
  conflicting: false,
  stale: false,
  cohortDissimilar: false,
  stoppedRecurring: false
};

function emptyPartCosts(): DeskPartCosts {
  return {
    source: "none",
    subordinateToHuman: true,
    autoApplied: false,
    weakened: true,
    adaptedParts: null,
    currentParts: null,
    lastParts: null,
    note: "No part-cost sample is on this desk. Current cost, last cost, and market adaptation are not invented from a silent export.",
    lines: []
  };
}

function syntheticPartCosts(): DeskPartCosts {
  const inputs = [
    { sku: "COND-14", quantity: 1, currentCost: 180, lastCost: 175, averageCost: 210, evidence: THIN_MARKET },
    { sku: "TXV-9", quantity: 1, currentCost: 40, lastCost: 55, averageCost: 48, evidence: STRONG_MARKET }
  ];
  const rollup = rollupPartCosts(inputs);
  const lines: DeskPartCostLine[] = inputs.map((line) => {
    const signal = adaptPartCost(line, line.evidence);
    return {
      sku: line.sku,
      quantity: line.quantity,
      currentCost: signal.currentCost,
      lastCost: signal.lastCost,
      averageCost: signal.averageCost,
      adaptedCost: signal.adaptedCost,
      costMove: signal.costMove,
      marketWeight: signal.marketWeight,
      weakened: signal.weakened,
      note: signal.note,
      subordinateToHuman: true
    };
  });
  return {
    source: "synthetic-sample",
    subordinateToHuman: true,
    autoApplied: false,
    weakened: rollup.weakened,
    adaptedParts: rollup.adaptedParts,
    currentParts: rollup.currentParts,
    lastParts: rollup.lastParts,
    note: `${rollup.note} Shadow recommendation only. Locked prices still refuse auto-recalibrate. Not a live price write.`,
    lines
  };
}

function emptyBehavior(): DeskBehavior {
  return {
    source: "none",
    positive: [],
    negative: [],
    systemBeforeBlame: true,
    lastPersonBlamedByDefault: false,
    note: "No coordination sample is on this desk. Good and bad department flags are not invented."
  };
}

function syntheticBehavior(at: string): DeskBehavior {
  const clean = flagHandoffBehavior({
    recordId: "syn-clean",
    at,
    fromRole: "warehouse",
    toRole: "dispatch",
    expectedAction: "stage-part",
    actualAction: "stage-part",
    acknowledged: true,
    knowledgeAtOrigin: { ready: true },
    knowledgeAtRecipient: { ready: true }
  });
  const missed = flagHandoffBehavior({
    recordId: "syn-missed",
    at,
    fromRole: "warehouse",
    toRole: "dispatch",
    expectedAction: "ack-ready",
    actualAction: "silent",
    acknowledged: false,
    knowledgeAtOrigin: { ready: true }
  });
  const assist = flagCrossTradeBehavior({
    signal: { origin: "hvac", receiving: "electrical", evidenceSupported: true, weight: 0.1 }
  });
  const unevidenced = flagCrossTradeBehavior({
    signal: { origin: "plumbing", receiving: "sewer", evidenceSupported: false, weight: 0.4 }
  });
  const recognized = flagRecognitionBehavior({
    flagId: "syn-rec",
    candidate: { kind: "successful-repair", revenue: 420, qualityOk: true, callbackAcceptable: true },
    fromRole: "van",
    toRole: "warehouse"
  });
  const qualityMiss = flagRecognitionBehavior({
    flagId: "syn-quality",
    candidate: { kind: "successful-repair", revenue: 420, qualityOk: false, callbackAcceptable: false },
    fromRole: "dispatch",
    toRole: "warehouse",
    coordinationMiss: true
  });
  const flags = [clean, missed, assist, unevidenced, recognized, qualityMiss, syntheticInstallFlag(at), syntheticDelayedHandoff()].filter(
    (flag): flag is NonNullable<typeof flag> => Boolean(flag)
  );
  return { source: "synthetic-sample", ...collectDepartmentFlags(flags) };
}

function syntheticStock(at: string): DeskStock {
  let book = emptyStockBook("synthetic", at);
  book = recordStockCount(book, {
    sku: "COND-14",
    location: "ON_VAN",
    vanId: "van-214",
    quantity: 2,
    countedAt: at,
    countedBy: "fixture"
  });
  book = recordStockCount(book, {
    sku: "COND-14",
    location: "BRANCH_STOCK",
    placeId: "branch-3",
    quantity: 6,
    countedAt: at,
    countedBy: "fixture"
  });
  const queue = fulfillmentQueueFromCounts(
    [
      {
        callId: "syn-desk-call",
        vanId: "van-214",
        partNumber: "COND-14",
        quantity: 3,
        location: "BRANCH_STOCK",
        urgency: "same-day"
      }
    ],
    book
  );
  const request = queue[0];
  return {
    source: "synthetic-sample",
    hostedInventory: false,
    liveErp: false,
    path: null,
    note: "Fixture counts on this machine. On-van COND-14 is 2. Branch stock is 6. A demand of 3 creates a short request of 1 from branch stock. Unknown counts are not treated as zero. Not a hosted inventory ERP.",
    lines: book.counts,
    sampleRequest: request
      ? { sku: request.partNumber, quantity: request.quantity, location: request.location, onVan: 2, warehouse: 6 }
      : null
  };
}

function emptyStock(): DeskStock {
  return {
    source: "none",
    hostedInventory: false,
    liveErp: false,
    path: null,
    note: "No local stock count file. Counts are not invented.",
    lines: [],
    sampleRequest: null
  };
}

function loadDeskStock(args: {
  cwd: string;
  instanceId: string;
  now: string;
  dataLabel: DeskDataLabel;
  stockCountPath?: string;
}): DeskStock {
  const path = args.stockCountPath ?? join(args.cwd, defaultStockCountPath(args.instanceId));
  if (existsSync(path)) {
    try {
      const book = readStockBook(path);
      return {
        source: "local-file",
        hostedInventory: false,
        liveErp: false,
        path,
        note: "Counts read from the local stock file on this machine. Not a hosted inventory ERP.",
        lines: book.counts,
        sampleRequest: null
      };
    } catch {
      // A bad local file does not become a synthetic count.
    }
  }
  if (args.dataLabel === "synthetic-demo") return syntheticStock(args.now);
  return emptyStock();
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

function readReceiptDigest(filePath: string | undefined): DeskReceiptDigest {
  if (!filePath || !existsSync(filePath)) return { lines: 0, entries: [] };
  const rawLines = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const entries = rawLines.slice(-8).map((line): DeskReceiptEntry => {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.type === "genesis" && typeof parsed.genesis === "string") {
        return { type: "genesis", hash: parsed.genesis };
      }
      if (parsed.type === "receipt" && parsed.receipt && typeof parsed.receipt === "object") {
        const receipt = parsed.receipt as Record<string, unknown>;
        return {
          type: "receipt",
          id: typeof receipt.receiptId === "string" ? receipt.receiptId : undefined,
          kind: typeof receipt.kind === "string" ? receipt.kind : undefined,
          at: typeof receipt.at === "string" ? receipt.at : undefined,
          hash: typeof receipt.hash === "string" ? receipt.hash : undefined
        };
      }
      return { type: "unparsed" };
    } catch {
      return { type: "unparsed" };
    }
  });
  return { lines: rawLines.length, entries };
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
  externalId: string;
  status?: string;
  observedAt?: string;
  day: string;
  lane?: string;
  callClass?: CallClassification;
  technicianId?: string;
  technicianName?: string;
  ticket?: number;
  sold?: number;
  revenue?: number;
  serviceAddress?: string;
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
        externalId: record.externalId,
        status: record.status,
        observedAt: record.observedAt,
        day: dayKey(record.observedAt) ?? dayKey(receivedAt) ?? receivedAt.slice(0, 10),
        lane: record.lane,
        callClass: record.callClass,
        technicianId: record.technicianId,
        technicianName: record.technicianName,
        ticket: record.ticket,
        sold: record.sold,
        revenue: record.revenue,
        serviceAddress: record.serviceAddress
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
    steps: FULFILLMENT_STEPS.map((step) => ({ step, reached: reached.has(step) })),
    countNote: "Synthetic fulfillment advanced REQUESTED to READY. Count-backed stock is listed beside this rail."
  };
}

const MAP_REASON = "No coordinates are stored on this desk. A map is not drawn.";

function buildLanes(args: {
  dataLabel: DeskDataLabel;
  capacity: DeskCapacityPoint[];
  missionDay: string;
  records: CollectedRecord[];
}): DeskLane[] {
  const point = args.capacity.find((item) => item.t === args.missionDay) ?? args.capacity[args.capacity.length - 1];
  const booked = point?.booked ?? 0;
  const open = point?.open ?? null;
  const capacityNote =
    args.dataLabel === "synthetic-demo"
      ? `Slot lane of ${SYNTHETIC_CAPACITY_LANE} on the mission day. Booked ${booked}, open ${open ?? "blank"}. Not a map. No coordinates are stored.`
      : "Booked count is admitted jobs on the mission day. Open slots stay blank until a local capacity sample exists. Not a map. No coordinates are stored.";
  const lanes: DeskLane[] = [
    {
      id: "capacity",
      label: "Capacity lane",
      kind: "capacity",
      booked,
      open,
      note: capacityNote,
      geographic: false
    }
  ];
  const counts = new Map<string, number>();
  for (const record of args.records) {
    if (record.entity !== "job" || !record.lane) continue;
    counts.set(record.lane, (counts.get(record.lane) ?? 0) + 1);
  }
  for (const [lane, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lanes.push({
      id: `trade-${lane}`,
      label: lane,
      kind: "trade",
      booked: count,
      open: null,
      note: "Trade token copied from the local export. Not a place. No coordinates are stored.",
      geographic: false
    });
  }
  return lanes;
}

function toDeskCall(args: {
  id: string;
  lane: string | null;
  day: string;
  technicianId: string | null;
  technicianName: string | null;
  status: string | null;
  missionDay: string;
  classified: CallClassification;
  serviceAddress?: string | null;
}): DeskCallRow {
  return {
    id: args.id,
    lane: args.lane,
    day: args.day,
    technicianId: args.technicianId,
    technicianName: args.technicianName,
    status: args.status,
    open: jobOpenOnBoard(!isCompleted(args.status ?? undefined), args.day, args.missionDay),
    late: false,
    callback: args.classified.callback,
    warranty: args.classified.warranty,
    callbackBasis: args.classified.callbackBasis,
    warrantyBasis: args.classified.warrantyBasis,
    reason: describeCallReason(args.classified),
    notClassified: isNotClassified(args.classified),
    invented: false,
    serviceAddress: args.serviceAddress ?? null
  };
}

function emptyFulfillment(): OperatorSnapshot["fulfillment"] {
  return {
    label: "none",
    steps: FULFILLMENT_STEPS.map((step) => ({ step, reached: false })),
    countNote: "Fulfillment rail is empty. No local event stream is attached."
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
  const paceWhy = pace ? explainMissionPace(pace) : undefined;
  const demandSurge = Boolean(pace && pace.elapsedFraction > 0.6 && pace.actual < pace.expectedPace);
  const bookingReceipt = explainBookingBlock({
    hardUnavailable: false,
    protectEmergency: false,
    demandSurge,
    actual: pace?.actual ?? 0,
    expectedPace: pace?.expectedPace ?? 0,
    elapsedFraction: pace?.elapsedFraction ?? 0
  });
  const bookingBlock = bookingReceipt.block;
  const draftedCalls: DeskCallRow[] =
    dataLabel === "synthetic-demo"
      ? SYNTHETIC_DESK_CALLS.map((row) => {
          const tech = SYNTHETIC_DESK_TECHS.find((item) => item.id === row.technicianId);
          return toDeskCall({
            id: row.id,
            lane: row.trade,
            day: row.day,
            technicianId: row.technicianId,
            technicianName: tech?.name ?? null,
            status: row.status,
            missionDay,
            classified: classifyCall(row.raw),
            serviceAddress: null
          });
        })
      : jobEntities.map((record) =>
          toDeskCall({
            id: record.externalId,
            lane: record.lane ?? null,
            day: record.day,
            technicianId: record.technicianId ?? null,
            technicianName: record.technicianName ?? null,
            status: record.status ?? null,
            missionDay,
            classified: record.callClass ?? classifyCall({}),
            serviceAddress: record.serviceAddress ?? null
          })
        );
  const callCounts = aggregateCallClasses(draftedCalls);
  const callSource = dataLabel === "synthetic-demo" ? "synthetic-sample" : "admitted-jobs";
  const callNote = describeCallClass(callCounts, callSource);

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
  const lanes = buildLanes({ dataLabel, capacity, missionDay, records: collected.records });
  const receiptDigest = readReceiptDigest(
    options.receiptPath ?? (config?.receiptPath ? resolveUnder(cwd, config.receiptPath) : undefined)
  );
  const admittedPackets = collected.inbound.reduce((sum, row) => sum + row.records, 0);

  const scores: DeskScore[] = [
    {
      id: "verification",
      label: "Verification",
      value: "UNVERIFIED",
      band: "UNVERIFIED",
      why: "Why: these rows were admitted on this machine. Admission means the file was hashed and kept. It does not mean the rows were checked against the job.",
      note: "FragGate wrapper admission is not verification.",
      inventedAccuracy: false
    },
    {
      id: "evidence-trust",
      label: "Evidence trust",
      value: hasByo ? "MEDIUM" : "n/a",
      band: hasByo ? "MEDIUM" : "n/a",
      why: hasByo
        ? "Why: the band is MEDIUM because a local ServiceTitan, ProBooks, or trades-app file was admitted. Medium trust means the wrapper looks like that kind of export. Trust is not truth."
        : "Why: no local export is on this desk, so there is no trust band to show as a company score.",
      note: hasByo
        ? "Trust band on admitted ServiceTitan, ProBooks, and trades-app packets. Trust is not truth."
        : "No BYO packet is on this desk. Trust is not shown as a company score.",
      inventedAccuracy: false
    },
    {
      id: "mission-pace",
      label: "Mission pace",
      value: pace ? `${pace.actual} actual / ${pace.expectedPace.toFixed(2)} expected` : "n/a",
      band: paceWhy?.band,
      why: paceWhy?.why ?? "Why: no mission goal is on this clock.",
      note: "openMissionDay pace from completions and the local clock. A pace gap is not a forecast accuracy.",
      inventedAccuracy: false
    },
    {
      id: "capacity-block",
      label: "Booking block",
      value: bookingBlock,
      band: bookingBlock,
      why: bookingReceipt.why,
      note: "recommendBlock from local load versus pace. A booking recommendation, not a prediction score.",
      inventedAccuracy: false
    }
  ];

  if (dataLabel === "synthetic-demo") {
    scores.push({
      id: "recorded-shadow-confidence",
      label: "Recorded shadow confidence",
      value: describeConfidence(RECORDED_SYNTHETIC_SHADOW_CONFIDENCE),
      why: "Why: these words are copied from the in-repo synthetic shadow-day fixture. They are not a measured company score.",
      note: "Copied from the in-repo synthetic shadow-day fixture. Not measured accuracy. Not a live pilot.",
      inventedAccuracy: false
    });
  } else {
    scores.push({
      id: "prediction-confidence",
      label: "Prediction confidence",
      value: "withheld",
      band: "withheld",
      why: "Why: a dropped file is not a sealed shadow day, so this desk does not invent a prediction percent.",
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

  const sameDayAt = resolvedAlerts.config.rules.lateJobs.sameDayElapsedFractionAtOrAbove;
  const elapsed = pace?.elapsedFraction ?? 0;
  const calls = draftedCalls.map((row) => ({
    ...row,
    late: jobCountsAsLate({
      open: row.open,
      day: row.day,
      missionDay,
      elapsedFraction: elapsed,
      sameDayElapsedFractionAtOrAbove: sameDayAt
    })
  }));
  const callFilterValue = options.callFilter ?? "all";
  const visibleCalls = calls.filter((row) => callMatchesFilter(row, callFilterValue));
  const callbackWeek = buildWeeklyCallbackDigest({
    version: RUNTIME_MANIFEST.version,
    generatedAt: now,
    source: callSource,
    missionDay,
    calls
  });
  const huddle = buildHuddleBoard({
    jobs: calls.map((row) => ({
      technicianId: row.technicianId,
      technicianName: row.technicianName,
      lane: row.lane,
      day: row.day,
      open: row.open,
      callback: row.callback,
      warranty: row.warranty
    })),
    missionDay,
    elapsedFraction: elapsed,
    sameDayElapsedFractionAtOrAbove: sameDayAt,
    source: callSource,
    slotsById: new Map(dataLabel === "synthetic-demo" ? SYNTHETIC_DESK_TECHS.map((tech) => [tech.id, tech.slots]) : []),
    namesById: new Map(dataLabel === "synthetic-demo" ? SYNTHETIC_DESK_TECHS.map((tech) => [tech.id, tech.name]) : []),
    trainingObservations: dataLabel === "synthetic-demo" ? SYNTHETIC_HUDDLE_TRAINING : []
  });
  const partCosts = dataLabel === "synthetic-demo" ? syntheticPartCosts() : emptyPartCosts();
  const behavior = dataLabel === "synthetic-demo" ? syntheticBehavior(now) : emptyBehavior();
  const stock = loadDeskStock({
    cwd,
    instanceId,
    now,
    dataLabel,
    stockCountPath: options.stockCountPath
  });
  const fulfillmentView = {
    ...fulfillment,
    countNote: stock.note
  };

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
      "prediction confidence is withheld on BYO drops",
      "callback and warranty counts are explicit labels; unknown stays not classified",
      "per-call reasons repeat those labels; a silent export stays not classified",
      "callback share and warranty share are call mix, not a technician skill score",
      "training needed is a procedure observation, not revenue, margin, or contribution per hour",
      "part cost uses current and last cost; regional adaptation weakens on thin evidence",
      "department flags list good handoffs and bad coordination; the last person is not blamed by default",
      "truck counts are a local file, not a hosted inventory ERP",
      "miles come from a local file or a labeled synthetic demo; a missing file stays unknown; no telematics vendor is claimed",
      "the performance board rank is an operator order, not a skill score, and it does not set trainingNeeded",
      "collaboration suggestions come from Chain D, cross-trade, and recognition flags; revenue alone does not name a pair or a handoff",
      "employee friction is a local aggregate of handoff failures, coordination flags, explicit callbacks, and delayed handoffs; a silent export stays unknown; it is not a hosted HR system and it does not set trainingNeeded",
      "inbound quality is a local checklist for ServiceTitan and ProBooks fragments already on this machine; it is not an accuracy percent and not a tenant pull",
      "alert action stubs are proposals only; write-back stays refused",
      "the Option C start gate is prep only; every gate stays blocked-until; the pilot is not started",
      "monitoring pins come from an optional local file or a labeled synthetic demo; mile totals still ignore coordinates; no telematics vendor is claimed",
      "time cards, coverage shapes, and right-tech suggestions recompute from local files or a labeled synthetic demo; they are not a live GPS feed and suggestions are not a dispatch"
    ],
    confidenceNote:
      dataLabel === "synthetic-demo"
        ? "Recorded synthetic shadow-day confidence is labeled as a fixture."
        : "Prediction confidence is withheld. MEDIUM trust is not truth.",
    status: dataLabel === "synthetic-demo" ? "simulated" : "observed",
    versionLineage: RUNTIME_MANIFEST.version,
    receiptRefs: sampleHashes.length ? sampleHashes : ["none"]
  });

  const completedJobs =
    dataLabel === "synthetic-demo"
      ? SYNTHETIC_DESK_CALLS.filter((row) => isCompleted(row.status)).length
      : jobEntities.filter((record) => isCompleted(record.status)).length;
  const drive = loadDrivePerformance({
    cwd,
    instanceId,
    explicitPath: options.driveMilesPath,
    allowSynthetic: dataLabel === "synthetic-demo",
    completedJobs
  });
  const performanceJobs: PerformanceJob[] =
    dataLabel === "synthetic-demo"
      ? syntheticPerformanceJobs()
      : jobEntities.map((record) => ({
          id: record.externalId,
          technicianId: record.technicianId ?? null,
          technicianName: record.technicianName ?? null,
          department: record.lane ?? null,
          callback: record.callClass?.callback ?? "unknown",
          ticket: record.ticket ?? null,
          sold: record.sold ?? null,
          revenue: record.revenue ?? null
        }));
  const performance = buildPerformanceBoard({
    jobs: performanceJobs,
    source: dataLabel === "synthetic-demo" ? "synthetic-demo" : "admitted-rows"
  });
  const collaborations = nameCollaborations({
    flags: [...behavior.positive, ...behavior.negative],
    assignments: dataLabel === "synthetic-demo" ? SYNTHETIC_COLLABORATION_ASSIGNMENTS : undefined
  });
  const workTogether = buildWorkTogether({
    source: dataLabel === "synthetic-demo" ? "synthetic-demo" : "local-flags",
    collaborations
  });
  const friction = buildFriction({
    source: dataLabel === "synthetic-demo" ? "synthetic-demo" : "admitted-rows",
    jobs: performanceJobs.map((job) => ({
      technicianId: job.technicianId,
      technicianName: job.technicianName,
      department: job.department,
      callback: job.callback
    })),
    collaborations
  });

  const peerFolders = folders.flatMap((folder) =>
    folder.preferClass === "servicetitan" || folder.preferClass === "probooks"
      ? [{ dir: folder.dir, sourceKind: folder.preferClass }]
      : []
  );
  let inboundQuality = buildInboundQualityReport({
    version: RUNTIME_MANIFEST.version,
    now,
    instanceId,
    folders: peerFolders,
    allowSynthetic: dataLabel === "synthetic-demo"
  });
  let alertActions = buildAlertActionReport({
    version: RUNTIME_MANIFEST.version,
    now,
    instanceId,
    dataLabel,
    alerts: applied.active
  });
  if (options.persistLocalReports) {
    inboundQuality = persistInboundQuality({ cwd, report: inboundQuality });
    alertActions = persistAlertActions({ cwd, report: alertActions });
  }
  const startGate = optionCStartGate(now, { cwd, instanceId });
  const positions = loadLocalPositions({
    cwd,
    instanceId,
    allowSynthetic: dataLabel === "synthetic-demo",
    explicitPath: options.positionsPath,
    milesPath: options.driveMilesPath
  });
  let timeTracking = loadTimeTracking({
    cwd,
    instanceId,
    now,
    allowSynthetic: dataLabel === "synthetic-demo",
    explicitPath: options.timeCardsPath
  });
  if (options.persistLocalReports) {
    timeTracking = persistTimeTracking({ cwd, report: timeTracking });
  }
  const coverage = loadCoverage({
    cwd,
    instanceId,
    allowSynthetic: dataLabel === "synthetic-demo",
    explicitPath: options.coveragePath,
    pins: positions.pins
  });
  const rightTech = buildRightTech({
    dataLabel,
    calls: calls.map((call) => ({
      id: call.id,
      lane: call.lane,
      status: call.status,
      technicianName: call.technicianName
    })),
    time: timeTracking,
    pins: positions.pins,
    coverage,
    friction,
    drive,
    jobId: options.rightTechJob
  });
  const monitoring = buildMonitoring({
    dataLabel,
    positions,
    drive,
    performance,
    friction,
    inboundQuality,
    timeTracking,
    coverage,
    rightTech,
    calls: visibleCalls.map((call) => ({
      id: call.id,
      lane: call.lane,
      day: call.day,
      technicianId: call.technicianId,
      technicianName: call.technicianName,
      status: call.status
    }))
  });

  const propertyCards = calls.map((call) =>
    buildPropertyCard({
      jobId: call.id,
      address: call.serviceAddress,
      lane: call.lane,
      status: call.status
    })
  );
  const fieldShell = buildFieldShell({
    cwd,
    instanceId,
    now,
    missionDay,
    dataLabel,
    calls: calls.map((call) => ({
      id: call.id,
      day: call.day,
      technicianId: call.technicianId,
      technicianName: call.technicianName,
      status: call.status,
      lane: call.lane,
      serviceAddress: call.serviceAddress,
      open: call.open
    })),
    drive,
    extraTechs: [
      ...timeTracking.cards.map((card) => ({ id: card.technicianId, name: card.technicianName })),
      ...huddle.techs.map((tech) => ({ id: tech.id, name: tech.name }))
    ]
  });
  const localLogin = loadLocalLogin({
    cwd,
    instanceId,
    sessionToken: options.localSessionToken ?? null
  });
  const jobPrices = loadJobPriceBoard({
    cwd,
    instanceId,
    missionDay,
    jobs: calls.map((call) => ({ id: call.id, day: call.day })),
    stock: stockHitsFromLines(stock.lines, stock.source)
  });

  const honesty =
    dataLabel === "synthetic-demo"
      ? "Synthetic demo on this machine. Not BYO company data. Not a live GM pilot. Miles, the ranked board, collaboration suggestions, and friction are a labeled fixture, not a telematics feed, not a company export, and not a hosted HR system. Inbound quality is a shadow checklist, not an accuracy percent and not a tenant pull. Alert actions are stubs. Option C remains prep. Monitoring is local pins, time cards, coverage, right-tech suggestions, scores, a call board, and charts on this machine. Not a live GPS feed. Suggestions are not a dispatch."
      : dataLabel === "byo-admitted-synthetic"
        ? "BYO-admitted synthetic drill. Local files only. UNVERIFIED. Writes refused. Inbound quality stays on this machine. Alert actions are stubs. Option C remains prep. Monitoring stays on this machine. Not a live GPS feed. Suggestions are not a dispatch."
        : "BYO-admitted local export. UNVERIFIED. Writes refused. Authoring node is not a custodian of this desk. Inbound quality stays on this machine. Alert actions are stubs. Option C remains prep. Monitoring stays on this machine. Not a live GPS feed. Suggestions are not a dispatch.";

  return {
    product: "trades-runtime",
    version: RUNTIME_MANIFEST.version,
    author: "Aziel Eliab",
    generatedAt: now,
    live_backends: false,
    writes: false,
    dataLabel,
    honesty,
    pilot_started: startGate.pilot_started,
    pilot: {
      optionC: startGate.pilot_started ? "started-local-isolate" : "not-started",
      optionD: "not-started"
    },
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
      receiptLines: receiptDigest.lines,
      unverified: admittedPackets,
      callbackCalls: callCounts.callback,
      warrantyCalls: callCounts.warranty,
      callsNotClassified: callCounts.notClassified
    },
    callClass: {
      source: callSource,
      note: callNote,
      counts: callCounts
    },
    callFilter: {
      value: callFilterValue,
      label: callFilterLabel(callFilterValue),
      shown: visibleCalls.length,
      total: calls.length
    },
    calls,
    visibleCalls,
    callbackWeek,
    huddle,
    drive,
    monitoring,
    timeTracking,
    coverage,
    rightTech,
    inboundQuality,
    alertActions,
    optionCStartGate: startGate,
    performance,
    workTogether,
    friction,
    partCosts,
    behavior,
    stock,
    bookingReceipt,
    series,
    capacity,
    capacityFormula,
    lanes,
    map: { drawn: false, reason: MAP_REASON },
    receiptDigest,
    mission,
    bookingBlock,
    fulfillment: fulfillmentView,
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
    report,
    fieldShell,
    jobPrices,
    propertyCards,
    localLogin
  };
}
