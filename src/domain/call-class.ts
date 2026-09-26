/**
 * Field-call labels for callback and warranty.
 * A missing label stays unknown. Unknown is not warranty-covered and is not a callback.
 * Prose fields (summary, description, notes) are not read. A 30-day gap is not an automatic callback.
 */

export const CALL_FLAGS = ["yes", "no", "unknown"] as const;
export type CallFlag = (typeof CALL_FLAGS)[number];

export interface CallClassification {
  callback: CallFlag;
  warranty: CallFlag;
  callbackBasis: string;
  warrantyBasis: string;
}

export interface CallClassCounts {
  calls: number;
  callback: number;
  warranty: number;
  /** Already included in callback and in warranty. */
  callbackAndWarranty: number;
  /** Both flags explicitly no. */
  neither: number;
  /** Both flags unknown. */
  notClassified: number;
  callbackUnknown: number;
  warrantyUnknown: number;
}

export type DeskTradeLane = "hvac" | "plumbing" | "electrical" | "sewer" | "cross-trades";

export interface SyntheticDeskTech {
  id: string;
  name: string;
  lane: DeskTradeLane;
  /** Known daily slots on the in-repo sample. Not a live capacity board. */
  slots: number;
}

/** Fixture roster for the empty-folder desk. Not a company roster and not a skill ranking. */
export const SYNTHETIC_DESK_TECHS: readonly SyntheticDeskTech[] = [
  { id: "tech-maya", name: "Maya Chen", lane: "hvac", slots: 4 },
  { id: "tech-luis", name: "Luis Ortega", lane: "plumbing", slots: 4 },
  { id: "tech-priya", name: "Priya Shah", lane: "electrical", slots: 3 },
  { id: "tech-andre", name: "Andre Cole", lane: "sewer", slots: 3 },
  { id: "tech-sam", name: "Sam Okonkwo", lane: "cross-trades", slots: 3 }
];

export interface SyntheticDeskCall {
  id: string;
  trade: DeskTradeLane;
  /** Calendar day on the synthetic desk series. */
  day: string;
  technicianId: string;
  status: string;
  raw: Record<string, unknown>;
}

/** In-repo multi-trade sample for the empty-folder desk. Fixture labels, not a company export. */
export const SYNTHETIC_DESK_CALLS: readonly SyntheticDeskCall[] = [
  {
    id: "SYN-DESK-HVAC-1",
    trade: "hvac",
    day: "2026-09-25",
    technicianId: "tech-maya",
    status: "scheduled",
    raw: { trade: "hvac", isCallback: true, isWarranty: false, jobType: "no cool" }
  },
  {
    id: "SYN-DESK-HVAC-2",
    trade: "hvac",
    day: "2026-09-24",
    technicianId: "tech-maya",
    status: "completed",
    raw: { trade: "hvac", jobType: "warranty", callback: false }
  },
  {
    id: "SYN-DESK-PL-1",
    trade: "plumbing",
    day: "2026-09-25",
    technicianId: "tech-luis",
    status: "scheduled",
    raw: { trade: "plumbing", tags: ["callback", "return-visit"] }
  },
  {
    id: "SYN-DESK-PL-2",
    trade: "plumbing",
    day: "2026-09-22",
    technicianId: "tech-luis",
    status: "completed",
    raw: { trade: "plumbing", isWarranty: true, isCallback: false, jobType: "water heater" }
  },
  {
    id: "SYN-DESK-EL-1",
    trade: "electrical",
    day: "2026-09-21",
    technicianId: "tech-priya",
    status: "scheduled",
    raw: { trade: "electrical", jobType: "callback", warrantyState: "NOT_COVERED" }
  },
  {
    id: "SYN-DESK-EL-2",
    trade: "electrical",
    day: "2026-09-20",
    technicianId: "tech-priya",
    status: "completed",
    raw: { trade: "electrical", jobType: "service" }
  },
  {
    id: "SYN-DESK-SW-1",
    trade: "sewer",
    day: "2026-09-25",
    technicianId: "tech-andre",
    status: "scheduled",
    raw: { trade: "sewer", isCallback: true, isWarranty: true }
  },
  {
    id: "SYN-DESK-SW-2",
    trade: "sewer",
    day: "2026-09-19",
    technicianId: "tech-andre",
    status: "completed",
    raw: { trade: "sewer", warrantyState: "POSSIBLE" }
  },
  {
    id: "SYN-DESK-XT-1",
    trade: "cross-trades",
    day: "2026-09-24",
    technicianId: "tech-sam",
    status: "scheduled",
    raw: { trade: "cross-trades", callback: "no", warranty: "no" }
  },
  {
    id: "SYN-DESK-HVAC-3",
    trade: "hvac",
    day: "2026-09-23",
    technicianId: "tech-maya",
    status: "completed",
    raw: { trade: "hvac", tags: ["warranty"], isCallback: "no" }
  }
];

