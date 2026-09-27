import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { sha256 } from "../core/hash.js";
import { parseCsv } from "../spine/drop-in.js";

/**
 * Local inbound quality report for FragGate peer classes servicetitan and probooks.
 * Files already on this machine are scored. Nothing is pulled from a tenant API.
 * The checklist score is not an accuracy percent. Writes stay refused.
 */

export const INBOUND_QUALITY_PEERS = ["servicetitan", "probooks"] as const;
export type InboundQualityPeer = (typeof INBOUND_QUALITY_PEERS)[number];

export const INBOUND_DEFECTS = [
  "completeness",
  "schema-fit",
  "stale",
  "missing-fields",
  "conflicting-keys",
  "thin-evidence",
  "refused-write"
] as const;
export type InboundDefect = (typeof INBOUND_DEFECTS)[number];

export const SCORE_BANDS = ["0-39", "40-69", "70-100"] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number];

/** A dated field older than this, against the desk clock, is stale. Not an accuracy claim. */
export const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

const READ_CAP_BYTES = 2_000_000;

const SKIP_NAMES = new Set(["local.json", "local.json.example", "readme.md", ".gitkeep", ".ds_store"]);

const ARRAY_KEYS = new Set([
  "jobs",
  "pricebook",
  "books",
  "items",
  "costs",
  "vendors",
  "records",
  "rows",
  "customers",
  "appointments",
  "invoices",
  "equipment",
  "data"
]);

const IGNORED_KEYS = new Set([
  "synthetic",
  "note",
  "source",
  "live_backends",
  "writes",
  "method",
  "httpmethod",
  "verb",
  "write",
  "writeback",
  "livewrite",
  "unparsed",
  "skipped",
  "author"
]);

const ST_KNOWN = new Set([
  "id",
  "jobid",
  "jobnumber",
  "job_id",
  "status",
  "jobstatus",
  "jobtype",
  "job_type",
  "trade",
  "technicianid",
  "technicianname",
  "technician",
  "customerid",
  "customer",
  "businessunit",
  "businessunitid",
  "summary",
  "price",
  "unitprice",
  "iscallback",
  "iswarranty",
  "observedat",
  "updatedat",
  "modifiedat",
  "exportedat",
  "scheduled_at",
  "scheduledat",
  "completedon",
  "description",
  "code",
  "type",
  "tags",
  "locationid",
  "campaign",
  "priority"
]);

const PB_KNOWN = new Set([
  "id",
  "sku",
  "itemid",
  "itemsku",
  "bookid",
  "name",
  "cost",
  "amount",
  "kind",
  "vendorid",
  "book",
  "item",
  "price",
  "description",
  "exportedat",
  "observedat",
  "updatedat",
  "modifiedat",
  "vendor",
  "namehash",
  "code"
]);

const PENALTY: Record<InboundDefect, number> = {
  completeness: 18,
  "schema-fit": 16,
  stale: 12,
  "missing-fields": 18,
  "conflicting-keys": 20,
  "thin-evidence": 16,
  "refused-write": 22
};

export interface InboundQualityFragment {
  sourceKind: InboundQualityPeer;
  sourceId: string;
  file: string;
  fields: Record<string, unknown>;
}

export interface InboundQualityFlag {
  defect: InboundDefect;
  detail: string;
}

export interface ScoredInboundFragment {
  sourceKind: InboundQualityPeer;
  sourceId: string;
  file: string;
  score: number;
  flags: InboundQualityFlag[];
  live_backends: false;
  writes: false;
  refusedWrite: true;
}

export interface InboundQualityReport {
  product: "trades-runtime";
  author: "Aziel Eliab";
  version: string;
  generatedAt: string;
  live_backends: false;
  writes: false;
  phoneHome: false;
  pilot_started: false;
  shadow: true;
  local: true;
  tenantPull: false;
  servicetitanWrite: false;
  probooksWrite: false;
  writeBack: "refused";
  checklistNotAccuracy: true;
  source: "synthetic-demo" | "local-files";
  path: string;
  textPath: string;
  auditPath: string;
  written: boolean;
  digest: string;
  note: string;
  fragmentCount: number;
  meanScore: number | null;
  volumeBySourceKind: { sourceKind: InboundQualityPeer; count: number }[];
  scoreDistribution: { band: ScoreBand; count: number }[];
  topDefects: { defect: InboundDefect; count: number }[];
  fragments: ScoredInboundFragment[];
  humanReport: string;
}

