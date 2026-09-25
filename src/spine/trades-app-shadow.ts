import { sha256 } from "../core/hash.js";
import { admitInboundOrThrow, type AdmittedInbound } from "./fraggate-inbound.js";
import type { EvidencePacket } from "../inherited/evidence-packet.js";

/** Field-service shapes a generic trades app can carry. Named ST / ProBooks peers stay on their own clients. */
export const TRADES_APP_ENTITIES = [
  "job",
  "pricebook",
  "customer",
  "appointment",
  "invoice",
  "technician",
  "equipment"
] as const;

export type TradesAppEntity = (typeof TRADES_APP_ENTITIES)[number];

export const TRADES_APP_WRITE_METHODS = ["POST", "PUT", "PATCH"] as const;
export type TradesAppWriteMethod = (typeof TRADES_APP_WRITE_METHODS)[number];

export interface TradesAppShadowRecord {
  entity: TradesAppEntity;
  externalId: string;
  receivedAt: string;
  vendorHint: string;
  profileId: string;
  payload: Record<string, unknown>;
}

export interface TradesAppShadowIngest {
  ok: true;
  live: false;
  write: false;
  hash: string;
  packet: EvidencePacket;
  inbound: AdmittedInbound;
  entity: TradesAppEntity;
  externalId: string;
  vendorHint: string;
  profileId: string;
}

export const TRADES_APP_WRITES_ENABLED = false;

/** Read-only client. Write methods are not part of the compiled surface. */
export interface TradesAppShadowClient {
  ingest(record: TradesAppShadowRecord): TradesAppShadowIngest;
  readonly writes: false;
}

type ForbiddenWriteKey = "post" | "put" | "patch" | "write" | "POST" | "PUT" | "PATCH";
export type NoCompiledTradesAppWrite = Extract<keyof TradesAppShadowClient, ForbiddenWriteKey> extends never
  ? true
  : false;

function token(value: string, fallback: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

/** Ingest + hash a trades-app-shaped record via FragGate. Read-only. MEDIUM, unverified. */
export function ingestTradesAppShadow(record: TradesAppShadowRecord): TradesAppShadowIngest {
  if (!TRADES_APP_ENTITIES.includes(record.entity)) {
    throw new Error(`unknown trades-app shadow entity: ${String(record.entity)}`);
  }
  if (!record.externalId?.trim()) {
    throw new Error("trades-app shadow ingest requires externalId");
  }

  const vendorHint = token(record.vendorHint, "generic");
  const profileId = token(record.profileId, "generic-json");
  const hash = sha256({
    entity: record.entity,
    externalId: record.externalId,
    vendorHint,
    profileId,
    payload: record.payload
  });

  const inbound = admitInboundOrThrow({
    sourceKind: "trades-app",
    sourceId: `ta:${record.entity}:${record.externalId}`,
    receivedAt: record.receivedAt,
    body: {
      entity: record.entity,
      externalId: record.externalId,
      vendorHint,
      profileId,
      payload: record.payload,
      shadowHash: hash
    },
    tags: ["trades-app-shadow", "read-only", `profile:${profileId}`, `vendor:${vendorHint}`],
    claims: [`ta:${record.entity}`],
    trust: "MEDIUM"
  });

  return {
    ok: true,
    live: false,
    write: false,
    hash,
    packet: inbound.packet,
    inbound,
    entity: record.entity,
    externalId: record.externalId,
    vendorHint,
    profileId
  };
}

export function openTradesAppShadowClient(): TradesAppShadowClient {
  return { ingest: ingestTradesAppShadow, writes: false };
}

export function refuseTradesAppWrite(op: string): never {
  throw new Error(`live trades-app writes are refused (${op})`);
}

export function refuseTradesAppWriteMethod(method: TradesAppWriteMethod): never {
  throw new Error(`live trades-app writes are refused (${method})`);
}

export function mayWriteTradesApp(): false {
  return TRADES_APP_WRITES_ENABLED;
}
