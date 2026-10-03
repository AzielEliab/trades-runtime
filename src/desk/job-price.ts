import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { sha256 } from "../core/hash.js";
import type { AuthorityRole } from "../core/actor-registry.js";
import { AUTHORITY_ROLES } from "../core/actor-registry.js";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";

/**
 * Job price on the local desk.
 * Part cost is typed, or filled only when a permitted catalog lookup actually returns a price.
 * This module does not call supplier sites, does not scrape, does not order, and does not
 * write ServiceTitan, Jobber, or ProBooks.
 *
 * Immediate price = (part cost + labor + task costs) × the company's margin multiplier.
 * Discounts apply after that. A locked discount refuses a role that is not allowed.
 */

export const CATALOG_SOURCE_IDS = [
  "supplyhouse",
  "johnstone",
  "ruud",
  "rheem",
  "bryant",
  "carrier",
  "duncan",
  "larson",
  "habegger",
  "lee-supply",
  "lowes",
  "home-depot"
] as const;

export type CatalogSourceId = (typeof CATALOG_SOURCE_IDS)[number];

export interface CatalogSource {
  id: CatalogSourceId;
  label: string;
  /** Named host for the label. Not a client and not fetched. */
  host: string | null;
  kind: "manufacturer-site" | "supply-house";
  priceConnected: false;
  stockConnected: false;
  ordersEnabled: false;
  scrape: false;
  /** The public site may hide price behind a sign-in. This desk still has no account. */
  signInForPriceOnly: true;
  note: string;
}

const SOURCE_NOTE =
  "No permitted account and no public price feed is connected. This desk does not scrape the site, does not invent a price or a stock count, and does not place an order. Sign-in here only records a local view request.";

export const CATALOG_SOURCES: readonly CatalogSource[] = [
  { id: "supplyhouse", label: "SupplyHouse", host: "supplyhouse.com", kind: "supply-house", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "johnstone", label: "Johnstone Supply", host: "johnstone.com", kind: "supply-house", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "ruud", label: "Ruud", host: "ruud.com", kind: "manufacturer-site", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "rheem", label: "Rheem", host: "rheem.com", kind: "manufacturer-site", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "bryant", label: "Bryant", host: "bryant.com", kind: "manufacturer-site", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "carrier", label: "Carrier", host: "carrier.com", kind: "manufacturer-site", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "duncan", label: "Duncan Supply", host: null, kind: "supply-house", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "larson", label: "Gustave A. Larson", host: null, kind: "supply-house", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "habegger", label: "Habegger", host: null, kind: "supply-house", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "lee-supply", label: "Lee Supply", host: null, kind: "supply-house", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "lowes", label: "Lowe's", host: "lowes.com", kind: "supply-house", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE },
  { id: "home-depot", label: "Home Depot", host: "homedepot.com", kind: "supply-house", priceConnected: false, stockConnected: false, ordersEnabled: false, scrape: false, signInForPriceOnly: true, note: SOURCE_NOTE }
];

export const TASK_PRESETS = [
  "difficult access",
  "ladder setup",
  "additional techs",
  "parts acquisition",
  "installation"
] as const;

export type DiscountKind = "percent" | "manager" | "member" | "coupon";

export interface CatalogLookup {
  sourceId: CatalogSourceId;
  label: string;
  sku: string;
  price: null;
  stock: null;
  imageUrl: null;
  priceConnected: false;
  stockConnected: false;
  ordersEnabled: false;
  scraped: false;
  note: string;
}

export interface CatalogViewRequest {
  id: string;
  at: string;
  sourceId: CatalogSourceId;
  sku: string;
  actorRole: AuthorityRole;
  ordersPlaced: false;
  priceReturned: null;
  localStub: true;
  note: string;
}

export type PartImageSource = "dropped-file" | "catalog" | "missing";
export type PartCostSource = "typed" | "catalog" | "none";

