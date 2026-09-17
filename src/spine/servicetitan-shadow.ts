import { sha256 } from "../core/hash.js";
import { admitInboundOrThrow, type AdmittedInbound } from "./fraggate-inbound.js";
import type { EvidencePacket } from "../inherited/evidence-packet.js";

export const SERVICE_TITAN_SHADOW_ENTITIES = [
  "job",
  "pricebook",
  "equipment",
  "customer",
  "invoice",
  "appointment",
  "technician",
  "pricebook-item"
] as const;

export type ServiceTitanShadowEntity = (typeof SERVICE_TITAN_SHADOW_ENTITIES)[number];

export const SERVICE_TITAN_WRITE_METHODS = ["POST", "PUT", "PATCH"] as const;
export type ServiceTitanWriteMethod = (typeof SERVICE_TITAN_WRITE_METHODS)[number];

export interface ServiceTitanShadowRecord {
  entity: ServiceTitanShadowEntity;
  stId: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}

export interface ServiceTitanShadowIngest {
  ok: true;
  live: false;
  write: false;
  hash: string;
  packet: EvidencePacket;
  inbound: AdmittedInbound;
  entity: ServiceTitanShadowEntity;
  stId: string;
}

export const SERVICE_TITAN_WRITES_ENABLED = false;

/** Read-only client. Write methods are not part of the compiled surface. */
export interface ServiceTitanShadowClient {
  ingest(record: ServiceTitanShadowRecord): ServiceTitanShadowIngest;
  readonly writes: false;
}

type ForbiddenWriteKey = "post" | "put" | "patch" | "write" | "POST" | "PUT" | "PATCH";
export type NoCompiledStWrite = Extract<keyof ServiceTitanShadowClient, ForbiddenWriteKey> extends never
  ? true
  : false;

/** Ingest + hash a ServiceTitan-shaped record via FragGate. Read-only. */
export function ingestServiceTitanShadow(record: ServiceTitanShadowRecord): ServiceTitanShadowIngest {
  if (!SERVICE_TITAN_SHADOW_ENTITIES.includes(record.entity)) {
    throw new Error(`unknown ServiceTitan shadow entity: ${String(record.entity)}`);
  }
  if (!record.stId?.trim()) {
    throw new Error("ServiceTitan shadow ingest requires stId");
  }

  const hash = sha256({
    entity: record.entity,
    stId: record.stId,
    payload: record.payload
  });

  const inbound = admitInboundOrThrow({
    sourceKind: "servicetitan",
    sourceId: `st:${record.entity}:${record.stId}`,
    receivedAt: record.receivedAt,
    body: {
      entity: record.entity,
      stId: record.stId,
      payload: record.payload,
      shadowHash: hash
    },
    tags: ["servicetitan-shadow", "read-only"],
    claims: [`st:${record.entity}`],
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
    stId: record.stId
  };
}

export function ingestServiceTitanJob(
  stId: string,
  receivedAt: string,
  payload: Record<string, unknown>
): ServiceTitanShadowIngest {
  return ingestServiceTitanShadow({ entity: "job", stId, receivedAt, payload });
}

export function ingestServiceTitanPricebook(
  stId: string,
  receivedAt: string,
  payload: Record<string, unknown>
): ServiceTitanShadowIngest {
  return ingestServiceTitanShadow({ entity: "pricebook", stId, receivedAt, payload });
}

export function ingestServiceTitanEquipment(
  stId: string,
  receivedAt: string,
  payload: Record<string, unknown>
): ServiceTitanShadowIngest {
  return ingestServiceTitanShadow({ entity: "equipment", stId, receivedAt, payload });
}

export function ingestServiceTitanCustomer(
  stId: string,
  receivedAt: string,
  payload: Record<string, unknown>
): ServiceTitanShadowIngest {
  return ingestServiceTitanShadow({ entity: "customer", stId, receivedAt, payload });
}

export function openServiceTitanShadowClient(): ServiceTitanShadowClient {
  return { ingest: ingestServiceTitanShadow, writes: false };
}

export function refuseServiceTitanWrite(op: string): never {
  throw new Error(`live ServiceTitan writes are refused (${op})`);
}

export function refuseServiceTitanWriteMethod(method: ServiceTitanWriteMethod): never {
  throw new Error(`live ServiceTitan writes are refused (${method})`);
}

export function mayWriteServiceTitan(): false {
  return SERVICE_TITAN_WRITES_ENABLED;
}
