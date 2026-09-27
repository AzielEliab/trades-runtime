import type { CoverageBoard } from "../domain/coverage-map.js";
import type { DrivePerformance } from "../domain/drive-miles.js";
import type { FrictionBoard } from "../domain/friction.js";
import type { InboundQualityReport } from "../domain/inbound-quality.js";
import type { LocalPositionBoard } from "../domain/local-positions.js";
import type { PerformanceBoard } from "../domain/performance-board.js";
import type { RightTechBoard } from "../domain/right-tech.js";
import type { TimeTrackingBoard } from "../domain/time-tracking.js";
import { HUMAN_AUTHORITY_RULE } from "./alert-actions.js";

/**
 * One monitoring view for the local desk.
 * Recomputed from local fixtures on each refresh. Not a live stream and not a write-back.
 */

export interface MonitoringCall {
  id: string;
  lane: string | null;
  day: string;
  technicianId: string | null;
  technicianName: string | null;
  status: string | null;
}

export type CallColumnId = "scheduled" | "on-the-job" | "done" | "other";

export interface MonitoringBoard {
  product: "trades-runtime";
  author: "Aziel Eliab";
  live_backends: false;
  writes: false;
  phoneHome: false;
  liveTelematics: false;
  telematicsVendor: false;
  monitoringOnly: true;
  refused: "write-back";
  servicetitanWrite: false;
  probooksWrite: false;
  humanAuthorityRule: typeof HUMAN_AUTHORITY_RULE;
  dataLabel: string;
  note: string;
  positions: LocalPositionBoard;
  timeTracking: TimeTrackingBoard;
  coverage: CoverageBoard;
  rightTech: RightTechBoard;
  driveCards: { id: string; label: string; value: string }[];
  techCards: { id: string; rank: number; name: string; avgTicket: string; recall: string; friction: string }[];
  kpis: { id: string; label: string; value: string; note: string }[];
  columns: { id: CallColumnId; label: string; calls: MonitoringCall[] }[];
}

function num(value: number | null, digits = 1): string {
  if (value == null) return "—";
  return value.toFixed(digits);
}

function money(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(0);
}

function rate(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

export function callColumn(status: string | null): CallColumnId {
  const text = (status ?? "").trim().toLowerCase();
  if (!text) return "other";
  if (/complet|done|closed|invoiced/.test(text)) return "done";
  if (/work|progress|dispatch|en route|enroute|arrived|on site|onsite/.test(text)) return "on-the-job";
  if (/schedul|open|book|pending|unassigned/.test(text)) return "scheduled";
  return "other";
}

function monitoringNote(
  positions: "synthetic-demo" | "local-file" | "unknown",
  time: "synthetic-demo" | "local-file" | "unknown",
  coverage: "synthetic-demo" | "local-file" | "unknown"
): string {
  const sources = [positions, time, coverage];
  if (sources.includes("local-file")) {
    return "Monitoring on this machine. BYO drop-in positions, time cards, or coverage, and local scores. Not a live GPS feed. Not a map-tile vendor. Not a tenant pull. Refreshes when local files change.";
  }
  if (sources.includes("synthetic-demo")) {
    return "Monitoring on this machine. Synthetic demo positions, time cards, coverage, and calls. Not a live GPS feed. Not a map-tile vendor. Not a tenant pull. Refreshes when local files change.";
  }
  return "Monitoring on this machine. No local positions yet. Scores and calls still come from the local desk. Not a live GPS feed.";
}

const COLUMN_LABELS: Record<CallColumnId, string> = {
  scheduled: "Scheduled",
  "on-the-job": "On the job",
  done: "Done",
  other: "Other"
};

export function buildMonitoring(args: {
  dataLabel: string;
  positions: LocalPositionBoard;
  drive: DrivePerformance;
  performance: PerformanceBoard;
  friction: FrictionBoard;
  inboundQuality: InboundQualityReport;
  timeTracking: TimeTrackingBoard;
  coverage: CoverageBoard;
  rightTech: RightTechBoard;
  calls: readonly MonitoringCall[];
}): MonitoringBoard {
  const drive = args.drive;
  const top = args.performance.employees[0];
  const frictionTop = [...args.friction.employees].sort((a, b) => (a.frictionRank ?? 99) - (b.frictionRank ?? 99))[0];
  const grouped = new Map<CallColumnId, MonitoringCall[]>();
  for (const call of args.calls) {
    const column = callColumn(call.status);
    const list = grouped.get(column) ?? [];
    list.push(call);
    grouped.set(column, list);
  }
  const columnOrder: CallColumnId[] = ["scheduled", "on-the-job", "done"];
  if ((grouped.get("other") ?? []).length) columnOrder.push("other");
  const frictionById = new Map(args.friction.employees.map((row) => [row.id, row]));
  return {
    product: "trades-runtime",
    author: "Aziel Eliab",
    live_backends: false,
    writes: false,
    phoneHome: false,
    liveTelematics: false,
    telematicsVendor: false,
    monitoringOnly: true,
    refused: "write-back",
    servicetitanWrite: false,
    probooksWrite: false,
    humanAuthorityRule: HUMAN_AUTHORITY_RULE,
    dataLabel: args.dataLabel,
    note: monitoringNote(args.positions.source, args.timeTracking.source, args.coverage.source),
    positions: args.positions,
    timeTracking: args.timeTracking,
    coverage: args.coverage,
    rightTech: args.rightTech,
    driveCards: [
      { id: "miles", label: "Miles", value: num(drive.totalMiles) },
      { id: "miles-per-stop", label: "Miles / stop", value: num(drive.milesPerStop) },
      { id: "minutes-per-stop", label: "Min / stop", value: num(drive.minutesPerStop) },
      { id: "miles-per-job", label: "Miles / job", value: num(drive.milesPerCompletedJob) }
    ],
    techCards: args.performance.employees.slice(0, 5).map((row) => ({
      id: row.id,
      rank: row.rank,
      name: row.label,
      avgTicket: money(row.avgTicket),
      recall: rate(row.recallRate),
      friction: rate(frictionById.get(row.id)?.frictionRate ?? null)
    })),
    kpis: [
      {
        id: "quality",
        label: "Inbound quality",
        value: args.inboundQuality.meanScore == null ? "—" : String(args.inboundQuality.meanScore),
        note: "Checklist, not an accuracy percent"
      },
      {
        id: "ticket",
        label: "Top avg ticket",
        value: top ? money(top.avgTicket) : "—",
        note: top ? `${top.label} · rank ${top.rank}` : "No ranked tech"
      },
      {
        id: "friction",
        label: "Friction",
        value: frictionTop?.frictionRate == null ? "—" : rate(frictionTop.frictionRate),
        note: frictionTop ? frictionTop.label : "Unknown"
      },
      {
        id: "drive",
        label: "Miles",
        value: num(drive.totalMiles, 0),
        note: drive.source === "unknown" ? "Unknown" : drive.source
      }
    ],
    columns: columnOrder.map((id) => ({
      id,
      label: COLUMN_LABELS[id],
      calls: grouped.get(id) ?? []
    }))
  };
}