export interface PeerQualityFolder {
  dir: string;
  sourceKind: InboundQualityPeer;
}

/** In-repo fragments for the empty-folder desk. A fixture, not a company export and not a tenant pull. */
export const SYNTHETIC_INBOUND_FRAGMENTS: readonly InboundQualityFragment[] = [
  {
    sourceKind: "servicetitan",
    sourceId: "syn-st-complete",
    file: "synthetic-demo",
    fields: {
      id: "SYN-ST-1",
      status: "Completed",
      jobType: "no cool",
      technicianId: "tech-maya",
      customerId: "SYN-CUST-1",
      trade: "hvac",
      summary: "Synthetic no-cool diagnostic",
      observedAt: "2026-09-25T15:00:00Z"
    }
  },
  {
    sourceKind: "servicetitan",
    sourceId: "syn-st-missing",
    file: "synthetic-demo",
    fields: {
      id: "SYN-ST-2",
      summary: "Synthetic row with no status and no clock"
    }
  },
  {
    sourceKind: "servicetitan",
    sourceId: "syn-st-conflict",
    file: "synthetic-demo",
    fields: {
      id: "SYN-ST-A",
      jobId: "SYN-ST-B",
      status: "Completed",
      jobStatus: "Canceled",
      jobType: "drain",
      technicianId: "tech-luis",
      customerId: "SYN-CUST-2",
      observedAt: "2026-09-26T12:00:00Z"
    }
  },
  {
    sourceKind: "servicetitan",
    sourceId: "syn-st-stale",
    file: "synthetic-demo",
    fields: {
      id: "SYN-ST-4",
      status: "Completed",
      jobType: "panel",
      technicianId: "tech-andre",
      customerId: "SYN-CUST-3",
      summary: "Synthetic stale clock",
      observedAt: "2025-01-01T00:00:00Z"
    }
  },
  {
    sourceKind: "servicetitan",
    sourceId: "syn-st-thin",
    file: "synthetic-demo",
    fields: { id: "SYN-ST-5" }
  },
  {
    sourceKind: "servicetitan",
    sourceId: "syn-st-write",
    file: "synthetic-demo",
    fields: {
      id: "SYN-ST-6",
      status: "Completed",
      jobType: "sewer",
      technicianId: "tech-sam",
      customerId: "SYN-CUST-4",
      observedAt: "2026-09-26T12:00:00Z",
      method: "POST"
    }
  },
  {
    sourceKind: "servicetitan",
    sourceId: "syn-st-schema",
    file: "synthetic-demo",
    fields: {
      id: "SYN-ST-7",
      status: "Completed",
      jobType: "outlet",
      observedAt: "2026-09-24T12:00:00Z",
      zebra: 1,
      quasar: 2,
      nimbus: 3,
      orbit: 4,
      plume: 5
    }
  },
  {
    sourceKind: "probooks",
    sourceId: "syn-pb-complete",
    file: "synthetic-demo",
    fields: {
      id: "SYN-PB-1",
      sku: "SKU-SYN-1",
      cost: 72.5,
      bookId: "SYN-PB-BOOK",
      name: "Synthetic condenser fan motor",
      observedAt: "2026-09-25T15:00:00Z"
    }
  },
  {
    sourceKind: "probooks",
    sourceId: "syn-pb-missing",
    file: "synthetic-demo",
    fields: { id: "SYN-PB-2" }
  },
  {
    sourceKind: "probooks",
    sourceId: "syn-pb-conflict",
    file: "synthetic-demo",
    fields: {
      id: "SYN-PB-3",
      sku: "SKU-SYN-2",
      name: "Synthetic capacitor",
      bookId: "SYN-PB-BOOK",
      cost: 10,
      amount: 14,
      observedAt: "2026-09-24T12:00:00Z"
    }
  },
  {
    sourceKind: "probooks",
    sourceId: "syn-pb-schema",
    file: "synthetic-demo",
    fields: {
      id: "SYN-PB-4",
      sku: "SKU-SYN-3",
      cost: 5,
      name: "Synthetic widget",
      bookId: "SYN-PB-BOOK",
      observedAt: "2026-09-24T12:00:00Z",
      zebra: 1,
      quasar: 2,
      nimbus: 3,
      orbit: 4,
      plume: 5,
      cedar: 6,
      flint: 7
    }
  },
  {
    sourceKind: "probooks",
    sourceId: "syn-pb-empty",
    file: "synthetic-demo",
    fields: { note: "synthetic shell with no identity" }
  },
  {
    sourceKind: "probooks",
    sourceId: "syn-pb-write",
    file: "synthetic-demo",
    fields: {
      id: "SYN-PB-5",
      sku: "SKU-SYN-4",
      name: "Synthetic valve",
      bookId: "SYN-PB-BOOK",
      cost: 8,
      observedAt: "2026-09-24T12:00:00Z",
      method: "PUT"
    }
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function present(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return false;
}

function lookup(row: Record<string, unknown>, names: string[]): unknown {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(key.toLowerCase())) return value;
  }
  return undefined;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function numberOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function assertLocalQualityPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === "data/tenants" || normalized.startsWith("data/tenants/") || normalized.includes("/tenants/")) {
    throw new Error("hosted inbound layout is refused; the quality report stays on this machine");
  }
  return filePath;
}

