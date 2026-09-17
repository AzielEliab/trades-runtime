import {
  isHighConfidenceUnsupported,
  normalizeConfidence,
  type ConfidenceSeparation,
  type VerificationStatus
} from "../core/confidence.js";

export const PROPERTY_SOURCE_KINDS = [
  "licensed-market-api",
  "approved-property-data",
  "county-assessor",
  "permit-record",
  "customer-document",
  "company-service-history",
  "field-observation",
  "public-authorized"
] as const;

export type PropertySourceKind = (typeof PROPERTY_SOURCE_KINDS)[number];

/** Architecture must not depend on unauthorized scraping. */
export const FORBIDDEN_SOURCE_KINDS = ["unauthorized-scrape"] as const;
export type ForbiddenSourceKind = (typeof FORBIDDEN_SOURCE_KINDS)[number];

export const PROPERTY_LIFECYCLE = [
  "baseline",
  "condition",
  "proposed",
  "approved",
  "in-progress",
  "completed",
  "verified-state",
  "value-effect",
  "trajectory"
] as const;

export type PropertyLifecycleState = (typeof PROPERTY_LIFECYCLE)[number];

export interface PropertyFact {
  claim: string;
  sourceKind: PropertySourceKind;
  sourceId: string;
  observedAt: string;
  retrievedAt: string;
  freshnessDays: number;
  confidence: ConfidenceSeparation;
  conflicts: string[];
  corroboratedByFieldOrAuthority: boolean;
}

export interface PropertyStructure {
  yearBuilt?: number;
  squareFootage?: number;
  lotSize?: number;
  propertyType?: string;
  stories?: number;
  foundation?: "basement" | "crawlspace" | "slab" | "unknown";
  garage?: boolean;
  additions?: string[];
}

export interface PropertyMarketHistory {
  priorSales: Array<{ at: string; price: number }>;
  listingHistory: Array<{ at: string; listPrice: number }>;
  assessedValue?: number;
  comparableIds: string[];
}

export interface PropertyDocuments {
  photoIds: string[];
  permitIds: string[];
  disclosureIds: string[];
}

export interface TradeContext {
  hvacAgeYears?: number;
  plumbingAgeYears?: number;
  electricalAgeYears?: number;
  knownMaterials: string[];
  priorDiagnoses: string[];
  warranties: string[];
}

export interface PropertyRecord {
  propertyId: string;
  lifecycle: PropertyLifecycleState;
  structure: PropertyStructure;
  marketHistory: PropertyMarketHistory;
  documents: PropertyDocuments;
  tradeContext: TradeContext;
  facts: PropertyFact[];
}

export function ingestSourceKind(kind: PropertySourceKind | ForbiddenSourceKind): PropertySourceKind {
  if (kind === "unauthorized-scrape") {
    throw new Error("architecture must not depend on unauthorized scraping");
  }
  return kind;
}

export function createPropertyRecord(propertyId: string): PropertyRecord {
  return {
    propertyId,
    lifecycle: "baseline",
    structure: {},
    marketHistory: { priorSales: [], listingHistory: [], comparableIds: [] },
    documents: { photoIds: [], permitIds: [], disclosureIds: [] },
    tradeContext: { knownMaterials: [], priorDiagnoses: [], warranties: [] },
    facts: []
  };
}

export function advanceLifecycle(record: PropertyRecord): PropertyRecord {
  const i = PROPERTY_LIFECYCLE.indexOf(record.lifecycle);
  if (i < 0 || i === PROPERTY_LIFECYCLE.length - 1) return record;
  return { ...record, lifecycle: PROPERTY_LIFECYCLE[i + 1]! };
}

export function attachFact(record: PropertyRecord, fact: PropertyFact): PropertyRecord {
  ingestSourceKind(fact.sourceKind);
  return { ...record, facts: [...record.facts, { ...fact, confidence: normalizeConfidence(fact.confidence) }] };
}

/** Public/market data is a prior, not automatic truth, until corroborated. */
export function marketDataIsAutomaticTruth(): false {
  return false;
}

export function mayTreatAsVerifiedPropertyFact(fact: PropertyFact): boolean {
  const confidence = normalizeConfidence(fact.confidence);
  if (isHighConfidenceUnsupported(confidence)) return false;
  return (
    fact.corroboratedByFieldOrAuthority &&
    confidence.verificationStatus === "VERIFIED" &&
    fact.conflicts.length === 0
  );
}

export function asPriorNotTruth(fact: PropertyFact): { role: "prior"; automaticTruth: false; verificationStatus: VerificationStatus } {
  return {
    role: "prior",
    automaticTruth: false,
    verificationStatus: fact.confidence.verificationStatus
  };
}