export const CALL_DESK_FILTERS = ["all", "callback", "warranty", "not-classified"] as const;
export type CallDeskFilter = (typeof CALL_DESK_FILTERS)[number];

const CALLBACK_KEYS = ["callback", "is_callback", "return_visit", "is_return_visit", "recall", "is_recall"];
const WARRANTY_KEYS = ["warranty", "is_warranty", "warranty_covered", "under_warranty", "covered_by_warranty"];
const TYPE_KEYS = ["job_type", "job_type_name", "call_type", "type"];
const TAG_KEYS = ["tags", "labels", "job_tags"];
const STATE_KEYS = ["warranty_state", "warranty_status"];

const CALLBACK_YES = new Set(["true", "yes", "y", "1", "callback", "return", "return-visit", "return visit", "recall", "go-back", "goback"]);
const CALLBACK_NO = new Set(["false", "no", "n", "0", "none"]);
const WARRANTY_YES = new Set(["true", "yes", "y", "1", "warranty", "covered", "in-warranty", "in warranty"]);
const WARRANTY_NO = new Set([
  "false",
  "no",
  "n",
  "0",
  "none",
  "not-covered",
  "not covered",
  "out-of-warranty",
  "out of warranty",
  "non-warranty",
  "nonwarranty"
]);

type Polarity = "yes" | "no" | "abstain";

interface Labeled {
  field: string;
  polarity: Polarity;
}

function normKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_");
}

function readAll(row: Record<string, unknown>, needles: string[]): Array<{ key: string; value: unknown }> {
  const wanted = new Set(needles);
  const found: Array<{ key: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(row)) {
    if (value == null || value === "") continue;
    if (wanted.has(normKey(key))) found.push({ key, value });
  }
  return found;
}

function token(value: string): string {
  return value.trim().toLowerCase().replace(/[_]+/g, "-").replace(/\s+/g, " ");
}

function flagFromString(value: string, yes: Set<string>, no: Set<string>): Polarity | null {
  const folded = token(value);
  if (yes.has(folded)) return "yes";
  if (no.has(folded)) return "no";
  return null;
}

function callbackFromJobType(value: string): Polarity | null {
  const folded = value.toLowerCase();
  if (/callback|return[-\s]?visit|\brecall\b|go-?back/.test(folded)) return "yes";
  return null;
}

function warrantyFromJobType(value: string): Polarity | null {
  const folded = value.toLowerCase();
  if (/non[-\s]?warranty|not[-\s]?(?:covered|a warranty)|out[-\s]?of[-\s]?warranty/.test(folded)) return "no";
  if (/\bwarranty\b/.test(folded)) return "yes";
  return null;
}

function warrantyStatePolarity(value: string): Polarity | null {
  const folded = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (folded === "CONFIRMED") return "yes";
  if (folded === "NOT_COVERED") return "no";
  if (folded === "POSSIBLE" || folded === "UNKNOWN" || folded === "LOOKUP_FAILED") return "abstain";
  return null;
}

