import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { sanitizeInstanceId } from "../runtime-isolate.js";
import { isPlatformKind, PLATFORM_ENTITIES, PLATFORM_KINDS, PLATFORM_SPECS, type PlatformEntity, type PlatformKind } from "./catalog.js";
import { CSV_ALIASES, csvEntityForFile, getPath, isRecord, rowsOf, type CollectionMap, type CsvColumnOverrides, type CsvField } from "./map.js";
import { PLATFORM_CSV_COLUMNS, PLATFORM_MAPPINGS } from "./mappings.js";

/**
 * Shop-supplied mapping overrides (TR-PLATFORMS-USER-EXPORTS-2026-10-19).
 * Each shop drops its own export into data/inbound/<kind>/ and, when the built-in
 * mapper misses a column, writes data/runtime/<instanceId>/mappings/<kind>.json.
 * That file is local and gitignored (data/** is ignored). It takes priority over
 * the built-in mapper. Nothing here reaches the network, and no tenant data is committed.
 */

export const CSV_FIELDS: readonly CsvField[] = ["id", "status", "observed", "technicianName", "technicianId", "customerName", "customerId", "jobTotal", "serviceAddress"];

const ENTITIES: readonly PlatformEntity[] = PLATFORM_ENTITIES;

export interface OverrideCollection {
  /** Path to the array in a JSON export, e.g. "calls" or "data.jobs". */
  path: string;
  entity: PlatformEntity;
  id: string[];
  observed?: string[];
  status?: string[];
  /** Normalized key (technicianId, customerName, jobTotal, ...) → the shop's field paths. */
  fields?: Record<string, string[]>;
}

export interface MappingOverride {
  kind: PlatformKind;
  /** JSON exports: tried before the built-in collection maps. */
  collections: CollectionMap[];
  /** CSV exports: lower-cased header names per entity, tried before the built-in aliases. */
  csv: CsvColumnOverrides;
  /** CSV file name (lower-cased substring) → entity, tried before the built-in file-name hints. */
  csvEntity: Array<[string, PlatformEntity]>;
  file: string;
}

export type MappingOverrideSet = Partial<Record<PlatformKind, MappingOverride>>;

export interface OverrideLoad {
  overrides: MappingOverrideSet;
  errors: Array<{ file: string; error: string }>;
}

export function mappingsDir(cwd: string, instanceId: string): string {
  return join(cwd, "data", "runtime", sanitizeInstanceId(instanceId), "mappings");
}

function strings(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()) : [];
}

function isEntity(value: unknown): value is PlatformEntity {
  return typeof value === "string" && (ENTITIES as readonly string[]).includes(value);
}

/** Validate an override document. Unknown keys (such as a starter's notes) are ignored. */
export function parseMappingOverride(kind: PlatformKind, input: unknown, file = ""): MappingOverride {
  if (!isRecord(input)) throw new Error("override must be a JSON object");
  if (input.kind != null && input.kind !== kind) throw new Error(`override kind "${String(input.kind)}" does not match file ${kind}.json`);
  const collections: CollectionMap[] = [];
  for (const [index, raw] of (Array.isArray(input.collections) ? input.collections : []).entries()) {
    if (!isRecord(raw)) throw new Error(`collections[${index}] must be an object`);
    const path = typeof raw.path === "string" ? raw.path.trim() : "";
    if (!path) throw new Error(`collections[${index}].path is required`);
    if (!isEntity(raw.entity)) throw new Error(`collections[${index}].entity must be one of ${ENTITIES.join(", ")}`);
    const id = strings(raw.id);
    if (!id.length) throw new Error(`collections[${index}].id needs at least one field name`);
    const fields: Record<string, string[]> = {};
    if (isRecord(raw.fields)) for (const [key, value] of Object.entries(raw.fields)) if (strings(value).length) fields[key] = strings(value);
    collections.push({ keys: [path], entity: raw.entity, idKeys: id, observedKeys: strings(raw.observed), statusKeys: strings(raw.status), fields });
  }
  const csv: CsvColumnOverrides = {};
  if (isRecord(input.csv)) {
    for (const [entity, columns] of Object.entries(input.csv)) {
      if (!isEntity(entity)) throw new Error(`csv.${entity} is not an entity (${ENTITIES.join(", ")})`);
      if (!isRecord(columns)) throw new Error(`csv.${entity} must be an object`);
      const own: Partial<Record<CsvField, string[]>> = {};
      for (const [field, value] of Object.entries(columns)) {
        if (!(CSV_FIELDS as readonly string[]).includes(field)) throw new Error(`csv.${entity}.${field} is not a field (${CSV_FIELDS.join(", ")})`);
        const headers = strings(value).map((header) => header.toLowerCase());
        if (headers.length) own[field as CsvField] = headers;
      }
      csv[entity] = own;
    }
  }
  const csvEntity: Array<[string, PlatformEntity]> = [];
  if (isRecord(input.csvEntity)) {
    for (const [name, entity] of Object.entries(input.csvEntity)) {
      if (!isEntity(entity)) throw new Error(`csvEntity.${name} must be an entity`);
      csvEntity.push([name.toLowerCase(), entity]);
    }
  }
  return { kind, collections, csv, csvEntity, file };
}

