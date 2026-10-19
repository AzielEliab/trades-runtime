import type { PlatformEntity } from "./catalog.js";

/**
 * Declarative mapper engine shared by every platform inbound class.
 * A collection map names where a vendor's documented objects live in an export
 * (or a live-pull document), which entity they become, and which vendor fields
 * fill the runtime's normalized keys (technicianId, customerId, jobTotal, ...).
 * Normalized keys are only added when the vendor row names the value. Nothing
 * is inferred from prose and missing money stays missing.
 */

export interface PlatformRecord {
  entity: PlatformEntity;
  externalId: string;
  observedAt?: string;
  status?: string;
  raw: Record<string, unknown>;
}

export interface CollectionMap {
  /** Paths to arrays in the document (or, for children, in the parent row). First non-empty wins. */
  keys: string[];
  entity: PlatformEntity;
  idKeys: string[];
  observedKeys?: string[];
  /** Vendor times are Unix seconds (ServiceTrade); numeric observed values become ISO strings. */
  observedEpochSeconds?: boolean;
  statusKeys?: string[];
  /** Normalized key → vendor paths. */
  fields?: Record<string, string[]>;
  /** Normalized keys whose vendor value is in cents (Square, Housecall Pro). */
  cents?: string[];
  /** Only map rows that pass. */
  filter?: (row: Record<string, unknown>) => boolean;
  children?: CollectionMap[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Arrays, GraphQL { nodes } connections, and { edges: [{ node }] } connections all read as row lists. */
export function rowsOf(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) {
    if (Array.isArray(value.nodes)) return value.nodes.filter(isRecord);
    if (Array.isArray(value.edges)) {
      return value.edges.map((edge) => (isRecord(edge) ? edge.node : undefined)).filter(isRecord);
    }
  }
  return [];
}

export function getPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (!isRecord(current)) return undefined;
    if (segment in current) {
      current = current[segment];
      continue;
    }
    const rows = rowsOf(current);
    const index = Number(segment);
    current = rows.length && Number.isInteger(index) ? rows[index] : undefined;
  }
  return current;
}

export function scalarText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function firstPathText(row: Record<string, unknown>, paths: string[] | undefined): string {
  for (const path of paths ?? []) {
    const value = scalarText(getPath(row, path));
    if (value) return value;
  }
  return "";
}

function firstPathValue(row: Record<string, unknown>, paths: string[]): unknown {
  for (const path of paths) {
    const value = getPath(row, path);
    if (value == null || value === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    return value;
  }
  return undefined;
}

function moneyValue(value: unknown, cents: boolean): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(/[$,]/g, "")) : NaN;
  if (!Number.isFinite(number)) return undefined;
  return cents ? Math.round(number) / 100 : number;
}

const MONEY_KEYS = new Set(["jobTotal", "invoiceTotal", "amount", "balance", "agreementPrice"]);

function normalizedRow(row: Record<string, unknown>, map: CollectionMap): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [key, paths] of Object.entries(map.fields ?? {})) {
    if (out[key] != null && out[key] !== "") continue;
    const value = firstPathValue(row, paths);
    if (value === undefined) continue;
    if (MONEY_KEYS.has(key)) {
      const money = moneyValue(value, map.cents?.includes(key) ?? false);
      if (money !== undefined) out[key] = money;
      continue;
    }
    if (isRecord(value) && key !== "serviceAddress") continue;
    out[key] = typeof value === "string" ? value.trim() : value;
  }
  return out;
}

function observedText(row: Record<string, unknown>, map: CollectionMap): string {
  if (map.observedEpochSeconds) {
    for (const path of map.observedKeys ?? []) {
      const value = getPath(row, path);
      if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(value * 1000).toISOString();
      const text = scalarText(value);
      if (text) return /^\d{9,11}$/.test(text) ? new Date(Number(text) * 1000).toISOString() : text;
    }
    return "";
  }
  return firstPathText(row, map.observedKeys);
}

function mapOne(
  rows: Record<string, unknown>[],
  map: CollectionMap,
  out: PlatformRecord[],
  parentId?: string
): void {
  rows.forEach((row, index) => {
    if (map.filter && !map.filter(row)) return;
    const fallback = parentId ? `${parentId}:${map.entity}:${index + 1}` : `row-${map.entity}-${index + 1}`;
    const externalId = firstPathText(row, map.idKeys) || fallback;
    const raw = normalizedRow(row, map);
    out.push({
      entity: map.entity,
      externalId,
      observedAt: observedText(row, map) || undefined,
      status: firstPathText(row, map.statusKeys) || undefined,
      raw
    });
    for (const child of map.children ?? []) {
      for (const key of child.keys) {
        const value = getPath(row, key);
        const childRows = isRecord(value) && !Array.isArray(value.nodes) && !Array.isArray(value.edges) ? [value] : rowsOf(value);
        if (childRows.length) {
          mapOne(childRows, child, out, externalId);
          break;
        }
      }
    }
  });
}