export interface JobPart {
  partId: string;
  sku: string;
  name: string;
  quantity: number;
  cost: number | null;
  costSource: PartCostSource;
  catalogSourceId: CatalogSourceId | null;
  imagePath: string | null;
  imageSource: PartImageSource;
  imageNote: string;
  catalogImageUrl: null;
}

export interface TaskCost {
  taskId: string;
  label: string;
  amount: number;
}

export interface JobDiscount {
  discountId: string;
  kind: DiscountKind;
  /** Percent points for kind percent. Dollars for manager, member, and coupon. */
  value: number;
  locked: boolean;
  allowedRoles: AuthorityRole[];
  applied: boolean;
  appliedByRole: AuthorityRole | null;
  appliedByActorId: string | null;
}

export interface LocalStockHit {
  sku: string;
  location: string;
  quantity: number;
  place: string | null;
  source: string;
}

export interface PresentedPart extends JobPart {
  areaStockKnown: boolean | null;
  areaStock: LocalStockHit[];
  supplierStock: null;
  stockNote: string;
}

export interface JobPriceSheet {
  jobId: string;
  labor: number | null;
  /** Company multiplier. 1.40 means costs times 1.40. Null until the company sets it. */
  marginMultiplier: number | null;
  parts: JobPart[];
  tasks: TaskCost[];
  discounts: JobDiscount[];
  catalogViews: CatalogViewRequest[];
}

export interface JobPriceResult {
  partCost: number | null;
  labor: number | null;
  taskCost: number;
  base: number | null;
  marginMultiplier: number | null;
  beforeDiscount: number | null;
  discountAmount: number | null;
  immediate: number | null;
  reason: string;
  ordersEnabled: false;
  vendorWrite: false;
}

export interface JobPriceStore {
  version: 1;
  product: "trades-runtime";
  live_backends: false;
  writes: false;
  vendorWrite: false;
  servicetitanWrite: false;
  probooksWrite: false;
  jobberWrite: false;
  ordersEnabled: false;
  pilot_started: false;
  field_claim: false;
  jobs: JobPriceSheet[];
}

export interface PricedJobView {
  sheet: JobPriceSheet;
  parts: PresentedPart[];
  price: JobPriceResult;
  livePriceConnected: false;
  ordersEnabled: false;
}

export interface JobPriceBoard {
  product: "trades-runtime";
  live_backends: false;
  writes: false;
  vendorWrite: false;
  ordersEnabled: false;
  pilot_started: false;
  field_claim: false;
  path: string;
  note: string;
  sources: readonly CatalogSource[];
  jobs: PricedJobView[];
}

const MISSING_IMAGE =
  "Image is missing. No dropped file is attached, and no catalog source returned an image. A photo is not invented.";

function assertLocalPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === "data/tenants" || normalized.startsWith("data/tenants/") || normalized.includes("/tenants/")) {
    throw new Error("hosted price layout is refused; job prices stay on this machine");
  }
  return filePath;
}

export function defaultJobPricePath(instanceId: string, root = "data/runtime"): string {
  return assertLocalPath(join(root, sanitizeInstanceId(instanceId), "job-prices.json"));
}

export function defaultJobImageDir(instanceId: string, root = "data/runtime"): string {
  return assertLocalPath(join(root, sanitizeInstanceId(instanceId), "job-images"));
}