function polaritiesFromValue(
  value: unknown,
  yes: Set<string>,
  no: Set<string>,
  prose: (text: string) => Polarity | null
): Polarity[] {
  if (typeof value === "boolean") return [value ? "yes" : "no"];
  if (typeof value === "number") {
    if (value === 1) return ["yes"];
    if (value === 0) return ["no"];
    return [];
  }
  if (typeof value === "string") {
    const exact = flagFromString(value, yes, no);
    if (exact) return [exact];
    const fromProse = prose(value);
    return fromProse ? [fromProse] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => polaritiesFromValue(item, yes, no, prose));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return readAll(record, ["covered", "is_covered", "active", "status", "value", "state"]).flatMap((inner) =>
      polaritiesFromValue(inner.value, yes, no, prose)
    );
  }
  return [];
}

function collect(
  row: Record<string, unknown>,
  keys: string[],
  yes: Set<string>,
  no: Set<string>,
  prose: (text: string) => Polarity | null
): Labeled[] {
  const labeled: Labeled[] = [];
  for (const found of readAll(row, keys)) {
    for (const polarity of polaritiesFromValue(found.value, yes, no, prose)) {
      labeled.push({ field: found.key, polarity });
    }
  }
  return labeled;
}

function joinFields(rows: Labeled[]): string {
  return [...new Set(rows.map((row) => row.field))].join(", ");
}

function settle(rows: Labeled[], kind: "callback" | "warranty"): { flag: CallFlag; basis: string } {
  const yes = rows.some((row) => row.polarity === "yes");
  const no = rows.some((row) => row.polarity === "no");
  const abstain = rows.some((row) => row.polarity === "abstain");
  const fields = joinFields(rows);
  if (!rows.length) {
    return {
      flag: "unknown",
      basis: kind === "callback" ? "No callback label on this row." : "No warranty label on this row."
    };
  }
  if (yes && (no || abstain)) {
    return {
      flag: "unknown",
      basis:
        kind === "callback"
          ? `Conflicting callback labels (${fields}). Left unknown.`
          : `Conflicting warranty labels (${fields}). Left unknown. Possible, unknown, and lookup-failed are not coverage.`
    };
  }
  if (no && abstain) {
    return {
      flag: "unknown",
      basis: `Conflicting warranty labels (${fields}). Left unknown.`
    };
  }
  if (yes) {
    return {
      flag: "yes",
      basis: kind === "callback" ? `Callback label on ${fields}.` : `Warranty label on ${fields}.`
    };
  }
  if (no) {
    return {
      flag: "no",
      basis: kind === "callback" ? `Explicitly not a callback (${fields}).` : `Explicitly not warranty-covered (${fields}).`
    };
  }
  const state = rows.find((row) => row.polarity === "abstain");
  return {
    flag: "unknown",
    basis: `Warranty state on ${state?.field ?? fields} is not a coverage decision. Left unknown.`
  };
}

/** Classify one job/call row from explicit fields, job type, and tags. */
export function classifyCall(raw: Record<string, unknown>): CallClassification {
  const callbackRows = [
    ...collect(raw, CALLBACK_KEYS, CALLBACK_YES, CALLBACK_NO, callbackFromJobType),
    ...collect(raw, TYPE_KEYS, CALLBACK_YES, CALLBACK_NO, callbackFromJobType),
    ...collect(raw, TAG_KEYS, CALLBACK_YES, CALLBACK_NO, callbackFromJobType)
  ];
  const warrantyRows = [
    ...collect(raw, WARRANTY_KEYS, WARRANTY_YES, WARRANTY_NO, warrantyFromJobType),
    ...collect(raw, TYPE_KEYS, WARRANTY_YES, WARRANTY_NO, warrantyFromJobType),
    ...collect(raw, TAG_KEYS, WARRANTY_YES, WARRANTY_NO, warrantyFromJobType),
    ...collect(raw, STATE_KEYS, WARRANTY_YES, WARRANTY_NO, (value) => warrantyStatePolarity(value))
  ];
  const callback = settle(callbackRows, "callback");
  const warranty = settle(warrantyRows, "warranty");
  return {
    callback: callback.flag,
    warranty: warranty.flag,
    callbackBasis: callback.basis,
    warrantyBasis: warranty.basis
  };
}