function sanitizeInstanceId(instanceId: string): string {
  const id = instanceId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!id || id === "shared" || id === "hosted" || id === "tenants") {
    throw new Error("inbound quality requires a local instance id (not shared/hosted/tenants)");
  }
  return id;
}

export function defaultInboundQualityPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalQualityPath(join(root, sanitizeInstanceId(instanceId), "inbound-quality.json"));
}

export function defaultInboundQualityTextPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalQualityPath(join(root, sanitizeInstanceId(instanceId), "inbound-quality.txt"));
}

export function defaultInboundQualityAuditPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalQualityPath(join(root, sanitizeInstanceId(instanceId), "inbound-quality.jsonl"));
}

function bandFor(score: number): ScoreBand {
  if (score < 40) return "0-39";
  if (score < 70) return "40-69";
  return "70-100";
}

function parseTime(value: unknown): number | null {
  const text = textOf(value);
  if (!text) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at : null;
}

function writeAttempt(row: Record<string, unknown>): boolean {
  const method = textOf(lookup(row, ["method", "httpMethod", "verb"])).toUpperCase();
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") return true;
  const write = lookup(row, ["write", "writeBack", "liveWrite"]);
  return write === true || textOf(write).toLowerCase() === "true";
}

function knownSet(sourceKind: InboundQualityPeer): Set<string> {
  return sourceKind === "servicetitan" ? ST_KNOWN : PB_KNOWN;
}

