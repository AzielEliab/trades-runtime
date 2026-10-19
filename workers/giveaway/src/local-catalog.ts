/**
 * What the local package carries (TR-WORKER-CATALOG-2026-10-19), described for
 * the read-only public tools. This Worker runs none of it: every module and
 * platform peer below runs only in the local runtime on the operator machine,
 * against the operator's own files. No tenant data is here and nothing is
 * written. No platform peer has been tested against a live tenant.
 * Kept in sync with src/spine/platforms/catalog.ts by test/worker-catalog-sync.test.ts in the root package.
 */

export type LocalMode = "file-drop+read-pull" | "file-drop";
export type MappingConfidence = "documented" | "partial" | "guessed";

export const LOCAL_MODULES: ReadonlyArray<{ slug: string; summary: string }> = [
  { slug: "refrigerant-log", summary: "EPA Section 608 / AIM Act refrigerant log: charged, recovered, reclaimed; leak-rate trigger alerts from the shop's own log." },
  { slug: "permits-board", summary: "Permits and inspections per job and jurisdiction, with shop-entered rules." },
  { slug: "agreements-board", summary: "Maintenance agreements: renewals due, missed tune-ups, not visited; revenue at risk only from prices the shop supplies." },
  { slug: "warranty-claims", summary: "Parts replaced under warranty with no claim, and claim status aging." },
  { slug: "truck-stock-tomorrow", summary: "Counted van stock vs the parts tomorrow's scheduled jobs need; uncounted stays unknown." },
  { slug: "callback-root-cause", summary: "Callbacks linked to the original job only by explicit reference; rollups by tech, part, model, install step." }
];

export const LOCAL_PLATFORM_PEERS: ReadonlyArray<{ kind: string; label: string; mode: LocalMode; mappingConfidence: MappingConfidence }> = [
  { kind: "jobber", label: "Jobber", mode: "file-drop+read-pull", mappingConfidence: "partial" },
  { kind: "housecallpro", label: "Housecall Pro", mode: "file-drop+read-pull", mappingConfidence: "partial" },
  { kind: "square", label: "Square", mode: "file-drop+read-pull", mappingConfidence: "partial" },
  { kind: "quickbooks", label: "QuickBooks Online", mode: "file-drop+read-pull", mappingConfidence: "partial" },
  { kind: "fieldedge", label: "FieldEdge", mode: "file-drop", mappingConfidence: "documented" },
  { kind: "servicefusion", label: "Service Fusion", mode: "file-drop+read-pull", mappingConfidence: "partial" },
  { kind: "successware", label: "Successware", mode: "file-drop", mappingConfidence: "guessed" },
  { kind: "workiz", label: "Workiz", mode: "file-drop+read-pull", mappingConfidence: "documented" },
  { kind: "servicetrade", label: "ServiceTrade", mode: "file-drop+read-pull", mappingConfidence: "documented" },
  { kind: "buildops", label: "BuildOps", mode: "file-drop", mappingConfidence: "guessed" },
  { kind: "fieldpulse", label: "FieldPulse", mode: "file-drop+read-pull", mappingConfidence: "partial" },
  { kind: "kickserv", label: "Kickserv", mode: "file-drop+read-pull", mappingConfidence: "partial" },
  { kind: "mhelpdesk", label: "mHelpDesk", mode: "file-drop", mappingConfidence: "partial" },
  { kind: "servicem8", label: "ServiceM8", mode: "file-drop+read-pull", mappingConfidence: "partial" },
  { kind: "simpro", label: "Simpro", mode: "file-drop+read-pull", mappingConfidence: "partial" },
  { kind: "commusoft", label: "Commusoft", mode: "file-drop+read-pull", mappingConfidence: "partial" },
  { kind: "wintac", label: "Wintac", mode: "file-drop", mappingConfidence: "guessed" }
];

export const LOCAL_CATALOG_NOTE =
  "Local package only. These modules and platform peers run on the operator machine against the operator's own exports or optional read-only pulls (token from a local env var). Every admitted row is MEDIUM, UNVERIFIED. Writes go through the local approval gate, off by default. mappingConfidence: documented = field names checked against the vendor's published schema; partial = some published; guessed = confirm with a real export. Not tested against a live tenant.";
