import { sha256 } from "../core/hash.js";
import { admitInboundOrThrow, type AdmittedInbound } from "./fraggate-inbound.js";
import type { EvidencePacket } from "../inherited/evidence-packet.js";

export const PROBOOKS_SHADOW_ENTITIES = ["book", "item", "cost", "vendor"] as const;

export type ProBooksShadowEntity = (typeof PROBOOKS_SHADOW_ENTITIES)[number];

export const PROBOOKS_WRITE_METHODS = ["POST", "PUT", "PATCH"] as const;
export type ProBooksWriteMethod = (typeof PROBOOKS_WRITE_METHODS)[number];

export interface ProBooksShadowRecord {
  entity: ProBooksShadowEntity;
  pbId: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}

export interface ProBooksShadowIngest {
  ok: true;
  live: false;
  write: false;
  hash: string;
  packet: EvidencePacket;
  inbound: AdmittedInbound;
  entity: ProBooksShadowEntity;
  pbId: string;
}

export const PROBOOKS_WRITES_ENABLED = false;

/** Read-only client. Write methods are not part of the compiled surface. */
export interface ProBooksShadowClient {
  ingest(record: ProBooksShadowRecord): ProBooksShadowIngest;
  readonly writes: false;
}

type ForbiddenWriteKey = "post" | "put" | "patch" | "write" | "POST" | "PUT" | "PATCH";
export type NoCompiledPbWrite = Extract<keyof ProBooksShadowClient, ForbiddenWriteKey> extends never
  ? true
  : false;

/** Ingest + hash a ProBooks-shaped record via FragGate. Read-only. */
export function ingestProBooksShadow(record: ProBooksShadowRecord): ProBooksShadowIngest {
  if (!PROBOOKS_SHADOW_ENTITIES.includes(record.entity)) {
    throw new Error(`unknown ProBooks shadow entity: ${String(record.entity)}`);
  }
  if (!record.pbId?.trim()) {
    throw new Error("ProBooks shadow ingest requires pbId");
  }

  const hash = sha256({
    entity: record.entity,
    pbId: record.pbId,
    payload: record.payload
  });

  const inbound = admitInboundOrThrow({
    sourceKind: "probooks",
    sourceId: `pb:${record.entity}:${record.pbId}`,
    receivedAt: record.receivedAt,
    body: {
      entity: record.entity,
      pbId: record.pbId,
      payload: record.payload,
      shadowHash: hash
    },
    tags: ["probooks-shadow", "read-only"],
    claims: [`pb:${record.entity}`],
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
    pbId: record.pbId
  };
}

export function ingestProBooksBook(
  pbId: string,
  receivedAt: string,
  payload: Record<string, unknown>
): ProBooksShadowIngest {
  return ingestProBooksShadow({ entity: "book", pbId, receivedAt, payload });
}

export function ingestProBooksItem(
  pbId: string,
  receivedAt: string,
  payload: Record<string, unknown>
): ProBooksShadowIngest {
  return ingestProBooksShadow({ entity: "item", pbId, receivedAt, payload });
}

export function ingestProBooksCost(
  pbId: string,
  receivedAt: string,
  payload: Record<string, unknown>
): ProBooksShadowIngest {
  return ingestProBooksShadow({ entity: "cost", pbId, receivedAt, payload });
}

export function ingestProBooksVendor(
  pbId: string,
  receivedAt: string,
  payload: Record<string, unknown>
): ProBooksShadowIngest {
  return ingestProBooksShadow({ entity: "vendor", pbId, receivedAt, payload });
}

export function openProBooksShadowClient(): ProBooksShadowClient {
  return { ingest: ingestProBooksShadow, writes: false };
}

export function refuseProBooksWrite(op: string): never {
  throw new Error(`live ProBooks writes are refused (${op})`);
}

export function refuseProBooksWriteMethod(method: ProBooksWriteMethod): never {
  throw new Error(`live ProBooks writes are refused (${method})`);
}

export function mayWriteProBooks(): false {
  return PROBOOKS_WRITES_ENABLED;
}