/** Read every data/runtime/<instanceId>/mappings/<kind>.json. A bad file is reported and skipped, never guessed at. */
export function loadMappingOverrides(cwd: string, instanceId: string): OverrideLoad {
  const out: OverrideLoad = { overrides: {}, errors: [] };
  let dir: string;
  try {
    dir = mappingsDir(cwd, instanceId);
  } catch (error) {
    out.errors.push({ file: "", error: (error as Error).message });
    return out;
  }
  for (const kind of PLATFORM_KINDS) {
    const file = join(dir, `${kind}.json`);
    if (!existsSync(file)) continue;
    try {
      out.overrides[kind] = parseMappingOverride(kind, JSON.parse(readFileSync(file, "utf8")) as unknown, file);
    } catch (error) {
      out.errors.push({ file, error: (error as Error).message });
    }
  }
  return out;
}

export function overrideCsvEntity(override: MappingOverride | undefined, fileName: string | undefined): PlatformEntity | undefined {
  const name = (fileName ?? "").toLowerCase();
  return override?.csvEntity.find(([part]) => name.includes(part))?.[1];
}

// ---------- mapping check ----------

export interface MappingCheckField {
  field: string;
  required: boolean;
  matched?: string;
  via?: "override" | "platform" | "generic" | "built-in";
}

export interface MappingCheck {
  kind: PlatformKind;
  file: string;
  format: "csv" | "json";
  entity?: PlatformEntity;
  collection?: string;
  rows: number;
  mappingConfidence: string;
  overrideFile?: string;
  fields: MappingCheckField[];
  matched: string[];
  unmatchedColumns: string[];
  missingRequired: string[];
  starter: Record<string, unknown>;
  notes: string[];
}

/** Fields a record needs before the desk can use it. Everything else is optional. */
export function requiredFields(entity: PlatformEntity): CsvField[] {
  if (entity === "job" || entity === "appointment" || entity === "invoice") return ["id", "observed"];
  return ["id"];
}

const NORMALIZED_FOR: Partial<Record<CsvField, string>> = {
  technicianName: "technicianName",
  technicianId: "technicianId",
  customerName: "customerName",
  customerId: "customerId",
  jobTotal: "jobTotal",
  serviceAddress: "serviceAddress"
};

function csvHeadersAndRows(text: string, parseCsv: (text: string) => { rows: Record<string, string>[] }): { headers: string[]; rows: number } {
  const parsed = parseCsv(text);
  const headers = parsed.rows.length ? Object.keys(parsed.rows[0]!) : [];
  return { headers, rows: parsed.rows.length };
}

