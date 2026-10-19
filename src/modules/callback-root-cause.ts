import { classifyCall } from "../domain/call-class.js";
import { dayOf, listOf, pickText, readInboundRows, readModuleFile, sourceNote, type InboundRow, type ModuleContext, type ModuleSourceNote } from "./common.js";

/**
 * Callback root cause. Builds on the explicit callback/warranty labels from
 * classifyCall: a callback is linked to its original job only by an explicit
 * reference (originalJobId / parentJobId / callbackOf / relatedJobId on the job,
 * or a link in callbacks.json). A time gap or same address is never a link.
 * Roll-ups count linked callbacks by the original tech, part, equipment model,
 * and install step. This is a review list, not a technician score.
 */

export const ROOT_CAUSE_CATEGORIES = ["part-failure", "install", "diagnosis", "workmanship", "customer", "not-related", "unknown"] as const;
export type RootCauseCategory = (typeof ROOT_CAUSE_CATEGORIES)[number];

export interface CallbackLink {
  callbackJobId: string;
  originalJobId: string | null;
  originalTechnicianId?: string;
  originalTechnicianName?: string;
  callbackTechnicianId?: string;
  partNumber?: string;
  equipmentModel?: string;
  installStep?: string;
  category: RootCauseCategory;
  warranty: "yes" | "no" | "unknown";
  callbackOn?: string;
  originalOn?: string;
  daysBetween: number | null;
  basis: string;
}

export interface Rollup {
  key: string;
  callbacks: number;
  warranty: number;
}

export interface CallbackRootCauseBoard {
  module: "callbacks";
  generatedAt: string;
  links: CallbackLink[];
  unlinked: Array<{ callbackJobId: string; basis: string }>;
  byTechnician: Rollup[];
  byPart: Rollup[];
  byEquipmentModel: Rollup[];
  byInstallStep: Rollup[];
  byCategory: Rollup[];
  totals: { jobs: number; callbacks: number; warranty: number; linked: number; unlinked: number; notClassified: number };
  alerts: Array<{ id: string; severity: "watch"; message: string }>;
  source: ModuleSourceNote;
  note: string;
}

const ORIGINAL_KEYS = ["originalJobId", "original_job_id", "parentJobId", "parent_job_id", "callbackOf", "callback_of", "relatedJobId", "related_job_id", "recallOf", "recallOfParentJobID"];

function category(value: string): RootCauseCategory {
  const folded = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (ROOT_CAUSE_CATEGORIES as readonly string[]).includes(folded) ? (folded as RootCauseCategory) : "unknown";
}

function firstPart(raw: Record<string, unknown>): string | undefined {
  const part = [...listOf(raw.parts), ...listOf(raw.partsUsed), ...listOf(raw.lineItems)][0];
  return part ? pickText(part, ["sku", "partNumber", "part_number", "itemNumber"]) || undefined : undefined;
}

function modelOf(raw: Record<string, unknown>): string | undefined {
  const equipment = listOf(raw.equipment)[0] ?? {};
  return pickText(equipment, ["model", "modelNumber"]) || pickText(raw, ["equipmentModel", "model"]) || undefined;
}

function rollup(links: CallbackLink[], pick: (link: CallbackLink) => string | undefined): Rollup[] {
  const map = new Map<string, Rollup>();
  for (const link of links) {
    const key = pick(link) ?? "not recorded";
    const row = map.get(key) ?? { key, callbacks: 0, warranty: 0 };
    row.callbacks += 1;
    if (link.warranty === "yes") row.warranty += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.callbacks - a.callbacks || a.key.localeCompare(b.key));
}

