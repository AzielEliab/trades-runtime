import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { admitDropInFolder } from "../spine/drop-in.js";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";
import { parseLocalInboundConfig, type LocalInboundConfig } from "../spine/local-inbound-config.js";
import { inboundFolders } from "../desk/snapshot.js";

/**
 * Shared plumbing for the local compliance, revenue, and ops modules.
 * Each module reads one local file, data/runtime/<instanceId>/<module>.json
 * (gitignored), plus whatever admitted inbound rows already carry the data.
 * Writes append to that file and to <module>.jsonl only through the approval gate.
 * Nothing leaves this machine. Numbers come from the files; nothing is invented.
 */

export interface ModuleContext {
  cwd: string;
  instanceId: string;
  now: string;
  config?: LocalInboundConfig;
}

export interface InboundRow {
  peerClass: string;
  profileId: string;
  file: string;
  synthetic: boolean;
  entity: string;
  externalId: string;
  sourceId: string;
  status?: string;
  observedAt?: string;
  technicianId?: string;
  technicianName?: string;
  raw: Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function pickText(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
}

export function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function pickNum(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = num(row[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function listOf(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) {
    if (Array.isArray(value.nodes)) return value.nodes.filter(isRecord);
    return [value];
  }
  return [];
}

export function dayOf(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : undefined;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

export function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function moduleFilePath(cwd: string, instanceId: string, module: string): string {
  const rel = join("data/runtime", sanitizeInstanceId(instanceId), `${module}.json`);
  return isAbsolute(rel) ? rel : join(cwd, rel);
}

export interface ModuleFile {
  path: string;
  present: boolean;
  data: Record<string, unknown>;
  error?: string;
}

export function readModuleFile(cwd: string, instanceId: string, module: string): ModuleFile {
  const path = moduleFilePath(cwd, instanceId, module);
  if (!existsSync(path)) return { path, present: false, data: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(parsed)) throw new Error(`${module}.json must be an object`);
    return { path, present: true, data: parsed };
  } catch (error) {
    return { path, present: false, data: {}, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Upsert one row into a list in the module file (by idKey) and append the change to <module>.jsonl. */
export function upsertModuleRow(args: {
  cwd: string;
  instanceId: string;
  module: string;
  list: string;
  idKey: string;
  row: Record<string, unknown>;
  at: string;
  merge?: boolean;
}): { path: string; created: boolean } {
  const file = readModuleFile(args.cwd, args.instanceId, args.module);
  if (file.error) throw new Error(`refusing to overwrite unreadable ${args.module}.json: ${file.error}`);
  const data = { ...file.data };
  const rows = Array.isArray(data[args.list]) ? (data[args.list] as unknown[]).filter(isRecord) : [];
  const id = text(args.row[args.idKey]);
  if (!id) throw new Error(`${args.idKey} is required`);
  const index = rows.findIndex((row) => text(row[args.idKey]) === id);
  const created = index < 0;
  if (created) rows.push(args.row);
  else rows[index] = args.merge === false ? args.row : { ...rows[index], ...args.row };
  data[args.list] = rows;
  mkdirSync(dirname(file.path), { recursive: true });
  writeFileSync(file.path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  appendFileSync(
    file.path.replace(/\.json$/, ".jsonl"),
    `${JSON.stringify({ at: args.at, list: args.list, id, created, row: args.row })}\n`,
    "utf8"
  );
  return { path: file.path, created };
}

function loadConfig(cwd: string): LocalInboundConfig | undefined {
  const path = join(cwd, "data/inbound/local.json");
  if (!existsSync(path)) return undefined;
  try {
    return parseLocalInboundConfig(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return undefined;
  }
}

/** Admitted inbound rows with their mapped payload. Re-admits through FragGate; never verified. */
export function readInboundRows(ctx: Pick<ModuleContext, "cwd" | "config">): InboundRow[] {
  const config = ctx.config ?? loadConfig(ctx.cwd);
  const out: InboundRow[] = [];
  for (const folder of inboundFolders(ctx.cwd, config)) {
    for (const file of admitDropInFolder(folder.dir, { preferClass: folder.preferClass, keepRaw: true }).files) {
      if (!file.result.ok) continue;
      for (const record of file.result.records) {
        out.push({
          peerClass: file.result.peerClass,
          profileId: file.result.profileId,
          file: file.file,
          synthetic: file.result.synthetic,
          entity: record.entity,
          externalId: record.externalId,
          sourceId: record.sourceId,
          status: record.status,
          observedAt: record.observedAt,
          technicianId: record.technicianId,
          technicianName: record.technicianName,
          raw: record.raw ?? {}
        });
      }
    }
  }
  return out;
}

export interface ModuleSourceNote {
  file: string;
  filePresent: boolean;
  fileError?: string;
  inboundRows: number;
  peers: string[];
  synthetic: boolean;
}

export function sourceNote(file: ModuleFile, rows: InboundRow[]): ModuleSourceNote {
  return {
    file: file.path,
    filePresent: file.present,
    ...(file.error ? { fileError: file.error } : {}),
    inboundRows: rows.length,
    peers: [...new Set(rows.map((row) => row.peerClass))].sort(),
    synthetic: rows.length > 0 && rows.every((row) => row.synthetic)
  };
}
