import { classifyCall, SYNTHETIC_DESK_CALLS, SYNTHETIC_DESK_TECHS, type CallFlag } from "./call-class.js";

/**
 * Operator performance board.
 * Ranks employees and departments best to worst from local aggregates.
 * The rank is not a skill score and does not set trainingNeeded.
 * A synthetic demo is not a company export.
 */

export interface PerformanceJob {
  id: string;
  technicianId: string | null;
  technicianName: string | null;
  department: string | null;
  callback: CallFlag;
  /** Named ticket dollars. Null when the row did not say. Not copied from revenue. */
  ticket: number | null;
  /** Named sold dollars. Null when the row did not say. Zero is a named zero. */
  sold: number | null;
  /** Named current revenue dollars. Null when the row did not say. Not copied from ticket or sold. */
  revenue: number | null;
}

export interface PerformanceMetrics {
  jobs: number;
  callbacks: number;
  /** Explicit callback labels divided by jobs. Null when there are no jobs. Unknown is not a callback. */
  recallRate: number | null;
  avgTicket: number | null;
  ticketRows: number;
  averageSold: number | null;
  soldRows: number;
  currentRevenue: number | null;
  revenueRows: number;
}

export interface RankedPerformanceRow extends PerformanceMetrics {
  rank: number;
  id: string;
  label: string;
  /** Mean of the scaled metrics that this row named. Not a skill score. */
  boardOrder: number;
  notASkillScore: true;
  trainingSeparate: true;
}

export interface PerformanceBoard {
  product: "trades-runtime";
  live_backends: false;
  writes: false;
  phoneHome: false;
  companyExport: false;
  notASkillScore: true;
  trainingSeparate: true;
  source: "synthetic-demo" | "admitted-rows" | "none";
  note: string;
  rankBasis: string;
  employees: RankedPerformanceRow[];
  departments: RankedPerformanceRow[];
}

/** Fixture dollars for the empty-folder desk. Not a company export. */
export const SYNTHETIC_PERFORMANCE_MONEY: Readonly<Record<string, { ticket: number; sold: number; revenue: number }>> = {
  "SYN-DESK-HVAC-1": { ticket: 420, sold: 80, revenue: 420 },
  "SYN-DESK-HVAC-2": { ticket: 380, sold: 60, revenue: 380 },
  "SYN-DESK-HVAC-3": { ticket: 460, sold: 90, revenue: 460 },
  "SYN-DESK-PL-1": { ticket: 300, sold: 40, revenue: 300 },
  "SYN-DESK-PL-2": { ticket: 280, sold: 20, revenue: 280 },
  "SYN-DESK-EL-1": { ticket: 400, sold: 100, revenue: 400 },
  "SYN-DESK-EL-2": { ticket: 500, sold: 150, revenue: 500 },
  "SYN-DESK-SW-1": { ticket: 200, sold: 0, revenue: 200 },
  "SYN-DESK-SW-2": { ticket: 180, sold: 10, revenue: 180 },
  "SYN-DESK-XT-1": { ticket: 900, sold: 400, revenue: 900 }
};

export const PERFORMANCE_RANK_BASIS =
  "Best to worst (1…N). Each comparable metric is scaled from 0 to 1 inside this set. Higher avg ticket, higher average sold, and higher current revenue score higher. A lower recall rate scores higher. A metric with no spread, or a blank on a row, is left out of that row's blend. Ties break by name. The blend is an operator board order. It is not a skill score and it does not set trainingNeeded.";

const TICKET_KEYS = ["ticket", "ticketAmount", "ticket_amount", "invoiceTotal", "invoice_total", "jobTotal", "job_total"];
const SOLD_KEYS = ["sold", "soldAmount", "sold_amount", "optionsSold", "options_sold"];
const REVENUE_KEYS = ["revenue", "currentRevenue", "current_revenue"];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function readMoney(value: unknown): number | null {
  if (typeof value === "boolean") return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return round2(value);
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) return round2(parsed);
  }
  return null;
}

function firstMoney(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in row)) continue;
    const money = readMoney(row[key]);
    if (money != null) return money;
  }
  return null;
}

/** Explicit job-row money fields only. Ticket, sold, and revenue are not copied from each other. */
export function knownJobMoney(raw: Record<string, unknown>): { ticket: number | null; sold: number | null; revenue: number | null } {
  return {
    ticket: firstMoney(raw, TICKET_KEYS),
    sold: firstMoney(raw, SOLD_KEYS),
    revenue: firstMoney(raw, REVENUE_KEYS)
  };
}

export function syntheticPerformanceJobs(): PerformanceJob[] {
  return SYNTHETIC_DESK_CALLS.map((row) => {
    const tech = SYNTHETIC_DESK_TECHS.find((item) => item.id === row.technicianId);
    const money = SYNTHETIC_PERFORMANCE_MONEY[row.id];
    if (!money) throw new Error(`synthetic performance money missing for ${row.id}`);
    return {
      id: row.id,
      technicianId: row.technicianId,
      technicianName: tech?.name ?? null,
      department: row.trade,
      callback: classifyCall(row.raw).callback,
      ticket: money.ticket,
      sold: money.sold,
      revenue: money.revenue
    };
  });
}

/** A board rank is not technician skill. */
export function performanceAsSkillScore(_board?: PerformanceBoard | RankedPerformanceRow): never {
  throw new Error("a performance board rank is not technician skill");
}

