import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isHostedTenantLayout, refuseHostedTenantLayout, RUNTIME_ISOLATE_ROOT } from "../spine/inbound-layout.js";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";

/**
 * Local field flags. A tech names a van and a label. The office desk can show
 * that file. This module is the field wave. It is not Office Softwares and it
 * is not a Field 1.0 claim.
 */

export const FIELD_FLAG_KINDS = [
  "needsParts",
  "safetyHold",
  "customerEscalation",
  "vanDown",
  "callbackRisk"
] as const;

export type FieldFlagKind = (typeof FIELD_FLAG_KINDS)[number];

export type FieldFlagSeverity = "info" | "watch" | "hold";

export interface FieldFlagNotice {
  severity: FieldFlagSeverity;
  title: string;
  detail: string;
}

export interface FieldFlag {
  flagId: string;
  vanId: string;
  jobId?: string;
  kind: FieldFlagKind;
  severity: FieldFlagSeverity;
  note: string;
  raisedAt: string;
  raisedBy: string;
  inventedAccuracy: false;
}

const FIELD_FLAG_SEVERITY: Record<FieldFlagKind, FieldFlagSeverity> = {
  needsParts: "watch",
  safetyHold: "hold",
  customerEscalation: "watch",
  vanDown: "hold",
  callbackRisk: "watch"
};

const FIELD_FLAG_TITLE: Record<FieldFlagKind, string> = {
  needsParts: "Needs parts",
  safetyHold: "Safety hold",
  customerEscalation: "Customer escalation",
  vanDown: "Van down",
  callbackRisk: "Callback risk"
};

const FIELD_FLAG_ALIASES: Record<string, FieldFlagKind> = {
  needsparts: "needsParts",
  needs_parts: "needsParts",
  safetyhold: "safetyHold",
  safety_hold: "safetyHold",
  customerescalation: "customerEscalation",
  customer_escalation: "customerEscalation",
  vandown: "vanDown",
  van_down: "vanDown",
  callbackrisk: "callbackRisk",
  callback_risk: "callbackRisk"
};

const FORBIDDEN_FLAG_KEYS = [
  "cloudAccount",
  "cloud_account",
  "hostedUploader",
  "hosted_uploader",
  "phoneHome",
  "phone_home",
  "sms",
  "push",
  "tenants",
  "tenantId",
  "tenant_id",
  "accuracy",
  "accuracyPercent",
  "accuracy_percent"
] as const;

function asRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function assertLocalFlagPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized) throw new Error("field flag path is empty");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    throw new Error("field flag path must be a local path, not a URL");
  }
  if (normalized.split("/").includes("..")) {
    throw new Error("field flag path refuses parent traversal");
  }
  if (isHostedTenantLayout(normalized) || /(^|\/)tenants(\/|$)/i.test(normalized)) {
    refuseHostedTenantLayout(normalized);
  }
  if (/workers\.dev|phone-home|phone_home/i.test(normalized)) {
    throw new Error("field flag path refuses a public or phone-home path");
  }
  return path;
}

export function fieldFlagsDirectory(cwd: string, instanceId: string): string {
  return join(cwd, RUNTIME_ISOLATE_ROOT, sanitizeInstanceId(instanceId), "field-flags");
}

function canonicalFieldFlagKind(value: string): FieldFlagKind | null {
  if ((FIELD_FLAG_KINDS as readonly string[]).includes(value)) return value as FieldFlagKind;
  const folded = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return FIELD_FLAG_ALIASES[folded] ?? null;
}

function requireFlagText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${field} must be 1 to ${max} characters`);
  if (text.includes("..") || text.includes("/") || text.includes("\\")) {
    throw new Error(`${field} refuses a path`);
  }
  return text;
}

function requireFlagNote(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const text = value.trim();
  if (!text || text.length > 500) throw new Error(`${field} must be 1 to 500 characters`);
  return text;
}

export function sanitizeFlagId(value: string): string {
  const id = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id) || id.includes("..")) {
    throw new Error("flagId must be 1-80 letters, numbers, dots, underscores, or hyphens");
  }
  return id;
}

function slugFlagId(value: string): string {
  const slug = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
  const prefixed = /^[A-Za-z0-9]/.test(slug) ? slug : `flag-${slug || "row"}`;
  return sanitizeFlagId(prefixed.slice(0, 80));
}

function refuseFlagRecord(record: Record<string, unknown>, label: string): void {
  for (const key of FORBIDDEN_FLAG_KEYS) {
    if (key in record && record[key] != null) {
      throw new Error(`${label} refuses ${key}; no phone-home and no accuracy percent`);
    }
  }
  for (const key of ["webhook", "url", "endpoint"] as const) {
    if (key in record && record[key] != null) {
      throw new Error(`${label} refuses ${key}; no phone-home`);
    }
  }
}

function requireRaisedAt(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} must be a time string`);
  }
  return value.trim();
}