function checkCsv(
  kind: PlatformKind,
  file: string,
  text: string,
  override: MappingOverride | undefined,
  parseCsv: (text: string) => { rows: Record<string, string>[] }
): MappingCheck {
  const { headers, rows } = csvHeadersAndRows(text, parseCsv);
  const entity = overrideCsvEntity(override, basename(file)) ?? csvEntityForFile(basename(file));
  const own = override?.csv[entity] ?? {};
  const platform = PLATFORM_CSV_COLUMNS[kind]?.[entity] ?? {};
  const required = requiredFields(entity);
  const used = new Set<string>();
  const fields: MappingCheckField[] = CSV_FIELDS.map((field) => {
    const tiers: Array<[MappingCheckField["via"], string[]]> = [
      ["override", own[field] ?? []],
      ["platform", platform[field] ?? []],
      ["generic", CSV_ALIASES[field]]
    ];
    for (const [via, aliases] of tiers) {
      const hit = aliases.find((alias) => headers.includes(alias));
      if (hit) {
        used.add(hit);
        return { field, required: required.includes(field), matched: hit, via };
      }
    }
    return { field, required: required.includes(field) };
  });
  const unmatchedColumns = headers.filter((header) => !used.has(header));
  const columns: Record<string, string[]> = {};
  for (const row of fields) columns[row.field] = row.matched ? [row.matched] : [];
  return finish(kind, file, "csv", rows, fields, unmatchedColumns, override, {
    entity,
    starter: {
      kind,
      note: "Starter written by npm run mapping:check from this file's headers. Fill the empty lists with your own column names (lower-case), then re-run the check. Local only; gitignored.",
      csv: { [entity]: columns },
      csvEntity: { [basename(file).toLowerCase()]: entity },
      unmatchedColumns
    }
  });
}

function rowKeys(row: Record<string, unknown>, prefix = "", depth = 0): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value) && depth < 2) out.push(...rowKeys(value, path, depth + 1));
    else out.push(path);
  }
  return out;
}

function findCollection(doc: Record<string, unknown>, maps: CollectionMap[]): { path: string; rows: Record<string, unknown>[]; map?: CollectionMap } | undefined {
  for (const map of maps) {
    for (const key of map.keys) {
      const rows = rowsOf(getPath(doc, key));
      if (rows.length) return { path: key, rows, map };
    }
  }
  const scan = (value: Record<string, unknown>, prefix: string, depth: number): { path: string; rows: Record<string, unknown>[] } | undefined => {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const rows = rowsOf(child);
      if (rows.length) return { path, rows };
      if (isRecord(child) && depth < 2) {
        const found = scan(child, path, depth + 1);
        if (found) return found;
      }
    }
    return undefined;
  };
  return Array.isArray(doc.records) ? { path: "records", rows: rowsOf(doc.records) } : scan(doc, "", 0);
}

