import { daysBetween, listOf, pickText, readInboundRows, readModuleFile, sourceNote, type InboundRow, type ModuleContext, type ModuleSourceNote } from "./common.js";

/**
 * Permits and inspections per job and jurisdiction. Statuses: pulled, pending,
 * scheduled, passed, failed, cancelled. Aging alerts name jobs blocked on an
 * inspection. Thresholds are the shop's own (settings in permits.json), with
 * conservative defaults. Nothing is filed with a jurisdiction from here.
 */

export const PERMIT_STATUSES = ["pending", "pulled", "scheduled", "passed", "failed", "cancelled"] as const;
export type PermitStatus = (typeof PERMIT_STATUSES)[number];

export interface Permit {
  permitId: string;
  jobId: string;
  jurisdiction: string;
  permitType?: string;
  permitNumber?: string;
  status: PermitStatus;
  appliedOn?: string;
  pulledOn?: string;
  inspectionScheduledFor?: string;
  inspectedOn?: string;
  statusChangedOn?: string;
  note?: string;
  source: string;
}

export interface PermitSettings {
  /** Applied but not issued for more than N days. */
  pendingDays: number;
  /** Issued (pulled) with no inspection scheduled for more than N days. */
  pulledNoInspectionDays: number;
  /** Failed with no re-inspection scheduled for more than N days. */
  failedDays: number;
}

export const DEFAULT_PERMIT_SETTINGS: PermitSettings = { pendingDays: 7, pulledNoInspectionDays: 14, failedDays: 3 };

export interface PermitAlert {
  id: string;
  permitId: string;
  jobId: string;
  severity: "hold" | "watch";
  ageDays: number;
  message: string;
}

export interface PermitBoard {
  module: "permits";
  generatedAt: string;
  settings: PermitSettings;
  permits: Array<Permit & { ageDays: number | null; blocking: boolean }>;
  byStatus: Record<PermitStatus, number>;
  byJurisdiction: Array<{ jurisdiction: string; open: number; failed: number; passed: number; avgDaysToPass: number | null }>;
  blockedJobs: Array<{ jobId: string; permits: string[]; oldestAgeDays: number }>;
  alerts: PermitAlert[];
  source: ModuleSourceNote;
  note: string;
}

function normalizeStatus(value: string): PermitStatus | undefined {
  const token = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, PermitStatus> = {
    pending: "pending",
    applied: "pending",
    submitted: "pending",
    pulled: "pulled",
    issued: "pulled",
    approved: "pulled",
    scheduled: "scheduled",
    inspectionscheduled: "scheduled",
    passed: "passed",
    pass: "passed",
    final: "passed",
    finaled: "passed",
    closed: "passed",
    failed: "failed",
    fail: "failed",
    rejected: "failed",
    correctionsrequired: "failed",
    cancelled: "cancelled",
    canceled: "cancelled",
    void: "cancelled"
  };
  return map[token];
}

export function parsePermit(row: Record<string, unknown>, source: string, defaults: { jobId?: string } = {}): Permit | undefined {
  const jobId = pickText(row, ["jobId", "job_id"]) || defaults.jobId || "";
  const status = normalizeStatus(pickText(row, ["status", "permitStatus", "inspectionResult"]));
  const jurisdiction = pickText(row, ["jurisdiction", "authority", "city", "county", "ahj"]);
  if (!jobId || !status || !jurisdiction) return undefined;
  const permitId = pickText(row, ["permitId", "id", "permitNumber"]) || `${jobId}:${jurisdiction}:${pickText(row, ["permitType", "type"]) || "permit"}`;
  const date = (keys: string[]) => {
    const value = pickText(row, keys);
    return value && Number.isFinite(Date.parse(value)) ? value : undefined;
  };
  return {
    permitId,
    jobId,
    jurisdiction,
    permitType: pickText(row, ["permitType", "type"]) || undefined,
    permitNumber: pickText(row, ["permitNumber", "number"]) || undefined,
    status,
    appliedOn: date(["appliedOn", "submittedOn", "applied"]),
    pulledOn: date(["pulledOn", "issuedOn", "issued"]),
    inspectionScheduledFor: date(["inspectionScheduledFor", "inspectionDate", "scheduledFor"]),
    inspectedOn: date(["inspectedOn", "resultOn"]),
    statusChangedOn: date(["statusChangedOn", "updatedOn", "updatedAt"]),
    note: pickText(row, ["note", "notes", "corrections"]) || undefined,
    source
  };
}

export function permitsFromInbound(rows: InboundRow[]): Permit[] {
  const out: Permit[] = [];
  for (const row of rows) {
    if (row.entity !== "job") continue;
    for (const entry of listOf(row.raw.permits ?? row.raw.permit)) {
      const permit = parsePermit(entry, `${row.peerClass}:${row.file}`, { jobId: row.externalId });
      if (permit) out.push(permit);
    }
  }
  return out;
}

function lastChange(permit: Permit): string | undefined {
  return permit.statusChangedOn ?? permit.inspectedOn ?? permit.pulledOn ?? permit.appliedOn;
}

