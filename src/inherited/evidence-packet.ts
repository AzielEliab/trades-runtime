import { sha256 } from "../core/hash.js";
import type { EvidenceBand } from "../core/confidence.js";

export type EvidenceSourceType =
  | "servicetitan"
  | "probooks"
  | "technician-note"
  | "customer-statement"
  | "manufacturer"
  | "photo"
  | "warehouse"
  | "pricebook"
  | "manager"
  | "sensor"
  | "synthetic";

export interface EvidencePacket {
  sourceId: string;
  sourceType: EvidenceSourceType;
  observedAt?: string;
  receivedAt: string;
  contentHash: string;
  trust: EvidenceBand;
  tags: string[];
  claims: string[];
  body: Record<string, unknown>;
}

export function wrapEvidence(input: Omit<EvidencePacket, "contentHash">): EvidencePacket {
  return {
    ...input,
    contentHash: sha256({
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      body: input.body,
      observedAt: input.observedAt ?? null
    })
  };
}

/** Source trust is metadata, never truth. */
export function trustIsNotTruth(packet: EvidencePacket): boolean {
  return packet.trust !== undefined && packet.contentHash.length === 64;
}