export function syntheticDeskCallClasses(): CallClassification[] {
  return SYNTHETIC_DESK_CALLS.map((row) => classifyCall(row.raw));
}

export function isNotClassified(row: Pick<CallClassification, "callback" | "warranty">): boolean {
  return row.callback === "unknown" && row.warranty === "unknown";
}

/** Honest reason for one row. Silent exports stay not classified. Coverage is not invented. */
export function describeCallReason(row: CallClassification): string {
  if (isNotClassified(row)) {
    const callbackSilent = row.callbackBasis.startsWith("No callback label");
    const warrantySilent = row.warrantyBasis.startsWith("No warranty label");
    if (callbackSilent && warrantySilent) {
      return "Not classified. The export is silent on callback and on warranty. Unknown is not a callback and is not warranty-covered.";
    }
    return `Not classified. ${row.callbackBasis} ${row.warrantyBasis} Unknown is not a callback and is not warranty-covered.`;
  }
  return `${row.callbackBasis} ${row.warrantyBasis}`;
}

export function callFilterLabel(filter: CallDeskFilter): string {
  if (filter === "callback") return "Callbacks only";
  if (filter === "warranty") return "Warranty only";
  if (filter === "not-classified") return "Not classified";
  return "All calls";
}

/** Desk query `calls`. Unknown values stay on all calls. */
export function parseCallDeskFilter(value: string | null | undefined): CallDeskFilter {
  const token = (value ?? "").trim().toLowerCase();
  if (token === "callback" || token === "callbacks" || token === "callbacks-only") return "callback";
  if (token === "warranty" || token === "warranty-only") return "warranty";
  if (token === "not-classified" || token === "not_classified" || token === "unclassified") return "not-classified";
  return "all";
}

export function callMatchesFilter(
  row: Pick<CallClassification, "callback" | "warranty">,
  filter: CallDeskFilter
): boolean {
  if (filter === "callback") return row.callback === "yes";
  if (filter === "warranty") return row.warranty === "yes";
  if (filter === "not-classified") return isNotClassified(row);
  return true;
}

export function emptyCallClassCounts(): CallClassCounts {
  return {
    calls: 0,
    callback: 0,
    warranty: 0,
    callbackAndWarranty: 0,
    neither: 0,
    notClassified: 0,
    callbackUnknown: 0,
    warrantyUnknown: 0
  };
}

export function aggregateCallClasses(rows: readonly CallClassification[]): CallClassCounts {
  const counts = emptyCallClassCounts();
  for (const row of rows) {
    counts.calls += 1;
    if (row.callback === "yes") counts.callback += 1;
    if (row.warranty === "yes") counts.warranty += 1;
    if (row.callback === "yes" && row.warranty === "yes") counts.callbackAndWarranty += 1;
    if (row.callback === "no" && row.warranty === "no") counts.neither += 1;
    if (row.callback === "unknown" && row.warranty === "unknown") counts.notClassified += 1;
    if (row.callback === "unknown") counts.callbackUnknown += 1;
    if (row.warranty === "unknown") counts.warrantyUnknown += 1;
  }
  return counts;
}

export function describeCallClass(counts: CallClassCounts, source: "synthetic-sample" | "admitted-jobs"): string {
  const head = `Callback ${counts.callback}. Warranty ${counts.warranty}. Not classified ${counts.notClassified}. Calls in this count: ${counts.calls}.`;
  if (source === "synthetic-sample") {
    return `${head} Synthetic multi-trade sample (hvac, plumbing, electrical, sewer, cross-trades). These labels are the in-repo fixture. They are not the job chart and not a company export. Unknown is not warranty-covered and is not a callback.`;
  }
  return `${head} Counted from admitted job rows on this machine. A row with no callback label and no warranty label stays not classified. Explicit neither: ${counts.neither}. Unknown is not warranty-covered and is not a callback.`;
}