export function scoreInboundFragment(fragment: InboundQualityFragment, now: string): ScoredInboundFragment {
  const flags: InboundQualityFlag[] = [];
  const fields = fragment.fields;
  if (fields.unparsed === true || fields.skipped === "too-large") {
    flags.push({
      defect: "schema-fit",
      detail:
        fields.unparsed === true
          ? "Local file did not parse as JSON or CSV on this machine."
          : "Local file is over the read cap and was not pulled into the report."
    });
    flags.push({
      defect: "completeness",
      detail: "No fragment fields could be read."
    });
    flags.push({
      defect: "missing-fields",
      detail: "Required fields stay missing because the file was not read."
    });
    return {
      sourceKind: fragment.sourceKind,
      sourceId: fragment.sourceId,
      file: fragment.file,
      score: 20,
      flags,
      live_backends: false,
      writes: false,
      refusedWrite: true
    };
  }

  const identity = lookup(fields, ["id", "jobId", "jobNumber", "job_id", "sku", "itemId", "bookId", "name"]);
  if (!present(identity)) {
    flags.push({ defect: "completeness", detail: "No id, job number, sku, book, or name on the fragment." });
  }

  let known = 0;
  let unknown = 0;
  const allowed = knownSet(fragment.sourceKind);
  for (const key of Object.keys(fields)) {
    const lower = key.toLowerCase();
    if (IGNORED_KEYS.has(lower)) continue;
    if (!present(fields[key])) continue;
    if (allowed.has(lower)) known += 1;
    else unknown += 1;
  }
  if (unknown > known) {
    flags.push({
      defect: "schema-fit",
      detail: `${unknown} unrecognized keys and ${known} recognized keys for ${fragment.sourceKind}.`
    });
  }

  const missing: string[] = [];
  if (fragment.sourceKind === "servicetitan") {
    if (!present(lookup(fields, ["status", "jobStatus", "jobType", "summary"]))) missing.push("status or job type");
    const time = lookup(fields, ["observedAt", "updatedAt", "modifiedAt", "exportedAt", "scheduled_at", "scheduledAt", "completedOn"]);
    if (!present(time)) missing.push("observed time");
    else if (parseTime(time) == null) missing.push("a readable observed time");
  } else {
    const itemLike = present(lookup(fields, ["sku", "itemId", "cost", "amount"]));
    if (itemLike) {
      if (!present(lookup(fields, ["sku", "itemId"]))) missing.push("sku");
      if (!present(lookup(fields, ["cost", "amount"]))) missing.push("cost or amount");
    } else if (!present(lookup(fields, ["name"]))) {
      missing.push("name");
    }
  }
  if (missing.length) {
    flags.push({ defect: "missing-fields", detail: `Missing ${missing.join(", ")}.` });
  }

  const timeValue = lookup(fields, ["observedAt", "updatedAt", "modifiedAt", "exportedAt", "scheduled_at", "scheduledAt", "completedOn"]);
  const observed = parseTime(timeValue);
  const clock = Date.parse(now);
  if (observed != null && Number.isFinite(clock) && clock - observed > STALE_AFTER_MS) {
    flags.push({
      defect: "stale",
      detail: "The newest dated field is more than 14 days before the desk clock. This is not an accuracy percent."
    });
  }

  const conflicts: string[] = [];
  const pairs: [string, string][] =
    fragment.sourceKind === "servicetitan"
      ? [
          ["id", "jobId"],
          ["status", "jobStatus"]
        ]
      : [
          ["sku", "itemSku"],
          ["cost", "amount"],
          ["price", "unitPrice"]
        ];
  for (const [leftName, rightName] of pairs) {
    const left = lookup(fields, [leftName]);
    const right = lookup(fields, [rightName]);
    if (!present(left) || !present(right)) continue;
    const leftNumber = numberOf(left);
    const rightNumber = numberOf(right);
    const different =
      leftNumber != null && rightNumber != null ? leftNumber !== rightNumber : textOf(left) !== textOf(right);
    if (different) conflicts.push(`${leftName} and ${rightName}`);
  }
  if (conflicts.length) {
    flags.push({ defect: "conflicting-keys", detail: `Conflicting ${conflicts.join("; ")}.` });
  }

  let substantive = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (IGNORED_KEYS.has(key.toLowerCase())) continue;
    if (present(value)) substantive += 1;
  }
  if (substantive <= 2) {
    flags.push({
      defect: "thin-evidence",
      detail: `${substantive} filled field${substantive === 1 ? "" : "s"} on the fragment. Thin evidence is not filled in.`
    });
  }

  if (writeAttempt(fields)) {
    flags.push({
      defect: "refused-write",
      detail: "Fragment asked for a write. This report refuses it. No ServiceTitan or ProBooks mutation is sent."
    });
  }

  const score = Math.max(0, 100 - flags.reduce((sum, flag) => sum + PENALTY[flag.defect], 0));
  return {
    sourceKind: fragment.sourceKind,
    sourceId: fragment.sourceId,
    file: fragment.file,
    score,
    flags,
    live_backends: false,
    writes: false,
    refusedWrite: true
  };
}

function looksLikeRow(row: Record<string, unknown>): boolean {
  return present(lookup(row, ["id", "sku", "jobNumber", "jobId", "itemId", "bookId", "status", "name"]));
}

function collectRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  const nested: Record<string, unknown>[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (!ARRAY_KEYS.has(key.toLowerCase()) || !Array.isArray(child)) continue;
    for (const item of child) {
      if (isRecord(item)) nested.push(item);
    }
  }
  if (nested.length) return nested;
  if (looksLikeRow(value)) return [value];
  return [];
}

function fragmentId(sourceKind: InboundQualityPeer, file: string, index: number, row: Record<string, unknown>): string {
  const identity = textOf(lookup(row, ["id", "jobId", "jobNumber", "sku", "itemId", "bookId", "name"]));
  return `${sourceKind}:${file}:${index + 1}:${identity || "row"}`;
}

