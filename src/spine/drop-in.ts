import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { EvidenceBand } from "../core/confidence.js";
import {
  ingestProBooksBook,
  ingestProBooksCost,
  ingestProBooksItem,
  ingestProBooksVendor,
  type ProBooksShadowEntity
} from "./probooks-shadow.js";
import {
  ingestServiceTitanShadow,
  type ServiceTitanShadowEntity
} from "./servicetitan-shadow.js";
import {
  ingestTradesAppShadow,
  TRADES_APP_ENTITIES,
  type TradesAppEntity
} from "./trades-app-shadow.js";

export const DROP_IN_PEER_CLASSES = ["servicetitan", "probooks", "trades-app"] as const;
export type DropInPeerClass = (typeof DROP_IN_PEER_CLASSES)[number];

export const CANONICAL_TRADE_ENTITIES = [
  "job",
  "pricebook",
  "customer",
  "appointment",
  "invoice",
  "technician",
  "equipment",
  "book",
  "item",
  "cost",
  "vendor"
] as const;

export type CanonicalTradeEntity = (typeof CANONICAL_TRADE_ENTITIES)[number];

/** Local desk / drop-in read cap. Larger files stay on disk and are not pulled into the process. */
export const DROP_IN_MAX_BYTES = 2_000_000;

const SKIP_NAMES = new Set(["local.json", "local.json.example", "readme.md", ".gitkeep", ".ds_store"]);

export interface CanonicalTradeRecord {
  entity: CanonicalTradeEntity;
  externalId: string;
  observedAt?: string;
  status?: string;
  raw: Record<string, unknown>;
}

export interface MappingProfile {
  id: string;
  vendorHint: string;
  peerClass: DropInPeerClass;
  sniff(doc: Record<string, unknown>): number;
  map(doc: Record<string, unknown>): CanonicalTradeRecord[];
}

export interface DropInDetection {
  ok: true;
  refused: false;
  profileId: string;
  vendorHint: string;
  peerClass: DropInPeerClass;
  score: number;
}

export interface DropInRefuse {
  ok: false;
  refused: true;
  code: "FG-REFUSE-SCRAPE" | "FG-REFUSE-UNAUTHORIZED" | "FG-REFUSE-UNKNOWN" | "FG-REFUSE-EMPTY";
  reason: string;
  live: false;
  write: false;
}

export interface AdmittedDropRecord {
  entity: string;
  externalId: string;
  sourceId: string;
  packetHash: string;
  shadowHash: string;
  verificationStatus: "UNVERIFIED";
  trust: EvidenceBand;
  live: false;
  write: false;
  wrapperIsVerification: false;
  status?: string;
  observedAt?: string;
}

export interface DropInAdmit {
  ok: true;
  refused: false;
  peerClass: DropInPeerClass;
  profileId: string;
  vendorHint: string;
  synthetic: boolean;
  live: false;
  write: false;
  verificationStatus: "UNVERIFIED";
  wrapperIsVerification: false;
  trust: "MEDIUM";
  records: AdmittedDropRecord[];
}

export type DropInResult = DropInAdmit | DropInRefuse;

