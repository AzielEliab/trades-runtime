import { classifyCall } from "../domain/call-class.js";
import { daysBetween, dayOf, listOf, pickNum, pickText, readInboundRows, readModuleFile, sourceNote, type InboundRow, type ModuleContext, type ModuleSourceNote } from "./common.js";

/**
 * Manufacturer warranty claims. Finds parts replaced under warranty with no
 * claim on file, and ages open claims. Filing windows differ by manufacturer
 * and are not guessed: a days-left figure appears only when the shop sets
 * settings.filingWindowDays for that manufacturer. Nothing is filed from here.
 */

export const CLAIM_STATUSES = ["draft", "submitted", "approved", "denied", "paid", "closed"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
const OPEN_STATUSES: ClaimStatus[] = ["draft", "submitted", "approved", "denied"];

export interface WarrantyPart {
  partUseId: string;
  jobId: string;
  partNumber: string;
  manufacturer?: string;
  equipmentModel?: string;
  serialNumber?: string;
  replacedOn?: string;
  technicianId?: string;
  quantity: number;
  source: string;
}

export interface WarrantyClaim {
  claimId: string;
  partUseId?: string;
  jobId?: string;
  partNumber?: string;
  manufacturer?: string;
  claimNumber?: string;
  status: ClaimStatus;
  submittedOn?: string;
  statusChangedOn?: string;
  amountClaimed?: number;
  amountPaid?: number;
  note?: string;
  source: string;
}

export interface WarrantyClaimSettings {
  /** Alert when a warranty part has no claim after N days. */
  unclaimedDays: number;
  /** Alert when a submitted or approved claim has not changed in N days. */
  claimAgingDays: number;
  /** Shop-entered filing windows per manufacturer (lowercase name → days). */
  filingWindowDays: Record<string, number>;
}

export const DEFAULT_WARRANTY_CLAIM_SETTINGS: WarrantyClaimSettings = { unclaimedDays: 7, claimAgingDays: 30, filingWindowDays: {} };

export interface WarrantyClaimAlert {
  id: string;
  severity: "hold" | "watch";
  message: string;
}

export interface WarrantyClaimBoard {
  module: "warranty_claims";
  generatedAt: string;
  settings: WarrantyClaimSettings;
  unclaimed: Array<WarrantyPart & { ageDays: number | null; filingDaysLeft: number | null }>;
  claims: Array<WarrantyClaim & { ageDays: number | null }>;
  byStatus: Record<ClaimStatus, number>;
  byManufacturer: Array<{ manufacturer: string; parts: number; unclaimed: number; open: number; denied: number; paid: number }>;
  totals: { warrantyParts: number; unclaimed: number; openClaims: number; amountClaimed: number; amountPaid: number };
  alerts: WarrantyClaimAlert[];
  source: ModuleSourceNote;
  note: string;
}

const yes = (value: unknown) => value === true || ["yes", "true", "y", "1", "warranty", "covered"].includes(String(value ?? "").trim().toLowerCase());
const no = (value: unknown) => value === false || ["no", "false", "n", "0", "not-covered", "out-of-warranty"].includes(String(value ?? "").trim().toLowerCase());

export function parseWarrantyPart(row: Record<string, unknown>, source: string, fallback: Partial<WarrantyPart> = {}): WarrantyPart | null {
  const jobId = pickText(row, ["jobId", "job_id"]) || fallback.jobId || "";
  const partNumber = pickText(row, ["partNumber", "part_number", "sku", "itemNumber", "item_number", "code"]);
  if (!jobId || !partNumber) return null;
  const partUseId = pickText(row, ["partUseId", "part_use_id", "id", "lineItemId"]) || `${jobId}:${partNumber}`;
  return {
    partUseId,
    jobId,
    partNumber,
    manufacturer: pickText(row, ["manufacturer", "brand", "make"]) || fallback.manufacturer || undefined,
    equipmentModel: pickText(row, ["equipmentModel", "model", "modelNumber"]) || fallback.equipmentModel || undefined,
    serialNumber: pickText(row, ["serialNumber", "serial", "serial_number"]) || fallback.serialNumber || undefined,
    replacedOn: dayOf(pickText(row, ["replacedOn", "installedOn", "usedOn", "date"])) ?? fallback.replacedOn,
    technicianId: pickText(row, ["technicianId", "techId"]) || fallback.technicianId || undefined,
    quantity: pickNum(row, ["quantity", "qty"]) ?? 1,
    source
  };
}

function claimStatus(value: string): ClaimStatus | null {
  const folded = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if ((CLAIM_STATUSES as readonly string[]).includes(folded)) return folded as ClaimStatus;
  if (["filed", "pending", "open", "in-review"].includes(folded)) return "submitted";
  if (["rejected"].includes(folded)) return "denied";
  if (["credited", "reimbursed"].includes(folded)) return "paid";
  return null;
}

export function parseWarrantyClaim(row: Record<string, unknown>, source: string): WarrantyClaim | null {
  const claimId = pickText(row, ["claimId", "claim_id"]);
  const status = claimStatus(pickText(row, ["status"]));
  if (!claimId || !status) return null;
  return {
    claimId,
    partUseId: pickText(row, ["partUseId"]) || undefined,
    jobId: pickText(row, ["jobId", "job_id"]) || undefined,
    partNumber: pickText(row, ["partNumber", "part_number", "sku"]) || undefined,
    manufacturer: pickText(row, ["manufacturer", "brand"]) || undefined,
    claimNumber: pickText(row, ["claimNumber", "claim_number"]) || undefined,
    status,
    submittedOn: dayOf(pickText(row, ["submittedOn", "filedOn"])),
    statusChangedOn: dayOf(pickText(row, ["statusChangedOn", "updatedOn"])),
    amountClaimed: pickNum(row, ["amountClaimed", "claimAmount"]),
    amountPaid: pickNum(row, ["amountPaid", "creditAmount"]),
    note: pickText(row, ["note"]) || undefined,
    source
  };
}

/** Warranty parts on admitted job rows: parts flagged underWarranty, or every part on a job labeled warranty unless the part says no. */
export function warrantyPartsFromInbound(rows: InboundRow[]): WarrantyPart[] {
  const out: WarrantyPart[] = [];
  for (const row of rows) {
    if (row.entity !== "job") continue;
    const parts = [...listOf(row.raw.parts), ...listOf(row.raw.partsUsed), ...listOf(row.raw.warrantyParts), ...listOf(row.raw.lineItems)];
    if (!parts.length) continue;
    const jobWarranty = classifyCall(row.raw).warranty === "yes";
    const equipment = listOf(row.raw.equipment)[0] ?? {};
    for (const part of parts) {
      const flag = part.underWarranty ?? part.warranty ?? part.isWarranty;
      if (no(flag) || (!yes(flag) && !jobWarranty)) continue;
      const parsed = parseWarrantyPart(part, `${row.peerClass}:${row.file}`, {
        jobId: row.externalId,
        manufacturer: pickText(equipment, ["manufacturer", "brand", "make"]) || undefined,
        equipmentModel: pickText(equipment, ["model", "modelNumber"]) || pickText(row.raw, ["equipmentModel"]) || undefined,
        serialNumber: pickText(equipment, ["serialNumber", "serial"]) || undefined,
        replacedOn: dayOf(row.observedAt),
        technicianId: row.technicianId
      });
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

function settingsFrom(value: unknown): WarrantyClaimSettings {
  const row = listOf(value)[0] ?? {};
  const windows: Record<string, number> = {};
  const raw = row.filingWindowDays;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, days] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof days === "number" && days > 0) windows[key.trim().toLowerCase()] = days;
    }
  }
  return {
    unclaimedDays: pickNum(row, ["unclaimedDays"]) ?? DEFAULT_WARRANTY_CLAIM_SETTINGS.unclaimedDays,
    claimAgingDays: pickNum(row, ["claimAgingDays"]) ?? DEFAULT_WARRANTY_CLAIM_SETTINGS.claimAgingDays,
    filingWindowDays: windows
  };
}