/** Ticket, sold, and revenue on this board are not a training flag. trainingNeeded stays separate. */
export function performanceAsTraining(_board?: PerformanceBoard | RankedPerformanceRow): never {
  throw new Error("performance board revenue, ticket, and sold figures are not a training flag");
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return round2(values.reduce((total, value) => total + value, 0) / values.length);
}

function metricsFor(jobs: readonly PerformanceJob[]): PerformanceMetrics {
  const tickets = jobs.map((job) => job.ticket).filter((value): value is number => value != null);
  const sold = jobs.map((job) => job.sold).filter((value): value is number => value != null);
  const revenue = jobs.map((job) => job.revenue).filter((value): value is number => value != null);
  const callbacks = jobs.filter((job) => job.callback === "yes").length;
  return {
    jobs: jobs.length,
    callbacks,
    recallRate: jobs.length === 0 ? null : round4(callbacks / jobs.length),
    avgTicket: mean(tickets),
    ticketRows: tickets.length,
    averageSold: mean(sold),
    soldRows: sold.length,
    currentRevenue: revenue.length ? round2(revenue.reduce((total, value) => total + value, 0)) : null,
    revenueRows: revenue.length
  };
}

type ScoreKey = "avgTicket" | "recallRate" | "averageSold" | "currentRevenue";

const SCORE_SPECS: { key: ScoreKey; higherBetter: boolean }[] = [
  { key: "avgTicket", higherBetter: true },
  { key: "recallRate", higherBetter: false },
  { key: "averageSold", higherBetter: true },
  { key: "currentRevenue", higherBetter: true }
];

function boardOrders(rows: PerformanceMetrics[]): number[] {
  const scores = rows.map(() => [] as number[]);
  for (const spec of SCORE_SPECS) {
    const present = rows.map((row) => row[spec.key]).filter((value): value is number => value != null);
    if (present.length < 2) continue;
    const min = Math.min(...present);
    const max = Math.max(...present);
    if (max === min) continue;
    rows.forEach((row, index) => {
      const value = row[spec.key];
      if (value == null) return;
      const unit = (value - min) / (max - min);
      scores[index]!.push(spec.higherBetter ? unit : 1 - unit);
    });
  }
  return scores.map((list) => (list.length ? round4(list.reduce((total, value) => total + value, 0) / list.length) : 0));
}

interface GroupSeed {
  id: string;
  label: string;
  jobs: PerformanceJob[];
}

function rankGroups(groups: GroupSeed[]): RankedPerformanceRow[] {
  const metrics = groups.map((group) => metricsFor(group.jobs));
  const orders = boardOrders(metrics);
  const ranked = groups.map((group, index) => ({
    ...metrics[index]!,
    id: group.id,
    label: group.label,
    boardOrder: orders[index] ?? 0,
    rank: 0,
    notASkillScore: true as const,
    trainingSeparate: true as const
  }));
  ranked.sort((a, b) => b.boardOrder - a.boardOrder || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  return ranked.map((row, index) => ({ ...row, rank: index + 1 }));
}

function groupBy(jobs: readonly PerformanceJob[], kind: "employee" | "department"): GroupSeed[] {
  const groups = new Map<string, GroupSeed>();
  for (const job of jobs) {
    const id = kind === "employee" ? job.technicianId ?? "unassigned" : job.department ?? "unnamed";
    const label =
      kind === "employee" ? job.technicianName ?? (job.technicianId ? job.technicianId : "Unassigned") : id;
    const existing = groups.get(id) ?? { id, label, jobs: [] };
    if (kind === "employee" && existing.label === existing.id && job.technicianName) existing.label = job.technicianName;
    existing.jobs.push(job);
    groups.set(id, existing);
  }
  return [...groups.values()];
}

function noteFor(source: PerformanceBoard["source"], jobs: readonly PerformanceJob[]): string {
  const moneyNamed = jobs.some((job) => job.ticket != null || job.sold != null || job.revenue != null);
  if (source === "none") {
    return "No job rows on this desk. Ranks are not invented. This board is not a skill score and it does not set trainingNeeded.";
  }
  const moneyLine = moneyNamed
    ? "Avg ticket, average sold, and current revenue use only fields the row named. A blank stays blank and is not treated as zero. Ticket, sold, and revenue are not copied from each other."
    : "These rows did not name ticket, sold, or revenue. Those figures stay blank. Recall rate still uses explicit callback labels. Unknown is not a callback.";
  const head =
    source === "synthetic-demo"
      ? "Synthetic demo rows on this machine. Not a company export."
      : "Admitted local rows. UNVERIFIED. A local admit is not a company export.";
  return `${head} ${moneyLine} ${PERFORMANCE_RANK_BASIS}`;
}

export function buildPerformanceBoard(args: {
  jobs: readonly PerformanceJob[];
  source: "synthetic-demo" | "admitted-rows" | "none";
}): PerformanceBoard {
  const jobs = args.jobs.filter((job) => job.id);
  const source = jobs.length === 0 ? "none" : args.source;
  return {
    product: "trades-runtime",
    live_backends: false,
    writes: false,
    phoneHome: false,
    companyExport: false,
    notASkillScore: true,
    trainingSeparate: true,
    source,
    note: noteFor(source, jobs),
    rankBasis: PERFORMANCE_RANK_BASIS,
    employees: rankGroups(groupBy(jobs, "employee")),
    departments: rankGroups(groupBy(jobs, "department"))
  };
}

/** Compact best-to-worst lines: `1. Name`. */
export function formatRankedBoard(rows: readonly RankedPerformanceRow[]): string {
  return rows.map((row) => `${row.rank}. ${row.label}`).join("\n");
}
