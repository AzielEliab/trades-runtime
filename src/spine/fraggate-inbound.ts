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
import type { OverrideRecord } from "../core/chains.js";

/**
 * First-class BYO inbound classes (TR-BYO-2026-09-17, TR-DESK-2026-09-25).
 * servicetitan and probooks stay named peers. trades-app is the generic field-service class.
 * Wrapper admission is not verification.
 */
export const FIRST_CLASS_SOURCE_KINDS = ["servicetitan", "probooks", "trades-app", "operator-file", "human"] as const;
export type FirstClassSourceKind = (typeof FIRST_CLASS_SOURCE_KINDS)[number];

/** Authorized inbound kinds. Wrapper admission is not verification. */
export const AUTHORIZED_INBOUND_KINDS = [
  ...FIRST_CLASS_SOURCE_KINDS,
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
  "unauthorized",
  "central-dump",
  "hosted-upload"
] as const;

export type RefusedInboundKind = (typeof REFUSED_INBOUND_KINDS)[number];

export type InboundSourceKind = AuthorizedInboundKind | RefusedInboundKind | (string & {});

export type InboundRefuseCode =
  | "FG-REFUSE-SCRAPE"
  | "FG-REFUSE-UNAUTHORIZED"
  | "FG-REFUSE-UNKNOWN"
  | "FG-REFUSE-EMPTY"
  | "FG-REFUSE-HUMAN-ACTOR";

export type TaggedOriginKind = "servicetitan" | "probooks" | "trades-app";

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
  /** Ignored when VERIFIED. Admission never silently promotes. */
  verificationStatus?: VerificationStatus;
  /** operator-file origin tag. Untagged stays LOW. */
  originKind?: string;
  /** Required for sourceKind "human" (manager correction → Chain C). */
  actorId?: string;
  role?: string;
  reason?: string;
}

export interface HumanChainCCorrection {
  actorId: string;
  chain: "C";
  record: OverrideRecord;
}