export interface DropInFileResult {
  file: string;
  receivedAt: string;
  result: DropInResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function firstText(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
}

function vendorToken(doc: Record<string, unknown>): string {
  const raw = [doc.vendor, doc.app, doc.source, doc.sourceKind, doc.profile, doc.originKind]
    .map((value) => text(value).toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (raw.includes("housecall")) return "housecall-pro";
  if (raw.includes("service-fusion") || raw.includes("service fusion") || raw.includes("servicefusion")) {
    return "service-fusion";
  }
  if (raw.includes("quickbooks-online") || raw.includes("quickbooks online") || /\bqbo\b/.test(raw)) {
    return "quickbooks-online";
  }
  if (raw.includes("quickbooks-desktop") || raw.includes("quickbooks desktop") || /\bqbd\b/.test(raw)) {
    return "quickbooks-desktop";
  }
  if (raw.includes("jobber")) return "jobber";
  if (raw.includes("servicetitan") || raw.includes("service-titan") || raw.includes("service titan")) {
    return "servicetitan";
  }
  if (raw.includes("probooks") || raw.includes("pro-books") || raw.includes("pro books")) return "probooks";
  if (raw.includes("generic-csv")) return "generic-csv";
  return "";
}

function explicitRefuseKind(doc: Record<string, unknown>): string | undefined {
  for (const field of [doc.sourceKind, doc.kind, doc.ingest, doc.vendor, doc.app]) {
    const value = text(field).toLowerCase();
    if (!value) continue;
    if (value.includes("scrape")) return value;
    if (value === "central-dump" || value === "hosted-upload" || value === "unauthorized") return value;
  }
  return undefined;
}

function explicitPeer(doc: Record<string, unknown>): DropInPeerClass | undefined {
  const value = text(doc.sourceKind || doc.peerClass).toLowerCase();
  if (value === "servicetitan" || value === "probooks" || value === "trades-app") return value;
  return undefined;
}

function coerceDoc(input: unknown): Record<string, unknown> | null {
  if (Array.isArray(input)) return { records: input };
  if (isRecord(input)) return input;
  return null;
}

function rowId(row: Record<string, unknown>, keys: string[], fallback: string): string {
  return firstText(row, keys) || fallback;
}

function observedFrom(row: Record<string, unknown>, keys: string[]): string | undefined {
  const value = firstText(row, keys);
  return value || undefined;
}

function mapServiceTitan(doc: Record<string, unknown>): CanonicalTradeRecord[] {
  const out: CanonicalTradeRecord[] = [];
  const jobs = asRecords(doc.jobs);
  jobs.forEach((row, index) => {
    out.push({
      entity: "job",
      externalId: rowId(row, ["id", "stId", "jobId", "jobNumber"], `row-job-${index + 1}`),
      observedAt: observedFrom(row, ["completedOn", "scheduledOn", "start", "createdOn"]),
      status: firstText(row, ["status", "jobStatus"]) || undefined,
      raw: row
    });
  });
  asRecords(doc.pricebook).forEach((row, index) => {
    out.push({
      entity: "pricebook",
      externalId: rowId(row, ["id", "code", "sku"], `row-pricebook-${index + 1}`),
      raw: row
    });
  });
  asRecords(doc.customers).forEach((row, index) => {
    out.push({
      entity: "customer",
      externalId: rowId(row, ["id", "customerId"], `row-customer-${index + 1}`),
      raw: row
    });
  });
  asRecords(doc.appointments).forEach((row, index) => {
    out.push({
      entity: "appointment",
      externalId: rowId(row, ["id", "appointmentId"], `row-appointment-${index + 1}`),
      observedAt: observedFrom(row, ["start", "scheduledOn", "arrivalWindowStart"]),
      status: firstText(row, ["status"]) || undefined,
      raw: row
    });
  });
  asRecords(doc.invoices).forEach((row, index) => {
    out.push({
      entity: "invoice",
      externalId: rowId(row, ["id", "invoiceId", "number"], `row-invoice-${index + 1}`),
      observedAt: observedFrom(row, ["invoiceDate", "date", "txnDate"]),
      raw: row
    });
  });
  asRecords(doc.technicians).forEach((row, index) => {
    out.push({
      entity: "technician",
      externalId: rowId(row, ["id", "technicianId"], `row-technician-${index + 1}`),
      raw: row
    });
  });
  asRecords(doc.equipment).forEach((row, index) => {
    out.push({
      entity: "equipment",
      externalId: rowId(row, ["id", "equipmentId"], `row-equipment-${index + 1}`),
      raw: row
    });
  });
  return out;
}

function mapProBooks(doc: Record<string, unknown>): CanonicalTradeRecord[] {
  const out: CanonicalTradeRecord[] = [];
  asRecords(doc.books).forEach((row, index) => {
    out.push({ entity: "book", externalId: rowId(row, ["id", "bookId"], `row-book-${index + 1}`), raw: row });
  });
  asRecords(doc.items).forEach((row, index) => {
    out.push({ entity: "item", externalId: rowId(row, ["id", "sku", "itemId"], `row-item-${index + 1}`), raw: row });
  });
  asRecords(doc.costs).forEach((row, index) => {
    out.push({ entity: "cost", externalId: rowId(row, ["id", "costId"], `row-cost-${index + 1}`), raw: row });
  });
  asRecords(doc.vendors).forEach((row, index) => {
    out.push({ entity: "vendor", externalId: rowId(row, ["id", "vendorId"], `row-vendor-${index + 1}`), raw: row });
  });
  return out;
}

function genericRows(doc: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ["records", "jobs", "appointments", "customers", "items", "pricebook", "invoices"]) {
    const rows = asRecords(doc[key]);
    if (rows.length) return rows;
  }
  return [];
}

function looksLikeTradeRow(row: Record<string, unknown>): boolean {
  const keys = Object.keys(row).map((key) => key.toLowerCase());
  const interesting = ["job_id", "jobid", "job_number", "customer", "customer_name", "customerid", "status", "scheduled_at", "appointment", "trade", "sku", "price"];
  return interesting.some((key) => keys.includes(key));
}

function mapGenericRows(rows: Record<string, unknown>[]): CanonicalTradeRecord[] {
  return rows.map((row, index) => {
    const jobId = firstText(row, ["job_id", "jobId", "job_number", "jobNumber", "id"]);
    const appointmentId = firstText(row, ["appointment_id", "appointmentId"]);
    const customerId = firstText(row, ["customer_id", "customerId", "customer"]);
    const sku = firstText(row, ["sku", "code", "item_id", "itemId"]);
    let entity: CanonicalTradeEntity = "job";
    let externalId = jobId || `row-${index + 1}`;
    if (!jobId && appointmentId) {
      entity = "appointment";
      externalId = appointmentId;
    } else if (!jobId && !appointmentId && sku) {
      entity = "pricebook";
      externalId = sku;
    } else if (!jobId && !appointmentId && !sku && customerId) {
      entity = "customer";
      externalId = customerId;
    }
    return {
      entity,
      externalId,
      observedAt: observedFrom(row, ["scheduled_at", "scheduledAt", "start", "date", "txnDate", "TxnDate"]),
      status: firstText(row, ["status", "work_status", "jobStatus"]) || undefined,
      raw: row
    };
  });
}

function mapJobber(doc: Record<string, unknown>): CanonicalTradeRecord[] {
  const out: CanonicalTradeRecord[] = [];
  asRecords(doc.jobs).forEach((row, index) => {
    const visit = asRecords(row.visits)[0];
    const client = isRecord(row.client) ? row.client : undefined;
    out.push({
      entity: "job",
      externalId: rowId(row, ["id", "jobNumber"], `row-job-${index + 1}`),
      observedAt: visit ? observedFrom(visit, ["startAt", "start", "completedAt"]) : observedFrom(row, ["startAt", "createdAt"]),
      status: (visit && firstText(visit, ["status"])) || firstText(row, ["status"]) || undefined,
      raw: row
    });
    if (client) {
      out.push({
        entity: "customer",
        externalId: rowId(client, ["id"], `row-customer-${index + 1}`),
        raw: client
      });
    }
    asRecords(row.lineItems).forEach((item, itemIndex) => {
      out.push({
        entity: "pricebook",
        externalId: rowId(item, ["id", "name"], `${rowId(row, ["id"], String(index + 1))}:item:${itemIndex + 1}`),
        raw: item
      });
    });
  });
  return out;
}

function mapHousecall(doc: Record<string, unknown>): CanonicalTradeRecord[] {
  const out: CanonicalTradeRecord[] = [];
  asRecords(doc.jobs).forEach((row, index) => {
    const id = rowId(row, ["id"], `row-job-${index + 1}`);
    const schedule = isRecord(row.schedule) ? row.schedule : undefined;
    const customer = isRecord(row.customer) ? row.customer : undefined;
    out.push({
      entity: "job",
      externalId: id,
      observedAt: schedule ? observedFrom(schedule, ["scheduled_start", "start"]) : undefined,
      status: firstText(row, ["work_status", "status"]) || undefined,
      raw: row
    });
    if (schedule) {
      out.push({
        entity: "appointment",
        externalId: `${id}:appt`,
        observedAt: observedFrom(schedule, ["scheduled_start", "start"]),
        status: firstText(row, ["work_status", "status"]) || undefined,
        raw: schedule
      });
    }
    if (customer) {
      out.push({
        entity: "customer",
        externalId: rowId(customer, ["id"], `${id}:customer`),
        raw: customer
      });
    }
  });
  return out;
}

function mapServiceFusion(doc: Record<string, unknown>): CanonicalTradeRecord[] {
  const out: CanonicalTradeRecord[] = [];
  asRecords(doc.jobs).forEach((row, index) => {
    const id = rowId(row, ["id", "job_number"], `row-job-${index + 1}`);
    out.push({
      entity: "job",
      externalId: id,
      status: firstText(row, ["status"]) || undefined,
      observedAt: observedFrom(row, ["scheduled_at", "start_date", "date"]),
      raw: row
    });
    asRecords(row.techs).forEach((tech, techIndex) => {
      out.push({
        entity: "technician",
        externalId: rowId(tech, ["id"], `${id}:tech:${techIndex + 1}`),
        raw: tech
      });
    });
  });
  return out;
}

function mapQuickBooksOnline(doc: Record<string, unknown>): CanonicalTradeRecord[] {
  const query = isRecord(doc.QueryResponse) ? doc.QueryResponse : doc;
  const out: CanonicalTradeRecord[] = [];
  asRecords(query.Invoice ?? query.invoices).forEach((row, index) => {
    const customerRef = isRecord(row.CustomerRef) ? row.CustomerRef : undefined;
    out.push({
      entity: "invoice",
      externalId: rowId(row, ["Id", "id", "DocNumber"], `row-invoice-${index + 1}`),
      observedAt: observedFrom(row, ["TxnDate", "txnDate", "date"]),
      raw: row
    });
    if (customerRef) {
      out.push({
        entity: "customer",
        externalId: rowId(customerRef, ["value", "id"], `row-customer-${index + 1}`),
        raw: customerRef
      });
    }
  });
  asRecords(query.Item ?? query.items).forEach((row, index) => {
    out.push({
      entity: "pricebook",
      externalId: rowId(row, ["Id", "id", "Name"], `row-item-${index + 1}`),
      raw: row
    });
  });
  asRecords(query.Customer ?? query.customers).forEach((row, index) => {
    out.push({
      entity: "customer",
      externalId: rowId(row, ["Id", "id"], `row-customer-row-${index + 1}`),
      raw: row
    });
  });
  return out;
}

function mapQuickBooksDesktop(doc: Record<string, unknown>): CanonicalTradeRecord[] {
  return asRecords(doc.transactions)
    .filter((row) => text(row.TxnType).toLowerCase() === "invoice" || text(row.Amount) || text(row.amount))
    .map((row, index) => ({
      entity: "invoice" as const,
      externalId: rowId(row, ["RefNumber", "id", "TxnID"], `row-invoice-${index + 1}`),
      observedAt: observedFrom(row, ["Date", "date", "TxnDate"]),
      raw: row
    }));
}

export const MAPPING_PROFILES: MappingProfile[] = [
  {
    id: "servicetitan",
    vendorHint: "servicetitan",
    peerClass: "servicetitan",
    sniff(doc) {
      if (vendorToken(doc) === "servicetitan") return 0.97;
      const jobs = asRecords(doc.jobs);
      const pricebook = asRecords(doc.pricebook);
      if (jobs.some((row) => row.businessUnit != null || row.jobNumber != null || row.stId != null)) return 0.9;
      if (pricebook.some((row) => row.code != null && (row.price != null || row.description != null))) return 0.82;
      if (jobs.length && asRecords(doc.appointments).length) return 0.7;
      return 0;
    },
    map: mapServiceTitan
  },
  {
    id: "probooks",
    vendorHint: "probooks",
    peerClass: "probooks",
    sniff(doc) {
      if (vendorToken(doc) === "probooks") return 0.97;
      const books = asRecords(doc.books);
      const items = asRecords(doc.items);
      const costs = asRecords(doc.costs);
      const vendors = asRecords(doc.vendors);
      if (books.length && (items.length || costs.length || vendors.length)) return 0.92;
      if (items.length && (costs.length || vendors.length)) return 0.84;
      return 0;
    },
    map: mapProBooks
  },
  {
    id: "jobber",
    vendorHint: "jobber",
    peerClass: "trades-app",
    sniff(doc) {
      if (vendorToken(doc) === "jobber") return 0.96;
      if (asRecords(doc.jobs).some((row) => isRecord(row.client) && (row.visits != null || row.lineItems != null))) return 0.9;
      return 0;
    },
    map: mapJobber
  },
  {
    id: "housecall-pro",
    vendorHint: "housecall-pro",
    peerClass: "trades-app",
    sniff(doc) {
      if (vendorToken(doc) === "housecall-pro") return 0.96;
      if (asRecords(doc.jobs).some((row) => row.work_status != null && isRecord(row.customer) && isRecord(row.schedule))) {
        return 0.9;
      }
      return 0;
    },
    map: mapHousecall
  },
  {
    id: "service-fusion",
    vendorHint: "service-fusion",
    peerClass: "trades-app",
    sniff(doc) {
      if (vendorToken(doc) === "service-fusion") return 0.96;
      if (asRecords(doc.jobs).some((row) => row.job_number != null && (row.techs != null || row.customer_name != null))) {
        return 0.88;
      }
      return 0;
    },
    map: mapServiceFusion
  },
  {
    id: "quickbooks-online",
    vendorHint: "quickbooks-online",
    peerClass: "trades-app",
    sniff(doc) {
      if (vendorToken(doc) === "quickbooks-online") return 0.96;
      if (isRecord(doc.QueryResponse)) return 0.9;
      return 0;
    },
    map: mapQuickBooksOnline
  },
  {
    id: "quickbooks-desktop",
    vendorHint: "quickbooks-desktop",
    peerClass: "trades-app",
    sniff(doc) {
      if (vendorToken(doc) === "quickbooks-desktop") return 0.96;
      if (asRecords(doc.transactions).some((row) => row.TxnType != null)) return 0.88;
      return 0;
    },
    map: mapQuickBooksDesktop
  },
  {
    id: "generic-csv",
    vendorHint: "generic-csv",
    peerClass: "trades-app",
    sniff(doc) {
      return vendorToken(doc) === "generic-csv" ? 0.8 : 0;
    },
    map(doc) {
      return mapGenericRows(genericRows(doc));
    }
  },
  {
    id: "generic-json",
    vendorHint: "generic",
    peerClass: "trades-app",
    sniff(doc) {
      const rows = genericRows(doc);
      if (rows.some(looksLikeTradeRow)) return 0.46;
      return 0;
    },
    map(doc) {
      return mapGenericRows(genericRows(doc));
    }
  }
];

function refuse(code: DropInRefuse["code"], reason: string): DropInRefuse {
  return { ok: false, refused: true, code, reason, live: false, write: false };
}

export function detectDropIn(
  input: unknown,
  hint?: { preferClass?: DropInPeerClass }
): DropInDetection | DropInRefuse {
  const doc = coerceDoc(input);
  if (!doc) return refuse("FG-REFUSE-EMPTY", "drop-in document is empty");

  const refusedKind = explicitRefuseKind(doc);
  if (refusedKind) {
    if (refusedKind.includes("scrape")) {
      return refuse("FG-REFUSE-SCRAPE", "architecture must not depend on unauthorized scraping");
    }
    return refuse("FG-REFUSE-UNAUTHORIZED", "central-dump and hosted-upload inbound are refused");
  }

  const scored = MAPPING_PROFILES.map((profile) => ({ profile, score: profile.sniff(doc) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.profile.id.localeCompare(b.profile.id));

  const declared = explicitPeer(doc);
  let picked = scored[0];
  if (declared) {
    const inClass = scored.find((row) => row.profile.peerClass === declared);
    if (inClass) picked = inClass;
    else if (declared === "trades-app") {
      const generic = scored.find((row) => row.profile.id === "generic-json");
      if (generic) picked = generic;
    }
  } else if (hint?.preferClass && scored.length > 1) {
    const preferred = scored.find((row) => row.profile.peerClass === hint.preferClass);
    if (preferred && picked && preferred.score + 0.08 >= picked.score) picked = preferred;
  }

  if (!picked || picked.score < 0.4) {
    return refuse("FG-REFUSE-UNKNOWN", "drop-in could not sniff a field-service, job, pricebook, customer, or appointment shape");
  }

  return {
    ok: true,
    refused: false,
    profileId: picked.profile.id,
    vendorHint: picked.profile.vendorHint,
    peerClass: declared ?? picked.profile.peerClass,
    score: picked.score
  };
}

const ST_ENTITIES = new Set<string>([
  "job",
  "pricebook",
  "equipment",
  "customer",
  "invoice",
  "appointment",
  "technician",
  "pricebook-item"
]);

function isStEntity(entity: string): entity is ServiceTitanShadowEntity {
  return ST_ENTITIES.has(entity);
}

function isPbEntity(entity: string): entity is ProBooksShadowEntity {
  return entity === "book" || entity === "item" || entity === "cost" || entity === "vendor";
}

function isTradesEntity(entity: string): entity is TradesAppEntity {
  return (TRADES_APP_ENTITIES as readonly string[]).includes(entity);
}

function admitRecord(
  record: CanonicalTradeRecord,
  peerClass: DropInPeerClass,
  receivedAt: string,
  profileId: string,
  vendorHint: string
): AdmittedDropRecord {
  if (peerClass === "servicetitan") {
    const entity = isStEntity(record.entity) ? record.entity : "job";
    const ingested = ingestServiceTitanShadow({
      entity,
      stId: record.externalId,
      receivedAt,
      payload: record.raw
    });
    return {
      entity,
      externalId: record.externalId,
      sourceId: ingested.inbound.packet.sourceId,
      packetHash: ingested.packet.contentHash,
      shadowHash: ingested.hash,
      verificationStatus: "UNVERIFIED",
      trust: ingested.inbound.packet.trust,
      live: false,
      write: false,
      wrapperIsVerification: false,
      status: record.status,
      observedAt: record.observedAt
    };
  }

  if (peerClass === "probooks") {
    const entity: ProBooksShadowEntity = isPbEntity(record.entity) ? record.entity : "item";
    const ingested =
      entity === "book"
        ? ingestProBooksBook(record.externalId, receivedAt, record.raw)
        : entity === "cost"
          ? ingestProBooksCost(record.externalId, receivedAt, record.raw)
          : entity === "vendor"
            ? ingestProBooksVendor(record.externalId, receivedAt, record.raw)
            : ingestProBooksItem(record.externalId, receivedAt, record.raw);
    return {
      entity,
      externalId: record.externalId,
      sourceId: ingested.inbound.packet.sourceId,
      packetHash: ingested.packet.contentHash,
      shadowHash: ingested.hash,
      verificationStatus: "UNVERIFIED",
      trust: ingested.inbound.packet.trust,
      live: false,
      write: false,
      wrapperIsVerification: false,
      status: record.status,
      observedAt: record.observedAt
    };
  }

  const entity: TradesAppEntity = isTradesEntity(record.entity) ? record.entity : "job";
  const ingested = ingestTradesAppShadow({
    entity,
    externalId: record.externalId,
    receivedAt,
    vendorHint,
    profileId,
    payload: record.raw
  });
  return {
    entity,
    externalId: record.externalId,
    sourceId: ingested.inbound.packet.sourceId,
    packetHash: ingested.packet.contentHash,
    shadowHash: ingested.hash,
    verificationStatus: "UNVERIFIED",
    trust: ingested.inbound.packet.trust,
    live: false,
    write: false,
    wrapperIsVerification: false,
    status: record.status,
    observedAt: record.observedAt
  };
}

export function admitDropInDocument(
  input: unknown,
  options: { receivedAt: string; preferClass?: DropInPeerClass }
): DropInResult {
  const detected = detectDropIn(input, { preferClass: options.preferClass });
  if (!detected.ok) return detected;
  const doc = coerceDoc(input);
  if (!doc) return refuse("FG-REFUSE-EMPTY", "drop-in document is empty");

  const profile = MAPPING_PROFILES.find((item) => item.id === detected.profileId) ?? MAPPING_PROFILES.find((item) => item.id === "generic-json");
  if (!profile) return refuse("FG-REFUSE-UNKNOWN", "drop-in profile missing");

  const mapped = profile.map(doc);
  if (!mapped.length) return refuse("FG-REFUSE-EMPTY", "drop-in shape matched and contained no records");

  const peerClass = detected.peerClass;
  const records = mapped.map((record) =>
    admitRecord(record, peerClass, options.receivedAt, detected.profileId, detected.vendorHint)
  );

  return {
    ok: true,
    refused: false,
    peerClass,
    profileId: detected.profileId,
    vendorHint: detected.vendorHint,
    synthetic: doc.synthetic === true,
    live: false,
    write: false,
    verificationStatus: "UNVERIFIED",
    wrapperIsVerification: false,
    trust: "MEDIUM",
    records
  };
}

export function parseCsv(text: string): { synthetic: boolean; rows: Record<string, string>[] } {
  const withoutBom = text.replace(/^\uFEFF/, "");
  let synthetic = false;
  const source = withoutBom
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        if (/synthetic\s*:\s*true/i.test(trimmed)) synthetic = true;
        return false;
      }
      return trimmed.length > 0;
    })
    .join("\n");

  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return { synthetic, rows: [] };
  const header = rows[0]!.map((value) => value.trim().toLowerCase());
  const records = rows.slice(1).filter((values) => values.some((value) => value.trim())).map((values) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      if (!key) return;
      record[key] = (values[index] ?? "").trim();
    });
    return record;
  });
  return { synthetic, rows: records };
}

