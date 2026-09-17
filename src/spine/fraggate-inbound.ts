import {
  wrapEvidence,
  type EvidencePacket,
  type EvidenceSourceType
} from "../inherited/evidence-packet.js";
import {
  FORBIDDEN_SOURCE_KINDS,
  PROPERTY_SOURCE_KINDS,
  type PropertySourceKind
} from "../domain/property-record.js";
import type { EvidenceBand, VerificationStatus } from "../core/confidence.js";

/** Authorized inbound kinds. Wrapper admission is not verification. */
export const AUTHORIZED_INBOUND_KINDS = [
  "servicetitan",
  "probooks",
  "technician-note",
  "customer-statement",
  "manufacturer",
  "photo",
  "warehouse",
  "pricebook",
  "manager",
  "sensor",
  "synthetic",
  "operator",
  ...PROPERTY_SOURCE_KINDS
] as const;

export type AuthorizedInboundKind = (typeof AUTHORIZED_INBOUND_KINDS)[number];

/** Aligns with Property Intelligence: no scrape architecture. */
export const REFUSED_INBOUND_KINDS = [
  ...FORBIDDEN_SOURCE_KINDS,
  "scrape",
  "listing-scrape",
  "unauthorized"
] as const;

export type RefusedInboundKind = (typeof REFUSED_INBOUND_KINDS)[number];

export type InboundSourceKind = AuthorizedInboundKind | RefusedInboundKind | (string & {});

export type InboundRefuseCode =
  | "FG-REFUSE-SCRAPE"
  | "FG-REFUSE-UNAUTHORIZED"
  | "FG-REFUSE-UNKNOWN"
  | "FG-REFUSE-EMPTY";

export interface RawInbound {
  sourceKind: InboundSourceKind;
  sourceId: string;
  receivedAt: string;
  observedAt?: string;
  body: Record<string, unknown>;
  claims?: string[];
  tags?: string[];
  trust?: EvidenceBand;
  /** Ignored. Wrapping never verifies. */
  treatAsVerified?: boolean;
}

export interface AdmittedInbound {
  ok: true;
  refused: false;
  packet: EvidencePacket;
  sourceKind: AuthorizedInboundKind;
  verificationStatus: VerificationStatus;
  wrapperIsVerification: false;
  treatAsVerified: false;
}

export interface RefusedInbound {
  ok: false;
  refused: true;
  code: InboundRefuseCode;
  reason: string;
  sourceKind: string;
  wrapperIsVerification: false;
}

export type InboundResult = AdmittedInbound | RefusedInbound;

const AUTHORIZED = new Set<string>(AUTHORIZED_INBOUND_KINDS);
const REFUSED = new Set<string>(REFUSED_INBOUND_KINDS);
const EVIDENCE_TYPES = new Set<string>([
  "servicetitan",
  "probooks",
  "technician-note",
  "customer-statement",
  "manufacturer",
  "photo",
  "warehouse",
  "pricebook",
  "manager",
  "sensor",
  "synthetic",
  "operator",
  "authorized-property"
]);

export function isAuthorizedInboundKind(kind: string): kind is AuthorizedInboundKind {
  return AUTHORIZED.has(kind);
}

export function isRefusedInboundKind(kind: string): kind is RefusedInboundKind {
  return REFUSED.has(kind);
}

/** Wrapping an inbound payload does not verify it. */
export function wrapperIsVerification(_packet?: EvidencePacket): false {
  return false;
}

function mapEvidenceSourceType(kind: AuthorizedInboundKind): EvidenceSourceType {
  if (EVIDENCE_TYPES.has(kind)) return kind as EvidenceSourceType;
  return "authorized-property";
}

function refuseCode(kind: string): InboundRefuseCode {
  if (kind === "unauthorized-scrape" || kind === "scrape" || kind === "listing-scrape") {
    return "FG-REFUSE-SCRAPE";
  }
  if (kind === "unauthorized") return "FG-REFUSE-UNAUTHORIZED";
  return "FG-REFUSE-UNKNOWN";
}

function normalizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(body).sort()) {
    if (body[key] !== undefined) copy[key] = body[key];
  }
  return copy;
}

/**
 * FragGate inbound wall: untrusted input cannot become evidence by wrapping.
 * Produces an EvidencePacket only after source-kind validation and normalization.
 */
export function admitInbound(raw: RawInbound): InboundResult {
  const kind = String(raw.sourceKind ?? "").trim();
  if (!kind || !raw.sourceId?.trim() || !raw.receivedAt?.trim()) {
    return {
      ok: false,
      refused: true,
      code: "FG-REFUSE-EMPTY",
      reason: "inbound requires sourceKind, sourceId, and receivedAt",
      sourceKind: kind,
      wrapperIsVerification: false
    };
  }

  if (isRefusedInboundKind(kind) || kind.includes("scrape")) {
    return {
      ok: false,
      refused: true,
      code: refuseCode(kind),
      reason: "architecture must not depend on unauthorized scraping",
      sourceKind: kind,
      wrapperIsVerification: false
    };
  }

  if (!isAuthorizedInboundKind(kind)) {
    return {
      ok: false,
      refused: true,
      code: refuseCode(kind),
      reason: `unknown inbound source kind: ${kind}`,
      sourceKind: kind,
      wrapperIsVerification: false
    };
  }

  const body = normalizeBody({
    ...raw.body,
    inboundSourceKind: kind
  });

  const packet = wrapEvidence({
    sourceId: raw.sourceId.trim(),
    sourceType: mapEvidenceSourceType(kind),
    observedAt: raw.observedAt,
    receivedAt: raw.receivedAt,
    trust: raw.trust ?? "MEDIUM",
    tags: [...(raw.tags ?? []), "fraggate-inbound", `source-kind:${kind}`],
    claims: raw.claims ?? [],
    body
  });

  return {
    ok: true,
    refused: false,
    packet,
    sourceKind: kind,
    verificationStatus: "UNVERIFIED",
    wrapperIsVerification: wrapperIsVerification(packet),
    treatAsVerified: false
  };
}

export function admitInboundOrThrow(raw: RawInbound): AdmittedInbound {
  const result = admitInbound(raw);
  if (!result.ok) {
    throw new Error(`${result.code}: ${result.reason}`);
  }
  return result;
}

export function inboundPropertyKind(kind: PropertySourceKind): AuthorizedInboundKind {
  return kind;
}