export interface AdmittedInbound {
  ok: true;
  refused: false;
  packet: EvidencePacket;
  sourceKind: AuthorizedInboundKind;
  verificationStatus: "UNVERIFIED";
  wrapperIsVerification: false;
  treatAsVerified: false;
  live: false;
  write: false;
  originTagged: boolean;
  humanCorrection?: HumanChainCCorrection;
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
const FIRST_CLASS = new Set<string>(FIRST_CLASS_SOURCE_KINDS);
const TAGGED_ORIGINS = new Set<string>(["servicetitan", "probooks", "trades-app"]);
const EVIDENCE_TYPES = new Set<string>([
  "servicetitan",
  "probooks",
  "trades-app",
  "operator-file",
  "human",
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

export function isFirstClassSourceKind(kind: string): kind is FirstClassSourceKind {
  return FIRST_CLASS.has(kind);
}

/** Wrapping an inbound payload does not verify it. */
export function wrapperIsVerification(_packet?: EvidencePacket): false {
  return false;
}

/** Admission never yields VERIFIED. A drop-in file is not truth. */
export function refuseSilentVerifiedPromotion(status: VerificationStatus): status is "UNVERIFIED" {
  return status !== "VERIFIED";
}

function mapEvidenceSourceType(kind: AuthorizedInboundKind): EvidenceSourceType {
  if (EVIDENCE_TYPES.has(kind)) return kind as EvidenceSourceType;
  return "authorized-property";
}

function refuseCode(kind: string): InboundRefuseCode {
  if (
    kind === "unauthorized-scrape" ||
    kind === "scrape" ||
    kind === "listing-scrape" ||
    kind.includes("scrape")
  ) {
    return "FG-REFUSE-SCRAPE";
  }
  if (kind === "unauthorized" || kind === "central-dump" || kind === "hosted-upload") {
    return "FG-REFUSE-UNAUTHORIZED";
  }
  return "FG-REFUSE-UNKNOWN";
}

function normalizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(body).sort()) {
    if (body[key] !== undefined) copy[key] = body[key];
  }
  return copy;
}

function taggedOrigin(originKind: string | undefined): TaggedOriginKind | undefined {
  const kind = String(originKind ?? "").trim();
  if (TAGGED_ORIGINS.has(kind)) return kind as TaggedOriginKind;
  return undefined;
}

function defaultTrust(kind: AuthorizedInboundKind, origin: TaggedOriginKind | undefined): EvidenceBand {
  if (kind === "operator-file") return origin ? "MEDIUM" : "LOW";
  if (kind === "servicetitan" || kind === "probooks" || kind === "trades-app") return "MEDIUM";
  if (kind === "human") return "MEDIUM";
  return "MEDIUM";
}

function resolveTrust(
  kind: AuthorizedInboundKind,
  origin: TaggedOriginKind | undefined,
  requested?: EvidenceBand
): EvidenceBand {
  if (kind === "operator-file" && !origin) return "LOW";
  return requested ?? defaultTrust(kind, origin);
}

function humanCorrection(raw: RawInbound): HumanChainCCorrection {
  const actorId = raw.actorId?.trim() ?? "";
  const record: OverrideRecord = {
    chain: "C",
    recordId: `c:${raw.sourceId.trim()}:${actorId}`,
    at: raw.receivedAt,
    recommendationId: String(raw.body.recommendationId ?? raw.sourceId.trim()),
    actorId,
    role: raw.role?.trim() || "manager",
    reason: raw.reason?.trim() || "manager correction",
    originalAction: String(raw.body.originalAction ?? "uncorrected"),
    replacementAction: String(raw.body.replacementAction ?? "human-correction")
  };
  return { actorId, chain: "C", record };
}

function emptyRefuse(kind: string, reason: string, code: InboundRefuseCode = "FG-REFUSE-EMPTY"): RefusedInbound {
  return {
    ok: false,
    refused: true,
    code,
    reason,
    sourceKind: kind,
    wrapperIsVerification: false
  };
}

/**
 * FragGate inbound wall: untrusted input cannot become evidence by wrapping.
 * Produces an EvidencePacket only after source-kind validation and normalization.
 * Wrapper ≠ verified. Silent promotion to VERIFIED is refused.
 */
export function admitInbound(raw: RawInbound): InboundResult {
  const kind = String(raw.sourceKind ?? "").trim();
  if (!kind || !raw.sourceId?.trim() || !raw.receivedAt?.trim()) {
    return emptyRefuse(kind, "inbound requires sourceKind, sourceId, and receivedAt");
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

  if (kind === "human" && !raw.actorId?.trim()) {
    return emptyRefuse(kind, "human inbound requires actor id for Chain C", "FG-REFUSE-HUMAN-ACTOR");
  }

  const origin = kind === "operator-file" ? taggedOrigin(raw.originKind) : undefined;
  const originTagged =
    kind === "servicetitan" || kind === "probooks" || kind === "trades-app" || Boolean(origin);
  const trust = resolveTrust(kind, origin, raw.trust);
  const correction = kind === "human" ? humanCorrection(raw) : undefined;

  const body = normalizeBody({
    ...raw.body,
    inboundSourceKind: kind,
    ...(origin ? { originKind: origin } : {}),
    ...(correction ? { actorId: correction.actorId } : {})
  });

  const packet = wrapEvidence({
    sourceId: raw.sourceId.trim(),
    sourceType: mapEvidenceSourceType(kind),
    observedAt: raw.observedAt,
    receivedAt: raw.receivedAt,
    trust,
    tags: [
      ...(raw.tags ?? []),
      "fraggate-inbound",
      `source-kind:${kind}`,
      origin ? `origin:${origin}` : undefined,
      correction ? `actor:${correction.actorId}` : undefined
    ].filter((tag): tag is string => Boolean(tag)),
    claims: raw.claims ?? [],
    body
  });

  const verificationStatus = "UNVERIFIED" as const;
  void refuseSilentVerifiedPromotion(raw.verificationStatus ?? "UNVERIFIED");
  void raw.treatAsVerified;

  return {
    ok: true,
    refused: false,
    packet,
    sourceKind: kind,
    verificationStatus,
    wrapperIsVerification: wrapperIsVerification(packet),
    treatAsVerified: false,
    live: false,
    write: false,
    originTagged,
    humanCorrection: correction
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

export function admitHumanCorrection(input: {
  sourceId: string;
  receivedAt: string;
  actorId: string;
  role?: string;
  reason?: string;
  body: Record<string, unknown>;
  claims?: string[];
}): AdmittedInbound {
  return admitInboundOrThrow({
    sourceKind: "human",
    sourceId: input.sourceId,
    receivedAt: input.receivedAt,
    actorId: input.actorId,
    role: input.role,
    reason: input.reason,
    body: input.body,
    claims: input.claims,
    tags: ["human-correction", "chain-c"]
  });
}
