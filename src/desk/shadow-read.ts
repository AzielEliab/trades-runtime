import { RUNTIME_MANIFEST } from "../manifest.js";
import type { FieldTimeEvent } from "./field-time.js";
import type { JobPriceBoard } from "./job-price.js";
import { buildOperatorSnapshot, type DeskSnapshotOptions, type OperatorSnapshot } from "./snapshot.js";

/**
 * One local read of the operator desk snapshot.
 *
 * The desk page, shadow:field, and shadow:office all use this snapshot.
 * Clock, meal, and drive-time-home rows stay in
 * data/runtime/<instanceId>/field-events.jsonl.
 * Typed part cost, labor, task fees, margin, and locked discounts stay in
 * the job price record the shell already stores.
 * This module does not append a second event log and does not write a provider.
 */

export const SHADOW_DESK_ROLES = ["field", "office"] as const;
export type ShadowDeskRole = (typeof SHADOW_DESK_ROLES)[number];

export interface ShadowDeskProperty {
  publicListingFacts: number;
  zillowConnected: false;
  redfinConnected: false;
  assessorConnected: boolean;
  permittedListingFeedWired: false;
  livePull: false;
  scraped: false;
  note: string;
}

export interface ShadowDeskRead {
  product: "trades-runtime";
  version: string;
  author: "Aziel Eliab";
  surface: "local-shadow-read";
  role: ShadowDeskRole;
  source: "operator-desk-snapshot";
  live_backends: false;
  writes: false;
  vendorWrite: false;
  servicetitanWrite: false;
  jobberWrite: false;
  probooksWrite: false;
  ordersEnabled: false;
  pilot_started: false;
  field_claim: false;
  office_claim: false;
  liveGps: false;
  notField10: true;
  notOffice10: true;
  notCompanyOs: true;
  eventsPath: string;
  events: FieldTimeEvent[];
  jobPrices: JobPriceBoard;
  property: ShadowDeskProperty;
  note: string;
}

const PROPERTY_EMPTY_NOTE =
  "Property listing facts stay empty. No permitted listing or assessor source is connected on this desk. Zillow is not connected. Redfin is not connected. Values are not invented.";

export function isShadowDeskRole(value: string): value is ShadowDeskRole {
  return value === "field" || value === "office";
}

function propertyFromSnapshot(snapshot: OperatorSnapshot): ShadowDeskProperty {
  const facts = snapshot.propertyCards.reduce((sum, card) => sum + card.publicListingFacts.length, 0);
  const assessorConnected = snapshot.propertyCards.some((card) => card.assessorConnected);
  return {
    publicListingFacts: facts,
    zillowConnected: false,
    redfinConnected: false,
    assessorConnected,
    permittedListingFeedWired: false,
    livePull: false,
    scraped: false,
    note:
      facts === 0 && !assessorConnected
        ? PROPERTY_EMPTY_NOTE
        : "Property facts on this read are only the cards already on the operator desk snapshot. This read does not add a listing source."
  };
}

/** Project one role from a snapshot the desk already built. Both roles share the events array and the job price board. */
export function shadowDeskFromSnapshot(role: ShadowDeskRole, snapshot: OperatorSnapshot): ShadowDeskRead {
  const shell = snapshot.fieldShell;
  const jobPrices = snapshot.jobPrices;
  return {
    product: "trades-runtime",
    version: RUNTIME_MANIFEST.version,
    author: "Aziel Eliab",
    surface: "local-shadow-read",
    role,
    source: "operator-desk-snapshot",
    live_backends: shell.live_backends,
    writes: shell.writes,
    vendorWrite: shell.vendorWrite,
    servicetitanWrite: shell.servicetitanWrite,
    jobberWrite: shell.jobberWrite,
    probooksWrite: shell.probooksWrite,
    ordersEnabled: jobPrices.ordersEnabled,
    pilot_started: shell.pilot_started,
    field_claim: shell.field_claim,
    office_claim: shell.office_claim,
    liveGps: shell.liveGps,
    notField10: shell.notField10,
    notOffice10: shell.notOffice10,
    notCompanyOs: shell.notCompanyOs,
    eventsPath: shell.path,
    events: shell.events,
    jobPrices,
    property: propertyFromSnapshot(snapshot),
    note: "The local desk, shadow:field, and shadow:office read this operator desk snapshot. Clock in, Clock out, Start Meal, End Meal, and Drive time home stay in field-events.jsonl. Typed part cost, labor, task fees, margin, and locked discounts stay on the job price record. There is no second event log. This is a local shadow read. It is not a Field 1.0 claim and not Office Softwares 1.0. pilot_started false. live_backends false. Provider writes stay refused. A SupplyHouse number is present only when the stored sheet already has one. This read does not invent a price and does not place an order."
  };
}

/** Field and office views of one snapshot. The events array and job price board are the same objects. */
export function shadowReadsFromSnapshot(snapshot: OperatorSnapshot): { field: ShadowDeskRead; office: ShadowDeskRead } {
  return {
    field: shadowDeskFromSnapshot("field", snapshot),
    office: shadowDeskFromSnapshot("office", snapshot)
  };
}

/**
 * Read the desk snapshot once for a shadow role.
 * Persistence stays off unless the caller already asked the desk to persist.
 * This function does not append field events and does not write job prices.
 */
export function readShadowDesk(role: ShadowDeskRole, options: DeskSnapshotOptions = {}): ShadowDeskRead {
  const snapshot = buildOperatorSnapshot({
    ...options,
    persistAlertState: options.persistAlertState ?? false,
    persistLocalReports: options.persistLocalReports ?? false
  });
  return shadowDeskFromSnapshot(role, snapshot);
}