export function mapCollections(doc: Record<string, unknown>, maps: CollectionMap[]): PlatformRecord[] {
  const out: PlatformRecord[] = [];
  for (const map of maps) {
    for (const key of map.keys) {
      const rows = rowsOf(getPath(doc, key));
      if (rows.length) {
        mapOne(rows, map, out);
        break;
      }
    }
  }
  return dedupe(out);
}

/** A customer named on a job and again in the customer list is one customer record. Last write wins only for empty raw. */
function dedupe(records: PlatformRecord[]): PlatformRecord[] {
  const seen = new Map<string, PlatformRecord>();
  for (const record of records) {
    const key = `${record.entity}:${record.externalId}`;
    const prior = seen.get(key);
    if (!prior || Object.keys(prior.raw).length < Object.keys(record.raw).length) seen.set(key, record);
  }
  return [...seen.values()];
}

/** CSV exports: entity by file name, columns by common header aliases. */
const CSV_ENTITY_HINTS: Array<[RegExp, PlatformEntity]> = [
  [/customer|client|contact/, "customer"],
  [/invoice/, "invoice"],
  [/payment|transaction/, "payment"],
  [/estimate|quote|proposal/, "estimate"],
  [/employee|tech|user|team|staff/, "technician"],
  [/visit|appointment|booking|schedule/, "appointment"],
  [/item|pricebook|product|service-list/, "pricebook"],
  [/equipment|asset/, "equipment"]
];

export function csvEntityForFile(fileName: string | undefined): PlatformEntity {
  const name = (fileName ?? "").toLowerCase().replace(/[_\s.]+/g, "-");
  for (const [pattern, entity] of CSV_ENTITY_HINTS) if (pattern.test(name)) return entity;
  return "job";
}

const CSV_ALIASES: Record<string, string[]> = {
  id: ["id", "job #", "job number", "job_number", "job id", "job_id", "work order", "work order #", "work_order_number", "wo #", "wo number", "work order no", "workorderno", "ticket #", "ticket id", "invoice #", "invoice number", "invoice_id", "estimate #", "quote #", "quote number", "customer id", "client id", "employee id", "transaction id", "payment id", "number"],
  status: ["status", "job status", "work status", "work_status", "invoice status", "quote status"],
  observed: ["date", "scheduled", "scheduled date", "scheduled start", "start", "start date", "visit date", "created", "created at", "issued date", "txn date", "completed"],
  technicianName: ["technician", "tech", "assigned to", "assigned employees", "team member", "visit assigned to", "employee", "employee name", "name"],
  technicianId: ["technician id", "tech id", "employee id", "team member id"],
  customerName: ["customer", "customer name", "client", "client name", "display name", "company"],
  customerId: ["customer id", "client id"],
  jobTotal: ["total", "job total", "invoice total", "amount", "total amount", "grand total"],
  serviceAddress: ["service address", "address", "property address", "job address", "street"]
};

function csvPick(row: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = scalarText(row[alias]);
    if (value) return value;
  }
  return "";
}

export function mapCsvRows(rows: Record<string, unknown>[], fileName: string | undefined): PlatformRecord[] {
  const entity = csvEntityForFile(fileName);
  return rows.map((row, index) => {
    const raw: Record<string, unknown> = { ...row };
    for (const key of ["technicianName", "technicianId", "customerName", "customerId", "serviceAddress"] as const) {
      if (entity === "technician" && key === "technicianName") continue;
      const value = csvPick(row, CSV_ALIASES[key]!);
      if (value && raw[key] == null) raw[key] = value;
    }
    const total = csvPick(row, CSV_ALIASES.jobTotal!);
    if (total) {
      const money = moneyValue(total, false);
      if (money !== undefined) raw[entity === "job" ? "jobTotal" : "amount"] = money;
    }
    return {
      entity,
      externalId: csvPick(row, CSV_ALIASES.id!) || `row-${entity}-${index + 1}`,
      observedAt: csvPick(row, CSV_ALIASES.observed!) || undefined,
      status: csvPick(row, CSV_ALIASES.status!) || undefined,
      raw
    };
  });
}