function claimMatches(claim: WarrantyClaim, part: WarrantyPart): boolean {
  if (claim.partUseId) return claim.partUseId === part.partUseId;
  return Boolean(claim.jobId && claim.partNumber && claim.jobId === part.jobId && claim.partNumber === part.partNumber);
}

export function buildWarrantyClaimBoard(ctx: ModuleContext, rows?: InboundRow[]): WarrantyClaimBoard {
  const file = readModuleFile(ctx.cwd, ctx.instanceId, "warranty-claims");
  const inbound = rows ?? readInboundRows(ctx);
  const settings = settingsFrom(file.data.settings);
  const parts = new Map<string, WarrantyPart>();
  for (const part of warrantyPartsFromInbound(inbound)) parts.set(part.partUseId, part);
  for (const row of listOf(file.data.parts)) {
    const part = parseWarrantyPart(row, "local-log");
    if (part) parts.set(part.partUseId, part);
  }
  const claimsById = new Map<string, WarrantyClaim>();
  for (const row of listOf(file.data.claims)) {
    const claim = parseWarrantyClaim(row, "local-log");
    if (claim) claimsById.set(claim.claimId, claim);
  }
  const claims = [...claimsById.values()];
  const today = ctx.now.slice(0, 10);
  const alerts: WarrantyClaimAlert[] = [];
  const unclaimed = [...parts.values()]
    .filter((part) => !claims.some((claim) => claimMatches(claim, part)))
    .map((part) => {
      const ageDays = part.replacedOn ? Math.max(daysBetween(part.replacedOn, today), 0) : null;
      const window = part.manufacturer ? settings.filingWindowDays[part.manufacturer.toLowerCase()] : undefined;
      const filingDaysLeft = window !== undefined && ageDays !== null ? window - ageDays : null;
      if (filingDaysLeft !== null && filingDaysLeft <= 7) {
        alerts.push({ id: `warranty-window:${part.partUseId}`, severity: "hold", message: `Job ${part.jobId}: ${part.partNumber} (${part.manufacturer}) ${filingDaysLeft < 0 ? `is ${-filingDaysLeft} days past` : `has ${filingDaysLeft} days left in`} the shop-entered ${window}-day filing window and has no claim.` });
      } else if (ageDays === null || ageDays > settings.unclaimedDays) {
        alerts.push({ id: `warranty-unclaimed:${part.partUseId}`, severity: "watch", message: `Job ${part.jobId}: ${part.partNumber} replaced under warranty${ageDays === null ? " (no date)" : ` ${ageDays} days ago`} with no claim on file.` });
      }
      return { ...part, ageDays, filingDaysLeft };
    })
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const claimRows = claims
    .map((claim) => {
      const changed = claim.statusChangedOn ?? claim.submittedOn;
      const ageDays = changed ? Math.max(daysBetween(changed, today), 0) : null;
      if ((claim.status === "submitted" || claim.status === "approved") && ageDays !== null && ageDays > settings.claimAgingDays) {
        alerts.push({ id: `warranty-aging:${claim.claimId}`, severity: "watch", message: `Claim ${claim.claimNumber ?? claim.claimId} has been ${claim.status} for ${ageDays} days.` });
      }
      if (claim.status === "denied") alerts.push({ id: `warranty-denied:${claim.claimId}`, severity: "hold", message: `Claim ${claim.claimNumber ?? claim.claimId} was denied. Appeal or close it.` });
      if (claim.status === "draft" && ageDays !== null && ageDays > settings.unclaimedDays) {
        alerts.push({ id: `warranty-draft:${claim.claimId}`, severity: "watch", message: `Claim ${claim.claimId} is still a draft after ${ageDays} days.` });
      }
      return { ...claim, ageDays };
    })
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));
  const byStatus = Object.fromEntries(CLAIM_STATUSES.map((status) => [status, claimRows.filter((c) => c.status === status).length])) as Record<ClaimStatus, number>;
  const manufacturers = [...new Set([...parts.values()].map((p) => p.manufacturer ?? "unnamed").concat(claims.map((c) => c.manufacturer ?? "unnamed")))].sort();
  const byManufacturer = manufacturers.map((manufacturer) => {
    const mine = (m?: string) => (m ?? "unnamed") === manufacturer;
    return {
      manufacturer,
      parts: [...parts.values()].filter((p) => mine(p.manufacturer)).length,
      unclaimed: unclaimed.filter((p) => mine(p.manufacturer)).length,
      open: claims.filter((c) => mine(c.manufacturer) && OPEN_STATUSES.includes(c.status) && c.status !== "denied").length,
      denied: claims.filter((c) => mine(c.manufacturer) && c.status === "denied").length,
      paid: claims.filter((c) => mine(c.manufacturer) && c.status === "paid").length
    };
  });
  const sum = (values: Array<number | undefined>) => Math.round(values.reduce<number>((acc, v) => acc + (v ?? 0), 0) * 100) / 100;
  return {
    module: "warranty_claims",
    generatedAt: ctx.now,
    settings,
    unclaimed,
    claims: claimRows,
    byStatus,
    byManufacturer,
    totals: {
      warrantyParts: parts.size,
      unclaimed: unclaimed.length,
      openClaims: claimRows.filter((c) => c.status === "draft" || c.status === "submitted" || c.status === "approved").length,
      amountClaimed: sum(claims.map((c) => c.amountClaimed)),
      amountPaid: sum(claims.map((c) => c.amountPaid))
    },
    alerts,
    source: sourceNote(file, inbound),
    note: "A warranty part comes from an explicit underWarranty flag or a job labeled warranty. Amounts are only the ones written on claims. Filing windows appear only when the shop enters them. Nothing is submitted to a manufacturer from here."
  };
}

export function validateWarrantyClaimWrite(args: Record<string, unknown>): WarrantyClaim {
  const claim = parseWarrantyClaim(args, "approved-write");
  if (!claim) throw new Error(`claimId and status (${CLAIM_STATUSES.join(", ")}) are required`);
  if (!claim.partUseId && !(claim.jobId && claim.partNumber)) throw new Error("a claim needs partUseId, or jobId and partNumber");
  for (const key of ["amountClaimed", "amountPaid"] as const) {
    if (claim[key] !== undefined && claim[key]! < 0) throw new Error(`${key} must be non-negative`);
  }
  return claim;
}
