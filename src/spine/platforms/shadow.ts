import { sha256 } from "../../core/hash.js";
import { admitInboundOrThrow, type AdmittedInbound } from "../fraggate-inbound.js";
import type { EvidencePacket } from "../../inherited/evidence-packet.js";
import { PLATFORM_ENTITIES, PLATFORM_SPECS, type PlatformEntity, type PlatformKind } from "./catalog.js";

export interface PlatformShadowRecord {
  kind: PlatformKind;
  entity: PlatformEntity;
  externalId: string;
  receivedAt: string;
  payload: Record<string, unknown>;
  /** "file-drop" or "live-pull". Recorded, never trusted more. */
  via?: "file-drop" | "live-pull";
}

export interface PlatformShadowIngest {
  ok: true;
  live: false;
  write: false;
  hash: string;
  packet: EvidencePacket;
  inbound: AdmittedInbound;
  kind: PlatformKind;
  entity: PlatformEntity;
  externalId: string;
}

/**
 * Platform shadow ingest never writes. Write-back goes only through the approval gate
 * (src/approvals/gate.ts): writes require operator approval; default off.
 */
export const PLATFORM_WRITES_ENABLED = false;

/** Ingest-only client. No compiled POST/PUT/PATCH; approved write-back lives in src/approvals/. */
export interface PlatformShadowClient {
  readonly kind: PlatformKind;
  ingest(record: Omit<PlatformShadowRecord, "kind">): PlatformShadowIngest;
  readonly writes: false;
}

type ForbiddenWriteKey = "post" | "put" | "patch" | "write" | "POST" | "PUT" | "PATCH";
export type NoCompiledPlatformWrite = Extract<keyof PlatformShadowClient, ForbiddenWriteKey> extends never ? true : false;

/** Ingest + hash a platform-shaped record via FragGate under its own sourceKind. Read-only. MEDIUM, unverified. */
export function ingestPlatformShadow(record: PlatformShadowRecord): PlatformShadowIngest {
  const spec = PLATFORM_SPECS[record.kind];
  if (!spec) throw new Error(`unknown platform inbound class: ${String(record.kind)}`);
  if (!(PLATFORM_ENTITIES as readonly string[]).includes(record.entity)) {
    throw new Error(`unknown ${spec.label} shadow entity: ${String(record.entity)}`);
  }
  if (!record.externalId?.trim()) throw new Error(`${spec.label} shadow ingest requires externalId`);
  const hash = sha256({ kind: record.kind, entity: record.entity, externalId: record.externalId, payload: record.payload });
  const inbound = admitInboundOrThrow({
    sourceKind: record.kind,
    sourceId: `${spec.idPrefix}:${record.entity}:${record.externalId}`,
    receivedAt: record.receivedAt,
    body: {
      entity: record.entity,
      externalId: record.externalId,
      platform: record.kind,
      via: record.via ?? "file-drop",
      payload: record.payload,
      shadowHash: hash
    },
    tags: [`${record.kind}-shadow`, "read-only", `via:${record.via ?? "file-drop"}`],
    claims: [`${spec.idPrefix}:${record.entity}`],
    trust: "MEDIUM"
  });
  return {
    ok: true,
    live: false,
    write: false,
    hash,
    packet: inbound.packet,
    inbound,
    kind: record.kind,
    entity: record.entity,
    externalId: record.externalId
  };
}

export function openPlatformShadowClient(kind: PlatformKind): PlatformShadowClient {
  return { kind, ingest: (record) => ingestPlatformShadow({ ...record, kind }), writes: false };
}

export function refusePlatformWrite(kind: PlatformKind, op: string): never {
  throw new Error(
    `live ${PLATFORM_SPECS[kind].label} writes are refused without operator approval (${op}); request the write through the approval gate (src/approvals/gate.ts)`
  );
}

export function mayWritePlatform(_kind: PlatformKind): false {
  return PLATFORM_WRITES_ENABLED;
}