function resolvePath(cwd: string, filePath: string): string {
  if (filePath.startsWith("/")) return assertLocalPath(filePath);
  return assertLocalPath(join(cwd, filePath));
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number`);
  return roundMoney(value);
}

function cleanId(value: string, label: string): string {
  const text = value.trim();
  if (!text || text.length > 80 || /[\\/\0]/.test(text)) throw new Error(`${label} is missing or not a local id`);
  return text;
}

export function isCatalogSourceId(value: string): value is CatalogSourceId {
  return (CATALOG_SOURCE_IDS as readonly string[]).includes(value);
}

export function catalogSource(id: string): CatalogSource {
  if (!isCatalogSourceId(id)) throw new Error(`unknown catalog source: ${id}`);
  const found = CATALOG_SOURCES.find((source) => source.id === id);
  if (!found) throw new Error(`unknown catalog source: ${id}`);
  return found;
}

/** Read-only lookup. Never returns a price, a stock count, or an image from the network. */
export function lookupCatalogPrice(sourceId: string, sku: string): CatalogLookup {
  const source = catalogSource(sourceId);
  const named = sku.trim();
  if (!named) throw new Error("catalog lookup needs a sku");
  return {
    sourceId: source.id,
    label: source.label,
    sku: named,
    price: null,
    stock: null,
    imageUrl: null,
    priceConnected: false,
    stockConnected: false,
    ordersEnabled: false,
    scraped: false,
    note: source.note
  };
}

export function emptyJobPriceStore(): JobPriceStore {
  return {
    version: 1,
    product: "trades-runtime",
    live_backends: false,
    writes: false,
    vendorWrite: false,
    servicetitanWrite: false,
    probooksWrite: false,
    jobberWrite: false,
    ordersEnabled: false,
    pilot_started: false,
    field_claim: false,
    jobs: []
  };
}

export function blankSheet(jobId: string): JobPriceSheet {
  return {
    jobId: cleanId(jobId, "jobId"),
    labor: null,
    marginMultiplier: null,
    parts: [],
    tasks: [],
    discounts: [],
    catalogViews: []
  };
}

export function readJobPriceStore(filePath: string): JobPriceStore {
  assertLocalPath(filePath);
  if (!existsSync(filePath)) return emptyJobPriceStore();
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as JobPriceStore;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.jobs)) return emptyJobPriceStore();
    return { ...emptyJobPriceStore(), jobs: parsed.jobs };
  } catch {
    return emptyJobPriceStore();
  }
}

export function writeJobPriceStore(filePath: string, store: JobPriceStore): void {
  assertLocalPath(filePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  const stored: JobPriceStore = { ...store, ...emptyJobPriceStore(), jobs: store.jobs };
  writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
}

function sheetOf(store: JobPriceStore, jobId: string): JobPriceSheet {
  const id = cleanId(jobId, "jobId");
  return store.jobs.find((job) => job.jobId === id) ?? blankSheet(id);
}

function saveSheet(store: JobPriceStore, sheet: JobPriceSheet): JobPriceStore {
  const jobs = store.jobs.filter((job) => job.jobId !== sheet.jobId);
  jobs.push(sheet);
  return { ...emptyJobPriceStore(), jobs };
}

export function attachPart(
  store: JobPriceStore,
  input: { jobId: string; sku: string; name: string; quantity?: number }
): { store: JobPriceStore; part: JobPart } {
  const sku = cleanId(input.sku, "sku");
  const name = input.name.trim();
  if (!name || name.length > 120) throw new Error("part name is required");
  const quantity = input.quantity == null ? 1 : input.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error("quantity must be a whole number from 1 to 999");
  const sheet = sheetOf(store, input.jobId);
  const part: JobPart = {
    partId: sha256({ jobId: sheet.jobId, sku, name, n: sheet.parts.length }).slice(0, 12),
    sku,
    name,
    quantity,
    cost: null,
    costSource: "none",
    catalogSourceId: null,
    imagePath: null,
    imageSource: "missing",
    imageNote: MISSING_IMAGE,
    catalogImageUrl: null
  };
  const next = { ...sheet, parts: [...sheet.parts, part] };
  return { store: saveSheet(store, next), part };
}

export function setPartCost(
  store: JobPriceStore,
  input: { jobId: string; partId: string; cost: number }
): JobPriceStore {
  const cost = money(input.cost, "part cost");
  const sheet = sheetOf(store, input.jobId);
  const parts = sheet.parts.map((part) =>
    part.partId === input.partId ? { ...part, cost, costSource: "typed" as const } : part
  );
  if (!parts.some((part) => part.partId === input.partId)) throw new Error("part is not on this job");
  return saveSheet(store, { ...sheet, parts });
}

export function setLabor(store: JobPriceStore, jobId: string, labor: number): JobPriceStore {
  const sheet = sheetOf(store, jobId);
  return saveSheet(store, { ...sheet, labor: money(labor, "labor") });
}

export function setMargin(store: JobPriceStore, jobId: string, marginMultiplier: number): JobPriceStore {
  if (!Number.isFinite(marginMultiplier) || marginMultiplier < 0 || marginMultiplier > 100) {
    throw new Error("margin multiplier must be a number from 0 to 100");
  }
  const sheet = sheetOf(store, jobId);
  return saveSheet(store, { ...sheet, marginMultiplier: roundMoney(marginMultiplier) });
}

export function addTask(
  store: JobPriceStore,
  input: { jobId: string; label: string; amount: number }
): JobPriceStore {
  const label = input.label.trim();
  if (!label || label.length > 80) throw new Error("task label is required");
  const sheet = sheetOf(store, input.jobId);
  const task: TaskCost = {
    taskId: sha256({ jobId: sheet.jobId, label, n: sheet.tasks.length }).slice(0, 12),
    label,
    amount: money(input.amount, "task cost")
  };
  return saveSheet(store, { ...sheet, tasks: [...sheet.tasks, task] });
}

function parseRoles(roles: readonly string[] | undefined, fallback: AuthorityRole[]): AuthorityRole[] {
  const source = roles && roles.length ? roles : fallback;
  const out: AuthorityRole[] = [];
  for (const role of source) {
    if (!(AUTHORITY_ROLES as readonly string[]).includes(role)) throw new Error(`unknown authority role: ${role}`);
    const typed = role as AuthorityRole;
    if (!out.includes(typed)) out.push(typed);
  }
  return out;
}

export function addDiscount(
  store: JobPriceStore,
  input: {
    jobId: string;
    kind: DiscountKind;
    value: number;
    locked?: boolean;
    allowedRoles?: AuthorityRole[];
  }
): { store: JobPriceStore; discount: JobDiscount } {
  if (input.kind !== "percent" && input.kind !== "manager" && input.kind !== "member" && input.kind !== "coupon") {
    throw new Error("discount kind must be percent, manager, member, or coupon");
  }
  if (input.kind === "percent") {
    if (!Number.isFinite(input.value) || input.value < 0 || input.value > 100) {
      throw new Error("percent off must be from 0 to 100");
    }
  } else {
    money(input.value, "discount");
  }
  const locked = input.locked ?? input.kind === "manager";
  const allowedRoles = parseRoles(input.allowedRoles, locked ? ["manager", "operator"] : [...AUTHORITY_ROLES]);
  const sheet = sheetOf(store, input.jobId);
  const discount: JobDiscount = {
    discountId: sha256({ jobId: sheet.jobId, kind: input.kind, value: input.value, n: sheet.discounts.length }).slice(0, 12),
    kind: input.kind,
    value: roundMoney(input.value),
    locked,
    allowedRoles,
    applied: false,
    appliedByRole: null,
    appliedByActorId: null
  };
  return { store: saveSheet(store, { ...sheet, discounts: [...sheet.discounts, discount] }), discount };
}

/** A locked discount applies only for an allowed role. Unlocked discounts apply for any desk role. */
export function assertMayApplyDiscount(discount: JobDiscount, role: AuthorityRole): void {
  if (!discount.locked) return;
  if (discount.allowedRoles.includes(role)) return;
  throw new Error(`discount is locked; role ${role} cannot apply it`);
}

export function applyDiscount(
  store: JobPriceStore,
  input: { jobId: string; discountId: string; role: AuthorityRole; actorId: string }
): JobPriceStore {
  if (!(AUTHORITY_ROLES as readonly string[]).includes(input.role)) throw new Error(`unknown authority role: ${input.role}`);
  const actorId = cleanId(input.actorId, "actorId");
  const sheet = sheetOf(store, input.jobId);
  const found = sheet.discounts.find((discount) => discount.discountId === input.discountId);
  if (!found) throw new Error("discount is not on this job");
  if (found.applied) throw new Error("discount is already applied");
  assertMayApplyDiscount(found, input.role);
  const discounts = sheet.discounts.map((discount) =>
    discount.discountId === found.discountId
      ? { ...discount, applied: true, appliedByRole: input.role, appliedByActorId: actorId }
      : discount
  );
  return saveSheet(store, { ...sheet, discounts });
}

export function recordCatalogView(
  store: JobPriceStore,
  input: { jobId: string; sourceId: string; sku: string; actorRole: AuthorityRole; at: string }
): { store: JobPriceStore; request: CatalogViewRequest; lookup: CatalogLookup } {
  const lookup = lookupCatalogPrice(input.sourceId, input.sku);
  if (!(AUTHORITY_ROLES as readonly string[]).includes(input.actorRole)) {
    throw new Error(`unknown authority role: ${input.actorRole}`);
  }
  const sheet = sheetOf(store, input.jobId);
  const request: CatalogViewRequest = {
    id: sha256({ jobId: sheet.jobId, sourceId: lookup.sourceId, sku: lookup.sku, at: input.at }).slice(0, 12),
    at: input.at,
    sourceId: lookup.sourceId,
    sku: lookup.sku,
    actorRole: input.actorRole,
    ordersPlaced: false,
    priceReturned: null,
    localStub: true,
    note: `Sign-in recorded locally for ${lookup.label} price and stock view only. No account is connected. No order was placed. No price was returned.`
  };
  const jobs = sheet.catalogViews.some((row) => row.id === request.id)
    ? sheet.catalogViews
    : [...sheet.catalogViews, request];
  return { store: saveSheet(store, { ...sheet, catalogViews: jobs }), request, lookup };
}

function imageNoteFor(source: PartImageSource, path: string | null): string {
  if (source === "dropped-file" && path) return `Image kept from a file on this machine: ${path}. Not a catalog photo.`;
  if (source === "catalog") return "Catalog image from a permitted source.";
  return MISSING_IMAGE;
}

export function partImageState(part: Pick<JobPart, "imagePath" | "catalogImageUrl" | "imageSource">): {
  imageSource: PartImageSource;
  imageNote: string;
} {
  if (part.imagePath) return { imageSource: "dropped-file", imageNote: imageNoteFor("dropped-file", part.imagePath) };
  if (part.catalogImageUrl) return { imageSource: "catalog", imageNote: imageNoteFor("catalog", null) };
  return { imageSource: "missing", imageNote: MISSING_IMAGE };
}

const IMAGE_TYPES: Record<string, { ext: string; check: (bytes: Buffer) => boolean }> = {
  "image/png": { ext: "png", check: (bytes) => bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 },
  "image/jpeg": { ext: "jpg", check: (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/webp": {
    ext: "webp",
    check: (bytes) => bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
  },
  "image/gif": {
    ext: "gif",
    check: (bytes) => bytes.length > 6 && (bytes.toString("ascii", 0, 6) === "GIF89a" || bytes.toString("ascii", 0, 6) === "GIF87a")
  }
};

export function saveDroppedImage(args: {
  cwd: string;
  instanceId: string;
  jobId: string;
  partId: string;
  mediaType: string;
  bytes: Buffer;
}): { relativePath: string } {
  const spec = IMAGE_TYPES[args.mediaType];
  if (!spec || !spec.check(args.bytes)) throw new Error("dropped image must be a png, jpeg, webp, or gif");
  if (args.bytes.length > 1_500_000) throw new Error("dropped image is larger than 1.5 MB");
  const dir = resolvePath(args.cwd, defaultJobImageDir(args.instanceId));
  mkdirSync(dir, { recursive: true });
  const fileName = `${cleanId(args.jobId, "jobId")}-${cleanId(args.partId, "partId")}.${spec.ext}`;
  const absolute = join(dir, fileName);
  writeFileSync(absolute, args.bytes);
  return { relativePath: join(defaultJobImageDir(args.instanceId), fileName) };
}

export function attachImagePath(store: JobPriceStore, input: { jobId: string; partId: string; relativePath: string }): JobPriceStore {
  const sheet = sheetOf(store, input.jobId);
  if (!sheet.parts.some((part) => part.partId === input.partId)) throw new Error("part is not on this job");
  const relativePath = input.relativePath.replace(/\\/g, "/");
  if (relativePath.includes("..")) throw new Error("image path must stay inside the local job-images folder");
  const parts = sheet.parts.map((part) => {
    if (part.partId !== input.partId) return part;
    const state = partImageState({ imagePath: relativePath, catalogImageUrl: null, imageSource: "dropped-file" });
    return { ...part, imagePath: relativePath, imageSource: state.imageSource, imageNote: state.imageNote, catalogImageUrl: null as null };
  });
  return saveSheet(store, { ...sheet, parts });
}

/** Keep an image file the operator already dropped under job-images. Refuses paths outside that folder. */
export function attachExistingImageFile(args: {
  cwd: string;
  instanceId: string;
  store: JobPriceStore;
  jobId: string;
  partId: string;
  fileName: string;
}): JobPriceStore {
  const name = basename(args.fileName.trim());
  if (!name || name !== args.fileName.trim() || name.includes("..")) throw new Error("image file name must be a file in the local job-images folder");
  const dir = resolve(resolvePath(args.cwd, defaultJobImageDir(args.instanceId)));
  const absolute = resolve(dir, name);
  if (!absolute.startsWith(dir)) throw new Error("image path must stay inside the local job-images folder");
  if (!existsSync(absolute)) throw new Error("image file is not in the local job-images folder");
  const relativePath = join(defaultJobImageDir(args.instanceId), name);
  return attachImagePath(args.store, { jobId: args.jobId, partId: args.partId, relativePath });
}

export function priceJob(sheet: JobPriceSheet): JobPriceResult {
  const refused: JobPriceResult = {
    partCost: null,
    labor: sheet.labor,
    taskCost: roundMoney(sheet.tasks.reduce((sum, task) => sum + task.amount, 0)),
    base: null,
    marginMultiplier: sheet.marginMultiplier,
    beforeDiscount: null,
    discountAmount: null,
    immediate: null,
    reason: "",
    ordersEnabled: false,
    vendorWrite: false
  };
  if (!sheet.parts.length) {
    return { ...refused, reason: "No part is attached. Attach a part before pricing. No supplier order is placed." };
  }
  if (sheet.parts.some((part) => part.cost == null)) {
    const known = sheet.parts.filter((part) => part.cost != null).reduce((sum, part) => sum + (part.cost ?? 0) * part.quantity, 0);
    return {
      ...refused,
      partCost: roundMoney(known),
      reason: "A part on this job has no cost. Type a cost, or connect a permitted price. A missing price is not zero. No live catalog price is connected."
    };
  }
  if (sheet.labor == null) {
    return { ...refused, partCost: partTotal(sheet), reason: "Labor is not set. Type a labor amount. It is not assumed." };
  }
  if (sheet.marginMultiplier == null) {
    return {
      ...refused,
      partCost: partTotal(sheet),
      reason: "Set the expected profit margin multiplier. Immediate price is part cost plus labor plus task costs, times that multiplier. It is not assumed."
    };
  }
  const partCost = partTotal(sheet);
  const taskCost = refused.taskCost;
  const base = roundMoney(partCost + sheet.labor + taskCost);
  let sell = roundMoney(base * sheet.marginMultiplier);
  const beforeDiscount = sell;
  for (const discount of sheet.discounts) {
    if (!discount.applied) continue;
    if (discount.kind === "percent") sell = roundMoney(sell * (1 - discount.value / 100));
    else sell = roundMoney(sell - discount.value);
  }
  if (sell < 0) sell = 0;
  const discountAmount = roundMoney(beforeDiscount - sell);
  return {
    partCost,
    labor: sheet.labor,
    taskCost,
    base,
    marginMultiplier: sheet.marginMultiplier,
    beforeDiscount,
    discountAmount,
    immediate: sell,
    reason: "Immediate price is typed part cost plus labor plus task costs, times the company margin multiplier, then applied discounts. Not a supplier order. Not a provider write.",
    ordersEnabled: false,
    vendorWrite: false
  };
}

function partTotal(sheet: JobPriceSheet): number {
  return roundMoney(sheet.parts.reduce((sum, part) => sum + (part.cost ?? 0) * part.quantity, 0));
}

export function presentPart(part: JobPart, hits: readonly LocalStockHit[]): PresentedPart {
  const areaStock = hits.filter((hit) => hit.sku === part.sku);
  const image = partImageState(part);
  const supplierNote = "Supplier stock is not connected. It is unknown, not zero. No order is placed.";
  return {
    ...part,
    imageSource: image.imageSource,
    imageNote: image.imageNote,
    areaStockKnown: areaStock.length ? true : null,
    areaStock,
    supplierStock: null,
    stockNote: areaStock.length
      ? `Local counts on this machine name this sku. ${supplierNote}`
      : `Stock in the area is not known. No local count names this sku. ${supplierNote}`
  };
}

export function presentJob(sheet: JobPriceSheet, hits: readonly LocalStockHit[]): PricedJobView {
  return {
    sheet,
    parts: sheet.parts.map((part) => presentPart(part, hits)),
    price: priceJob(sheet),
    livePriceConnected: false,
    ordersEnabled: false
  };
}

export function loadJobPriceBoard(args: {
  cwd: string;
  instanceId: string;
  missionDay: string;
  jobs: readonly { id: string; day: string }[];
  stock: readonly LocalStockHit[];
}): JobPriceBoard {
  const path = defaultJobPricePath(args.instanceId);
  const store = readJobPriceStore(resolvePath(args.cwd, path));
  const ids = new Set<string>();
  for (const job of args.jobs) {
    if (job.day === args.missionDay) ids.add(job.id);
  }
  for (const sheet of store.jobs) ids.add(sheet.jobId);
  const views = [...ids].sort().map((id) => presentJob(store.jobs.find((sheet) => sheet.jobId === id) ?? blankSheet(id), args.stock));
  return {
    product: "trades-runtime",
    live_backends: false,
    writes: false,
    vendorWrite: false,
    ordersEnabled: false,
    pilot_started: false,
    field_claim: false,
    path,
    note: "Job prices stay on this machine. Typed costs and typed labor are marked typed. Catalog lookups stay empty because no permitted account or public price feed is connected. Supplier sites are not scraped and orders are not placed. The same sheet is what field, office, and management read. ServiceTitan, Jobber, and ProBooks writes stay false. The part-cost board remains current, last, and adapted cost. It is not this sell price and not a skill score.",
    sources: CATALOG_SOURCES,
    jobs: views
  };
}

export function updateJobPrices(
  cwd: string,
  instanceId: string,
  change: (store: JobPriceStore) => JobPriceStore
): JobPriceStore {
  const path = resolvePath(cwd, defaultJobPricePath(instanceId));
  const next = change(readJobPriceStore(path));
  writeJobPriceStore(path, next);
  return next;
}

export function stockHitsFromLines(
  lines: readonly { sku: string; location: string; quantity: number; vanId?: string; placeId?: string }[],
  source: string
): LocalStockHit[] {
  return lines.map((line) => ({
    sku: line.sku,
    location: line.location,
    quantity: line.quantity,
    place: line.vanId ?? line.placeId ?? null,
    source
  }));
}