function checkJson(kind: PlatformKind, file: string, doc: Record<string, unknown>, override: MappingOverride | undefined): MappingCheck {
  const found = findCollection(doc, [...(override?.collections ?? []), ...PLATFORM_MAPPINGS[kind]]);
  if (!found) {
    return finish(kind, file, "json", 0, [], [], override, {
      starter: { kind, note: "No array of records was found in this file.", collections: [] },
      notes: ["No array of records was found. Point collections[].path at the list in your export."]
    });
  }
  const fromOverride = Boolean(found.map && override?.collections.includes(found.map));
  const map = found.map;
  const entity = map?.entity ?? "job";
  const present = new Set(found.rows.slice(0, 25).flatMap((row) => rowKeys(row)));
  const has = (path: string) => found.rows.slice(0, 25).some((row) => getPath(row, path) != null && getPath(row, path) !== "");
  const via: MappingCheckField["via"] = fromOverride ? "override" : "built-in";
  const required = requiredFields(entity);
  const used = new Set<string>();
  const pick = (field: string, paths: string[] | undefined): MappingCheckField => {
    const hit = (paths ?? []).find(has);
    if (hit) used.add(hit);
    return { field, required: (required as string[]).includes(field), ...(hit ? { matched: hit, via } : {}) };
  };
  const fields: MappingCheckField[] = [pick("id", map?.idKeys), pick("observed", map?.observedKeys), pick("status", map?.statusKeys)];
  for (const field of CSV_FIELDS) {
    const key = NORMALIZED_FOR[field];
    if (!key) continue;
    fields.push(pick(field, map?.fields?.[key]));
  }
  const unmatchedColumns = [...present].filter((key) => ![...used].some((path) => path === key || path.startsWith(`${key}.`) || key.startsWith(`${path}.`)));
  const starterFields: Record<string, string[]> = {};
  for (const row of fields.slice(3)) starterFields[row.field] = row.matched ? [row.matched] : [];
  return finish(kind, file, "json", found.rows.length, fields, unmatchedColumns, override, {
    entity,
    collection: found.path,
    starter: {
      kind,
      note: "Starter written by npm run mapping:check from this file. Fill the empty lists with your own field paths, then re-run the check. Local only; gitignored.",
      collections: [
        {
          path: found.path,
          entity,
          id: fields[0]!.matched ? [fields[0]!.matched] : [],
          observed: fields[1]!.matched ? [fields[1]!.matched] : [],
          status: fields[2]!.matched ? [fields[2]!.matched] : [],
          fields: starterFields
        }
      ],
      unmatchedColumns
    },
    notes: map ? [] : ["The built-in mapper does not know this list. Fill id/observed in the starter so the records are admitted."]
  });
}

function finish(
  kind: PlatformKind,
  file: string,
  format: "csv" | "json",
  rows: number,
  fields: MappingCheckField[],
  unmatchedColumns: string[],
  override: MappingOverride | undefined,
  extra: { entity?: PlatformEntity; collection?: string; starter: Record<string, unknown>; notes?: string[] }
): MappingCheck {
  const spec = PLATFORM_SPECS[kind];
  const notes = [...(extra.notes ?? [])];
  if (spec.mappingConfidence !== "documented") notes.push(`${spec.label} mapping is ${spec.mappingConfidence}. Your own export confirms or corrects it.`);
  return {
    kind,
    file: basename(file),
    format,
    ...(extra.entity ? { entity: extra.entity } : {}),
    ...(extra.collection ? { collection: extra.collection } : {}),
    rows,
    mappingConfidence: spec.mappingConfidence,
    ...(override ? { overrideFile: override.file } : {}),
    fields,
    matched: fields.filter((row) => row.matched).map((row) => `${row.field} <- ${row.matched} (${row.via})`),
    unmatchedColumns,
    missingRequired: fields.filter((row) => row.required && !row.matched).map((row) => row.field),
    starter: extra.starter,
    notes
  };
}

/** Check one export file against the built-in mapper plus any local override. Read-only. */
export function checkMappingText(
  kind: PlatformKind,
  fileName: string,
  text: string,
  override: MappingOverride | undefined,
  parseCsv: (text: string) => { rows: Record<string, string>[] }
): MappingCheck {
  if (extname(fileName).toLowerCase() === ".csv") return checkCsv(kind, fileName, text, override, parseCsv);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${basename(fileName)} is not JSON or CSV`);
  }
  const doc = Array.isArray(parsed) ? { records: parsed } : isRecord(parsed) ? parsed : {};
  return checkJson(kind, fileName, doc, override);
}

/** Write the starter next to the override. An existing <kind>.json is never overwritten; the starter goes to <kind>.starter.json. */
export function writeStarterOverride(cwd: string, instanceId: string, check: MappingCheck): string {
  const dir = mappingsDir(cwd, instanceId);
  mkdirSync(dir, { recursive: true });
  const primary = join(dir, `${check.kind}.json`);
  const target = existsSync(primary) ? join(dir, `${check.kind}.starter.json`) : primary;
  writeFileSync(target, `${JSON.stringify(check.starter, null, 2)}\n`, "utf8");
  return target;
}

export function asPlatformKind(value: string): PlatformKind | undefined {
  const lowered = value.trim().toLowerCase();
  return isPlatformKind(lowered) ? lowered : undefined;
}