export function parseFieldFlag(raw: unknown, label = "field flag"): FieldFlag {
  const record = asRecord(raw, label);
  refuseFlagRecord(record, label);
  if ("inventedAccuracy" in record && record.inventedAccuracy !== false) {
    throw new Error(`${label} refuses invented accuracy`);
  }
  const kindToken = typeof record.kind === "string" ? record.kind.trim() : "";
  if (!(FIELD_FLAG_KINDS as readonly string[]).includes(kindToken)) {
    throw new Error(`${label} kind must be ${FIELD_FLAG_KINDS.join(", ")}`);
  }
  const severity = record.severity;
  if (severity !== "info" && severity !== "watch" && severity !== "hold") {
    throw new Error(`${label} severity must be info, watch, or hold`);
  }
  const jobId = record.jobId == null || record.jobId === "" ? undefined : requireFlagText(record.jobId, `${label} jobId`, 120);
  const flag: FieldFlag = {
    flagId: sanitizeFlagId(requireFlagText(record.flagId, `${label} flagId`, 80)),
    vanId: requireFlagText(record.vanId, `${label} vanId`, 80),
    kind: kindToken as FieldFlagKind,
    severity,
    note: requireFlagNote(record.note, `${label} note`),
    raisedAt: requireRaisedAt(record.raisedAt, `${label} raisedAt`),
    raisedBy: requireFlagText(record.raisedBy, `${label} raisedBy`, 80),
    inventedAccuracy: false
  };
  if (jobId) flag.jobId = jobId;
  return flag;
}

function unwrapFlagFile(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray((raw as { flags?: unknown }).flags)) {
    return (raw as { flags: unknown[] }).flags;
  }
  return [raw];
}

function dedupeFieldFlags(flags: FieldFlag[]): FieldFlag[] {
  const byId = new Map<string, FieldFlag>();
  for (const flag of flags) byId.set(flag.flagId, flag);
  return [...byId.values()];
}

export interface FieldFlagRead {
  flags: FieldFlag[];
  notices: FieldFlagNotice[];
  readable: boolean;
}

export function readFieldFlagDirectory(dir: string): FieldFlagRead {
  const flags: FieldFlag[] = [];
  const notices: FieldFlagNotice[] = [];
  if (!dir.trim()) return { flags, notices, readable: true };
  try {
    assertLocalFlagPath(dir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notices.push({
      severity: "hold",
      title: "Field flags were not read",
      detail: `${message} No accuracy percent was invented.`
    });
    return { flags, notices, readable: false };
  }
  if (!existsSync(dir)) return { flags, notices, readable: true };
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notices.push({
      severity: "hold",
      title: "Field flags were not read",
      detail: `${dir} could not be listed. ${message} Prior field flags stay until a later read. No accuracy percent was invented.`
    });
    return { flags, notices, readable: false };
  }
  for (const name of names.sort()) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    if (name.includes("..") || name.includes("/") || name.includes("\\")) continue;
    const path = join(dir, name);
    try {
      if (!statSync(path).isFile()) continue;
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      for (const row of unwrapFlagFile(parsed)) flags.push(parseFieldFlag(row, name));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notices.push({
        severity: "hold",
        title: "Field flag file was not applied",
        detail: `${name} was not applied. ${message} No accuracy percent was invented.`
      });
    }
  }
  return { flags: dedupeFieldFlags(flags), notices, readable: true };
}