export function readLocalPeerFragments(folders: readonly PeerQualityFolder[]): InboundQualityFragment[] {
  const fragments: InboundQualityFragment[] = [];
  for (const folder of folders) {
    if (folder.sourceKind !== "servicetitan" && folder.sourceKind !== "probooks") continue;
    assertLocalQualityPath(folder.dir);
    if (!existsSync(folder.dir)) continue;
    const names = readdirSync(folder.dir).sort();
    for (const name of names) {
      if (SKIP_NAMES.has(name.toLowerCase())) continue;
      const filePath = join(folder.dir, name);
      const info = statSync(filePath);
      if (!info.isFile()) continue;
      const lower = name.toLowerCase();
      if (!lower.endsWith(".json") && !lower.endsWith(".csv")) continue;
      if (info.size > READ_CAP_BYTES) {
        fragments.push({
          sourceKind: folder.sourceKind,
          sourceId: `${folder.sourceKind}:${name}:skipped`,
          file: name,
          fields: { skipped: "too-large" }
        });
        continue;
      }
      const raw = readFileSync(filePath, "utf8");
      if (lower.endsWith(".csv")) {
        const parsed = parseCsv(raw);
        if (!parsed.rows.length) {
          fragments.push({
            sourceKind: folder.sourceKind,
            sourceId: `${folder.sourceKind}:${name}:unparsed`,
            file: name,
            fields: { unparsed: true }
          });
          continue;
        }
        parsed.rows.forEach((row, index) => {
          fragments.push({
            sourceKind: folder.sourceKind,
            sourceId: fragmentId(folder.sourceKind, name, index, row),
            file: name,
            fields: row
          });
        });
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        fragments.push({
          sourceKind: folder.sourceKind,
          sourceId: `${folder.sourceKind}:${name}:unparsed`,
          file: name,
          fields: { unparsed: true }
        });
        continue;
      }
      const rows = collectRows(parsed);
      if (!rows.length) {
        fragments.push({
          sourceKind: folder.sourceKind,
          sourceId: `${folder.sourceKind}:${name}:unparsed`,
          file: name,
          fields: { unparsed: true }
        });
        continue;
      }
      rows.forEach((row, index) => {
        fragments.push({
          sourceKind: folder.sourceKind,
          sourceId: fragmentId(folder.sourceKind, name, index, row),
          file: name,
          fields: row
        });
      });
    }
  }
  return fragments;
}

function volumeFor(rows: ScoredInboundFragment[]): InboundQualityReport["volumeBySourceKind"] {
  return INBOUND_QUALITY_PEERS.map((sourceKind) => ({
    sourceKind,
    count: rows.filter((row) => row.sourceKind === sourceKind).length
  }));
}

function distributionFor(rows: ScoredInboundFragment[]): InboundQualityReport["scoreDistribution"] {
  return SCORE_BANDS.map((band) => ({
    band,
    count: rows.filter((row) => bandFor(row.score) === band).length
  }));
}

