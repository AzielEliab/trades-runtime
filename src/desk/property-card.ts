import { mayTreatAsVerifiedPropertyFact, type PropertySourceKind } from "../domain/property-record.js";
import { attachJobToAddress, type FieldJob } from "../domain/property-jobs.js";

/**
 * Property card for a desk job.
 * Company service history is the only fact this desk can attach.
 * Zillow, Redfin, and a county assessor are not connected. No scrape. No invented listing numbers.
 */

const KNOWN_TRADES = ["hvac", "plumbing", "electrical", "sewer", "cross-trades"] as const;
type KnownTrade = (typeof KNOWN_TRADES)[number];

const LISTING_SOURCE_KINDS = new Set<PropertySourceKind>([
  "county-assessor",
  "licensed-market-api",
  "approved-property-data",
  "public-authorized"
]);

export interface PublicListingFact {
  claim: string;
  sourceKind: PropertySourceKind;
  sourceId: string;
}

export interface PropertyCard {
  jobId: string;
  propertyId: string | null;
  serviceAddress: string | null;
  /** Company job address when the export or the operator named one. Not a listing site. */
  addressSource: "company-service-history" | "none";
  lane: string | null;
  lifecycle: string | null;
  verifiedPropertyFact: boolean;
  companyFacts: string[];
  publicListingFacts: PublicListingFact[];
  zillowConnected: false;
  redfinConnected: false;
  assessorConnected: boolean;
  permittedListingFeedWired: false;
  livePull: false;
  scraped: false;
  note: string;
}

const LISTING_NOTE =
  "No permitted listing or assessor feed is connected on this desk. Zillow is not connected. Redfin is not connected. A county assessor is not connected. Public listing facts stay empty. This is not a live pull and not a scrape. Values are not invented.";

function knownTrade(lane: string | null): KnownTrade | null {
  if (!lane) return null;
  const text = lane.trim().toLowerCase();
  return (KNOWN_TRADES as readonly string[]).includes(text) ? (text as KnownTrade) : null;
}

export function emptyListingState(): Pick<
  PropertyCard,
  | "publicListingFacts"
  | "zillowConnected"
  | "redfinConnected"
  | "assessorConnected"
  | "permittedListingFeedWired"
  | "livePull"
  | "scraped"
  | "note"
> {
  return {
    publicListingFacts: [],
    zillowConnected: false,
    redfinConnected: false,
    assessorConnected: false,
    permittedListingFeedWired: false,
    livePull: false,
    scraped: false,
    note: LISTING_NOTE
  };
}

/**
 * Build a card from the job the desk already has.
 * An address becomes company service history. It does not become a Zillow, Redfin, or assessor value.
 */
export function buildPropertyCard(input: {
  jobId: string;
  address: string | null;
  lane: string | null;
  status: string | null;
}): PropertyCard {
  const listing = emptyListingState();
  const address = input.address?.trim() || null;
  if (!address) {
    return {
      jobId: input.jobId,
      propertyId: null,
      serviceAddress: null,
      addressSource: "none",
      lane: input.lane,
      lifecycle: null,
      verifiedPropertyFact: false,
      companyFacts: [],
      ...listing
    };
  }
  const trade = knownTrade(input.lane) ?? "cross-trades";
  const job: FieldJob = {
    jobId: input.jobId,
    address,
    branchId: "local",
    trade,
    status: input.status?.toLowerCase() === "completed" ? "completed" : "open"
  };
  const attached = attachJobToAddress(job);
  const companyFacts = attached.property.facts
    .filter((fact) => fact.sourceKind === "company-service-history")
    .map((fact) => fact.claim);
  const publicListingFacts = attached.property.facts
    .filter((fact) => LISTING_SOURCE_KINDS.has(fact.sourceKind))
    .map((fact) => ({ claim: fact.claim, sourceKind: fact.sourceKind, sourceId: fact.sourceId }));
  const assessorConnected = publicListingFacts.some((fact) => fact.sourceKind === "county-assessor");
  return {
    jobId: input.jobId,
    propertyId: attached.property.propertyId,
    serviceAddress: address,
    addressSource: "company-service-history",
    lane: input.lane,
    lifecycle: attached.property.lifecycle,
    verifiedPropertyFact: attached.property.facts.some(mayTreatAsVerifiedPropertyFact),
    companyFacts,
    publicListingFacts,
    zillowConnected: false,
    redfinConnected: false,
    assessorConnected,
    permittedListingFeedWired: false,
    livePull: false,
    scraped: false,
    note: assessorConnected
      ? "A county-assessor fact was already on this property record. Zillow and Redfin stay disconnected. This desk does not scrape."
      : LISTING_NOTE
  };
}