export function admitDropInText(
  text: string,
  options: { receivedAt: string; fileName: string; preferClass?: DropInPeerClass }
): DropInResult {
  const ext = extname(options.fileName).toLowerCase();
  if (ext === ".csv") {
    const parsed = parseCsv(text);
    if (!parsed.rows.length) return refuse("FG-REFUSE-EMPTY", "csv drop-in has no data rows");
    return admitDropInDocument(
      { records: parsed.rows, synthetic: parsed.synthetic, vendor: "generic-csv" },
      options
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return refuse("FG-REFUSE-UNKNOWN", "drop-in file is not JSON or CSV");
  }
  return admitDropInDocument(parsed, options);
}

export function listDropInFiles(dir: string): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => {
      if (name.startsWith(".")) return false;
      if (SKIP_NAMES.has(name.toLowerCase())) return false;
      const ext = extname(name).toLowerCase();
      return ext === ".json" || ext === ".csv";
    })
    .sort()
    .map((name) => join(dir, name));
}

export function admitDropInFile(
  filePath: string,
  options: { receivedAt?: string; preferClass?: DropInPeerClass } = {}
): DropInFileResult {
  const file = basename(filePath);
  let size = 0;
  let mtime = options.receivedAt;
  try {
    const info = statSync(filePath);
    size = info.size;
    mtime = mtime ?? new Date(info.mtimeMs).toISOString();
  } catch {
    return {
      file,
      receivedAt: options.receivedAt ?? new Date(0).toISOString(),
      result: refuse("FG-REFUSE-EMPTY", "drop-in file is missing")
    };
  }
  const receivedAt = mtime ?? new Date(0).toISOString();
  if (size > DROP_IN_MAX_BYTES) {
    return {
      file,
      receivedAt,
      result: refuse("FG-REFUSE-UNKNOWN", `drop-in file exceeds the local read cap (${DROP_IN_MAX_BYTES} bytes)`)
    };
  }
  const text = readFileSync(filePath, "utf8");
  return {
    file,
    receivedAt,
    result: admitDropInText(text, { receivedAt, fileName: file, preferClass: options.preferClass })
  };
}

export function admitDropInFolder(
  dir: string,
  options: { preferClass?: DropInPeerClass; receivedAt?: string } = {}
): { files: DropInFileResult[]; live: false; write: false } {
  const files = listDropInFiles(dir).map((filePath) => admitDropInFile(filePath, options));
  return { files, live: false, write: false };
}