function defectsFor(rows: ScoredInboundFragment[]): InboundQualityReport["topDefects"] {
  const counts = new Map<InboundDefect, number>();
  for (const row of rows) {
    for (const flag of row.flags) counts.set(flag.defect, (counts.get(flag.defect) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([defect, count]) => ({ defect, count }))
    .sort((a, b) => b.count - a.count || a.defect.localeCompare(b.defect));
}

function meanFor(rows: ScoredInboundFragment[]): number | null {
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + row.score, 0);
  return Math.round(total / rows.length);
}

export function formatInboundQualityReport(report: Omit<InboundQualityReport, "humanReport">): string {
  const volume = report.volumeBySourceKind.map((row) => `  ${row.sourceKind} ${row.count}`).join("\n");
  const bands = report.scoreDistribution.map((row) => `  ${row.band} ${row.count}`).join("\n");
  const defects = report.topDefects.length
    ? report.topDefects.map((row) => `  ${row.defect} ${row.count}`).join("\n")
    : "  none";
  const lines = report.fragments.map((row) => {
    const flags = row.flags.length ? row.flags.map((flag) => flag.defect).join(", ") : "none";
    return `  ${row.sourceId} ${row.sourceKind} ${row.score} ${flags}`;
  });
  return [
    "Inbound quality report",
    "Author: Aziel Eliab",
    "Shadow / local. live_backends false. Not a live tenant pull.",
    "Quality score is a local checklist. It is not an accuracy percent.",
    "Writes: refused. ServiceTitan write false. ProBooks write false.",
    `Source: ${report.source}`,
    `Fragments: ${report.fragmentCount}`,
    `Mean checklist score: ${report.meanScore == null ? "none" : report.meanScore}`,
    "Volume by sourceKind:",
    volume,
    "Score distribution:",
    bands,
    "Top defect classes:",
    defects,
    "Rows:",
    lines.length ? lines.join("\n") : "  none",
    report.note
  ].join("\n");
}

function digestFor(source: InboundQualityReport["source"], rows: ScoredInboundFragment[]): string {
  return sha256({
    source,
    rows: rows.map((row) => ({
      sourceKind: row.sourceKind,
      sourceId: row.sourceId,
      score: row.score,
      defects: row.flags.map((flag) => flag.defect)
    }))
  });
}

export function buildInboundQualityReport(args: {
  version: string;
  now: string;
  instanceId: string;
  folders?: readonly PeerQualityFolder[];
  allowSynthetic: boolean;
  root?: string;
}): InboundQualityReport {
  const root = args.root ?? "data/runtime";
  const local = readLocalPeerFragments(args.folders ?? []);
  const useSynthetic = args.allowSynthetic && local.length === 0;
  const source: InboundQualityReport["source"] = useSynthetic ? "synthetic-demo" : "local-files";
  const input = useSynthetic ? [...SYNTHETIC_INBOUND_FRAGMENTS] : local;
  const fragments = input.map((fragment) => scoreInboundFragment(fragment, args.now));
  const meanScore = meanFor(fragments);
  const base = {
    product: "trades-runtime" as const,
    author: "Aziel Eliab" as const,
    version: args.version,
    generatedAt: args.now,
    live_backends: false as const,
    writes: false as const,
    phoneHome: false as const,
    pilot_started: false as const,
    shadow: true as const,
    local: true as const,
    tenantPull: false as const,
    servicetitanWrite: false as const,
    probooksWrite: false as const,
    writeBack: "refused" as const,
    checklistNotAccuracy: true as const,
    source,
    path: defaultInboundQualityPath(args.instanceId, root),
    textPath: defaultInboundQualityTextPath(args.instanceId, root),
    auditPath: defaultInboundQualityAuditPath(args.instanceId, root),
    written: false,
    digest: digestFor(source, fragments),
    note: useSynthetic
      ? "Synthetic demo on this machine. Shadow and local. Not a company export and not a live tenant pull. live_backends false. The checklist score is not an accuracy percent. Writes stay refused."
      : fragments.length
        ? "Local ServiceTitan and ProBooks files already on this machine. Shadow report. Not a live tenant pull. live_backends false. The checklist score is not an accuracy percent. Writes stay refused."
        : "No ServiceTitan or ProBooks fragments on this machine. Empty stays empty. Not a live tenant pull. live_backends false. Writes stay refused.",
    fragmentCount: fragments.length,
    meanScore,
    volumeBySourceKind: volumeFor(fragments),
    scoreDistribution: distributionFor(fragments),
    topDefects: defectsFor(fragments),
    fragments
  };
  return { ...base, humanReport: formatInboundQualityReport(base) };
}

export function persistInboundQuality(args: { cwd: string; report: InboundQualityReport }): InboundQualityReport {
  const jsonPath = assertLocalQualityPath(join(args.cwd, args.report.path));
  const textPath = assertLocalQualityPath(join(args.cwd, args.report.textPath));
  const auditPath = assertLocalQualityPath(join(args.cwd, args.report.auditPath));
  mkdirSync(join(jsonPath, ".."), { recursive: true });
  const stored: InboundQualityReport = { ...args.report, written: true };
  writeFileSync(jsonPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  writeFileSync(textPath, `${stored.humanReport}\n`, "utf8");
  const line = {
    at: stored.generatedAt,
    digest: stored.digest,
    source: stored.source,
    fragmentCount: stored.fragmentCount,
    meanScore: stored.meanScore,
    live_backends: false as const,
    writes: false as const,
    pilot_started: false as const,
    tenantPull: false as const,
    author: "Aziel Eliab" as const
  };
  let append = true;
  if (existsSync(auditPath)) {
    const text = readFileSync(auditPath, "utf8").trim();
    const last = text ? text.split("\n").at(-1) : "";
    if (last) {
      try {
        const parsed = JSON.parse(last) as { digest?: string };
        if (parsed.digest === stored.digest) append = false;
      } catch {
        append = true;
      }
    }
  }
  if (append) appendFileSync(auditPath, `${JSON.stringify(line)}\n`, "utf8");
  return stored;
}

export function inboundQualityBasename(filePath: string): string {
  return basename(filePath);
}