export function writeFieldFlagFile(dir: string, raw: unknown): { flag: FieldFlag; path: string } {
  const flag = parseFieldFlag(raw, "raised field flag");
  assertLocalFlagPath(dir);
  const path = join(dir, `${flag.flagId}.json`);
  assertLocalFlagPath(path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(flag)}\n`, "utf8");
  return { flag, path };
}

function affirmativeLabel(value: unknown): { yes: boolean; severity?: FieldFlagSeverity } {
  if (value === true || value === 1) return { yes: true };
  if (typeof value !== "string") return { yes: false };
  const token = value.trim().toLowerCase();
  if (token === "true" || token === "yes" || token === "1") return { yes: true };
  if (token === "info" || token === "watch" || token === "hold") return { yes: true, severity: token };
  return { yes: false };
}

function firstOwnString(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function fieldFlagsFromInboundRow(input: {
  raw: Record<string, unknown>;
  jobId: string;
  observedAt?: string;
  now: string;
  raisedBy?: string;
}): { flags: FieldFlag[]; notices: FieldFlagNotice[] } {
  const notices: FieldFlagNotice[] = [];
  if (input.raw.inventedAccuracy === true) {
    notices.push({
      severity: "hold",
      title: "Field flag refused",
      detail: `Job ${input.jobId} set inventedAccuracy true. No flag was raised and no accuracy percent was invented.`
    });
    return { flags: [], notices };
  }
  const flags: FieldFlag[] = [];
  const covered = new Set<FieldFlagKind>();
  const nested = input.raw.fieldFlags;
  const nestedItems = Array.isArray(nested) ? nested : nested && typeof nested === "object" ? [nested] : [];
  if (nestedItems.length) {
    for (const item of nestedItems) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      try {
        const parsed = parseFieldFlag(
          {
            ...row,
            jobId: row.jobId ?? input.jobId,
            raisedAt: row.raisedAt ?? input.observedAt ?? input.now,
            raisedBy: row.raisedBy ?? input.raisedBy ?? "inbound-row",
            note: row.note ?? `Inbound row names ${String(row.kind)}. Not an accuracy percent.`
          },
          `job ${input.jobId} field flag`
        );
        flags.push(parsed);
        covered.add(parsed.kind);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notices.push({
          severity: "hold",
          title: "Field flag refused",
          detail: `Job ${input.jobId} had a field flag that was not applied. ${message}`
        });
      }
    }
  }
  const kinds = new Map<FieldFlagKind, FieldFlagSeverity | undefined>();
  for (const key of Object.keys(input.raw)) {
    const kind = canonicalFieldFlagKind(key);
    if (!kind || covered.has(kind)) continue;
    const mark = affirmativeLabel(input.raw[key]);
    if (!mark.yes) continue;
    kinds.set(kind, mark.severity);
  }
  const labelList = input.raw.labels;
  const labelItems = Array.isArray(labelList) ? labelList : typeof labelList === "string" ? [labelList] : [];
  if (labelItems.length) {
    for (const item of labelItems) {
      if (typeof item !== "string") continue;
      const kind = canonicalFieldFlagKind(item);
      if (!kind || covered.has(kind) || kinds.has(kind)) continue;
      kinds.set(kind, undefined);
    }
  }
  if (!kinds.size) return { flags, notices };
  const vanId = firstOwnString(input.raw, ["vanId", "van_id", "truckId", "truck_id", "vehicleId", "vehicle_id"]);
  if (!vanId) {
    notices.push({
      severity: "info",
      title: "Field flag waiting on a van",
      detail: `Job ${input.jobId} names ${[...kinds.keys()].join(", ")} and does not name a van. No van was invented. Not an accuracy percent.`
    });
    return { flags, notices };
  }
  const raisedAt = firstOwnString(input.raw, ["raisedAt", "raised_at"]) ?? input.observedAt ?? input.now;
  const raisedBy = firstOwnString(input.raw, ["raisedBy", "raised_by"]) ?? input.raisedBy ?? "inbound-row";
  const rowSeverity = input.raw.severity;
  const sharedSeverity =
    rowSeverity === "info" || rowSeverity === "watch" || rowSeverity === "hold" ? rowSeverity : undefined;
  const soleNote = kinds.size === 1 && typeof input.raw.note === "string" ? input.raw.note : undefined;
  for (const [kind, fromValue] of kinds) {
    try {
      flags.push(
        parseFieldFlag(
          {
            flagId: slugFlagId(`inbound-${input.jobId}-${kind}`),
            vanId,
            jobId: input.jobId,
            kind,
            severity: fromValue ?? sharedSeverity ?? FIELD_FLAG_SEVERITY[kind],
            note: soleNote ?? `Inbound row names ${kind}. Not an accuracy percent.`,
            raisedAt,
            raisedBy,
            inventedAccuracy: false
          },
          `job ${input.jobId}`
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notices.push({
        severity: "hold",
        title: "Field flag refused",
        detail: `Job ${input.jobId} names ${kind}. ${message}`
      });
    }
  }
  return { flags, notices };
}

export function fieldFlagAlertDraft(
  flag: FieldFlag,
  label: string
): { id: string; severity: FieldFlagSeverity; title: string; detail: string } {
  const job = flag.jobId ? ` Job ${flag.jobId}.` : "";
  return {
    id: `field-flag:${flag.flagId}`,
    severity: flag.severity,
    title: `Field flag · ${FIELD_FLAG_TITLE[flag.kind]}`,
    detail: `${label} Van ${flag.vanId}.${job} ${flag.note} Raised ${flag.raisedAt} by ${flag.raisedBy}. Explicit field flag. Not an accuracy percent.`
  };
}