function settingsFrom(raw: unknown): PermitSettings {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const pick = (key: keyof PermitSettings) => {
    const value = record[key];
    return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 365 ? value : DEFAULT_PERMIT_SETTINGS[key];
  };
  return { pendingDays: pick("pendingDays"), pulledNoInspectionDays: pick("pulledNoInspectionDays"), failedDays: pick("failedDays") };
}

export function buildPermitBoard(ctx: ModuleContext, rows?: InboundRow[]): PermitBoard {
  const file = readModuleFile(ctx.cwd, ctx.instanceId, "permits");
  const inbound = rows ?? readInboundRows(ctx);
  const settings = settingsFrom(file.data.settings);
  const byId = new Map<string, Permit>();
  for (const permit of permitsFromInbound(inbound)) byId.set(permit.permitId, permit);
  for (const row of listOf(file.data.permits)) {
    const permit = parsePermit(row, "local-log");
    if (permit) byId.set(permit.permitId, permit);
  }
  const today = ctx.now;
  const alerts: PermitAlert[] = [];
  const permits = [...byId.values()]
    .sort((a, b) => a.jobId.localeCompare(b.jobId) || a.permitId.localeCompare(b.permitId))
    .map((permit) => {
      const changed = lastChange(permit);
      const ageDays = changed ? Math.max(daysBetween(changed, today), 0) : null;
      let blocking = permit.status === "pending" || permit.status === "pulled" || permit.status === "scheduled" || permit.status === "failed";
      const alert = (severity: PermitAlert["severity"], message: string) =>
        alerts.push({ id: `permit:${permit.permitId}:${permit.status}`, permitId: permit.permitId, jobId: permit.jobId, severity, ageDays: ageDays ?? 0, message });
      if (permit.status === "pending" && ageDays !== null && ageDays > settings.pendingDays) {
        alert("watch", `Job ${permit.jobId}: ${permit.jurisdiction} permit pending ${ageDays} days (over ${settings.pendingDays}).`);
      }
      if (permit.status === "pulled" && !permit.inspectionScheduledFor && ageDays !== null && ageDays > settings.pulledNoInspectionDays) {
        alert("watch", `Job ${permit.jobId}: ${permit.jurisdiction} permit issued ${ageDays} days ago with no inspection scheduled.`);
      }
      if (permit.status === "scheduled" && permit.inspectionScheduledFor && permit.inspectionScheduledFor.slice(0, 10) < today.slice(0, 10)) {
        alert("hold", `Job ${permit.jobId}: ${permit.jurisdiction} inspection was scheduled for ${permit.inspectionScheduledFor.slice(0, 10)} and has no result.`);
      }
      if (permit.status === "failed" && ageDays !== null && ageDays > settings.failedDays) {
        alert("hold", `Job ${permit.jobId}: ${permit.jurisdiction} inspection failed ${ageDays} days ago and no re-inspection is scheduled.`);
      }
      if (permit.status === "passed" || permit.status === "cancelled") blocking = false;
      return { ...permit, ageDays, blocking };
    });
  const byStatus = Object.fromEntries(PERMIT_STATUSES.map((status) => [status, permits.filter((p) => p.status === status).length])) as Record<PermitStatus, number>;
  const jurisdictions = [...new Set(permits.map((p) => p.jurisdiction))].sort();
  const byJurisdiction = jurisdictions.map((jurisdiction) => {
    const mine = permits.filter((p) => p.jurisdiction === jurisdiction);
    const passDurations = mine
      .filter((p) => p.status === "passed" && p.appliedOn && p.inspectedOn)
      .map((p) => daysBetween(p.appliedOn!, p.inspectedOn!));
    return {
      jurisdiction,
      open: mine.filter((p) => p.blocking).length,
      failed: mine.filter((p) => p.status === "failed").length,
      passed: mine.filter((p) => p.status === "passed").length,
      avgDaysToPass: passDurations.length ? Math.round((passDurations.reduce((a, b) => a + b, 0) / passDurations.length) * 10) / 10 : null
    };
  });
  const jobs = new Map<string, { jobId: string; permits: string[]; oldestAgeDays: number }>();
  for (const permit of permits) {
    if (!permit.blocking) continue;
    const entry = jobs.get(permit.jobId) ?? { jobId: permit.jobId, permits: [], oldestAgeDays: 0 };
    entry.permits.push(permit.permitId);
    entry.oldestAgeDays = Math.max(entry.oldestAgeDays, permit.ageDays ?? 0);
    jobs.set(permit.jobId, entry);
  }
  return {
    module: "permits",
    generatedAt: ctx.now,
    settings,
    permits,
    byStatus,
    byJurisdiction,
    blockedJobs: [...jobs.values()].sort((a, b) => b.oldestAgeDays - a.oldestAgeDays),
    alerts,
    source: sourceNote(file, inbound.filter((row) => listOf(row.raw.permits ?? row.raw.permit).length > 0)),
    note: "Permit and inspection status from local files and admitted job rows. Aging thresholds are this shop's settings. Nothing is filed with a jurisdiction."
  };
}

export function validatePermitWrite(args: Record<string, unknown>): Permit {
  const permit = parsePermit(args, "approved-write");
  if (!permit) throw new Error(`permit update needs jobId, jurisdiction, and status (${PERMIT_STATUSES.join(", ")})`);
  return permit;
}