export function buildCallbackRootCauseBoard(ctx: ModuleContext, rows?: InboundRow[]): CallbackRootCauseBoard {
  const file = readModuleFile(ctx.cwd, ctx.instanceId, "callbacks");
  const inbound = rows ?? readInboundRows(ctx);
  const jobs = inbound.filter((row) => row.entity === "job");
  const jobsById = new Map(jobs.map((row) => [row.externalId, row]));
  const local = new Map<string, Record<string, unknown>>();
  for (const row of listOf(file.data.links)) {
    const id = pickText(row, ["callbackJobId"]);
    if (id) local.set(id, row);
  }
  let notClassified = 0;
  let warrantyCount = 0;
  const callbacks: Array<{ id: string; row?: InboundRow; warranty: CallbackLink["warranty"] }> = [];
  for (const row of jobs) {
    const labels = classifyCall(row.raw);
    if (labels.warranty === "yes") warrantyCount += 1;
    if (labels.callback === "unknown" && !local.has(row.externalId)) notClassified += 1;
    if (labels.callback === "yes" || local.has(row.externalId)) callbacks.push({ id: row.externalId, row, warranty: labels.warranty });
  }
  for (const id of local.keys()) {
    if (!jobsById.has(id)) callbacks.push({ id, warranty: "unknown" });
  }
  const links: CallbackLink[] = [];
  const unlinked: CallbackRootCauseBoard["unlinked"] = [];
  for (const cb of callbacks) {
    const note = local.get(cb.id) ?? {};
    const raw = cb.row?.raw ?? {};
    const originalJobId = pickText(note, ["originalJobId"]) || pickText(raw, ORIGINAL_KEYS) || null;
    if (!originalJobId) {
      unlinked.push({ callbackJobId: cb.id, basis: "Callback label with no original-job reference. Not guessed from dates or address." });
      continue;
    }
    const original = jobsById.get(originalJobId);
    const callbackOn = dayOf(cb.row?.observedAt) ?? (dayOf(pickText(note, ["callbackOn"])) || undefined);
    const originalOn = dayOf(original?.observedAt) ?? (dayOf(pickText(note, ["originalOn"])) || undefined);
    const warrantyNote = pickText(note, ["warranty"]).toLowerCase();
    links.push({
      callbackJobId: cb.id,
      originalJobId,
      originalTechnicianId: pickText(note, ["originalTechnicianId"]) || original?.technicianId || undefined,
      originalTechnicianName: pickText(note, ["originalTechnicianName"]) || original?.technicianName || undefined,
      callbackTechnicianId: cb.row?.technicianId,
      partNumber: pickText(note, ["partNumber"]) || pickText(raw, ["failedPart", "rootCausePart"]) || (original ? firstPart(original.raw) : undefined),
      equipmentModel: pickText(note, ["equipmentModel"]) || (original ? modelOf(original.raw) : undefined) || modelOf(raw),
      installStep: pickText(note, ["installStep"]) || pickText(raw, ["installStep", "rootCauseStep"]) || undefined,
      category: category(pickText(note, ["category"]) || pickText(raw, ["rootCause", "rootCauseCategory"])),
      warranty: warrantyNote === "yes" || warrantyNote === "no" ? (warrantyNote as "yes" | "no") : cb.warranty,
      callbackOn,
      originalOn,
      daysBetween: callbackOn && originalOn ? Math.round((Date.parse(callbackOn) - Date.parse(originalOn)) / 86_400_000) : null,
      basis: local.has(cb.id) ? "Linked in callbacks.json." : `Linked by ${ORIGINAL_KEYS.find((key) => pickText(raw, [key])) ?? "reference"} on the callback job.`
    });
  }
  const byPart = rollup(links, (l) => l.partNumber);
  const byEquipmentModel = rollup(links, (l) => l.equipmentModel);
  const alerts: CallbackRootCauseBoard["alerts"] = [];
  for (const [label, list] of [["part", byPart], ["equipment model", byEquipmentModel]] as const) {
    for (const row of list) {
      if (row.key !== "not recorded" && row.callbacks >= 2) alerts.push({ id: `callback-repeat:${label}:${row.key}`, severity: "watch", message: `${row.callbacks} linked callbacks share ${label} ${row.key}. Review before it repeats.` });
    }
  }
  const unknownCause = links.filter((l) => l.category === "unknown").length;
  if (unknownCause) alerts.push({ id: "callback-cause-unknown", severity: "watch", message: `${unknownCause} linked callback(s) have no root-cause category yet.` });
  return {
    module: "callbacks",
    generatedAt: ctx.now,
    links: links.sort((a, b) => a.callbackJobId.localeCompare(b.callbackJobId)),
    unlinked,
    byTechnician: rollup(links, (l) => l.originalTechnicianName ?? l.originalTechnicianId),
    byPart,
    byEquipmentModel,
    byInstallStep: rollup(links, (l) => l.installStep),
    byCategory: rollup(links, (l) => l.category),
    totals: { jobs: jobs.length, callbacks: callbacks.length, warranty: warrantyCount, linked: links.length, unlinked: unlinked.length, notClassified },
    alerts,
    source: sourceNote(file, inbound),
    note: "Callbacks and warranty come from explicit labels (same rules as the weekly callback count). A link to the original job comes only from an explicit reference or the local callbacks.json. Roll-ups count by the original job's tech. This is a list to review, not a skill score."
  };
}

export function validateCallbackLinkWrite(args: Record<string, unknown>): Record<string, unknown> {
  const callbackJobId = pickText(args, ["callbackJobId"]);
  const originalJobId = pickText(args, ["originalJobId"]);
  if (!callbackJobId || !originalJobId) throw new Error("callbackJobId and originalJobId are required");
  if (callbackJobId === originalJobId) throw new Error("a callback cannot be its own original job");
  const row: Record<string, unknown> = { callbackJobId, originalJobId };
  for (const key of ["originalTechnicianId", "originalTechnicianName", "partNumber", "equipmentModel", "installStep", "note"]) {
    const value = pickText(args, [key]);
    if (value) row[key] = value;
  }
  const cat = pickText(args, ["category"]);
  if (cat) {
    if (category(cat) === "unknown" && cat.toLowerCase() !== "unknown") throw new Error(`category must be one of ${ROOT_CAUSE_CATEGORIES.join(", ")}`);
    row.category = category(cat);
  }
  return row;
}
