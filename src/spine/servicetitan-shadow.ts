import { sha256 } from "../core/hash.js";
import { admitInboundOrThrow, type AdmittedInbound } from "./fraggate-inbound.js";
import type { EvidencePacket } from "../inherited/evidence-packet.js";

export const SERVICE_TITAN_SHADOW_ENTITIES = [
  "job",
  "customer",
  "invoice",
  "appointment",
  "technician",
  "pricebook-item"
] as const;

export type ServiceTitanShadowEntity = (typeof SERVICE_TITAN_SHADOW_ENTITIES)[number];

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

/** Ingest + hash a ServiceTitan-shaped record. Read-only. Writes stay refused. */
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

export function refuseServiceTitanWrite(op: string): never {
  throw new Error(`live ServiceTitan writes are refused (${op})`);
}

export function mayWriteServiceTitan(): false {
  return SERVICE_TITAN_WRITES_ENABLED;
}
