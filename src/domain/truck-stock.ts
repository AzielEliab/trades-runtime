import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { JobEconomicsInput } from "./job-economics.js";
import { reconcileJob } from "./job-economics.js";

export const STOCK_LOCATIONS = [
  "ON_VAN",
  "NEARBY_VAN",
  "BRANCH_STOCK",
  "CENTRAL_WAREHOUSE",
  "LOCAL_DISTRIBUTOR",
  "SHIPPED",
  "BACKORDERED"
] as const;

export type StockLocation = (typeof STOCK_LOCATIONS)[number];

export const FULFILLMENT_STEPS = [
  "REQUESTED",
  "CLAIMED",
  "PICKING",
  "READY",
  "TRANSFER",
  "DELIVERED",
  "INSTALLED",
  "RECONCILED"
] as const;

export type FulfillmentStep = (typeof FULFILLMENT_STEPS)[number];

export interface StockRequest {
  requestId: string;
  callId: string;
  vanId: string;
  partNumber: string;
  quantity: number;
  location: StockLocation;
  step: FulfillmentStep;
  urgency?: "routine" | "same-day" | "emergency";
  replenishAfter?: boolean;
  shippingRequired?: boolean;
  procurementRequired?: boolean;
}

export function firstTripProbability(location: StockLocation): number {
  switch (location) {
    case "ON_VAN":
      return 0.92;
    case "NEARBY_VAN":
      return 0.78;
    case "BRANCH_STOCK":
      return 0.7;
    case "CENTRAL_WAREHOUSE":
      return 0.55;
    case "LOCAL_DISTRIBUTOR":
      return 0.45;
    case "SHIPPED":
      return 0.25;
    case "BACKORDERED":
      return 0.05;
  }
}

export function procurementBurden(location: StockLocation): number {
  switch (location) {
    case "ON_VAN":
      return 0;
    case "NEARBY_VAN":
      return 15;
    case "BRANCH_STOCK":
      return 25;
    case "CENTRAL_WAREHOUSE":
      return 55;
    case "LOCAL_DISTRIBUTOR":
      return 80;
    case "SHIPPED":
      return 140;
    case "BACKORDERED":
      return 220;
  }
}

/** Inventory location is operationally material for completion and job economics. */
export function applyLocationToEconomics(
  base: JobEconomicsInput,
  location: StockLocation
): JobEconomicsInput & { firstTripProbability: number; completionProbability: number; location: StockLocation } {
  const completion = firstTripProbability(location);
  const callbackRisk = (1 - completion) * 80;
  return {
    ...base,
    procurement: base.procurement + procurementBurden(location),
    callbackRework: base.callbackRework + callbackRisk,
    firstTripProbability: completion,
    completionProbability: completion,
    location
  };
}

export function economicsForLocation(base: JobEconomicsInput, location: StockLocation) {
  const adjusted = applyLocationToEconomics(base, location);
  return { ...reconcileJob(adjusted), ...adjusted };
}

export type StockAction = "add" | "increase" | "reduce" | "eliminate" | "hold-min";

export interface VanStockProfile {
  vanId: string;
  territory: string;
  callMix: Record<string, number>;
  skillProfile: string[];
  consumption: Record<string, number>;
  firstTripRate: number;
  predictedDemand: Record<string, number>;
  leadTimeDays: number;
  carryingCost: number;
  explorationNeed: boolean;
}

export function recommendVanStock(input: {
  consumption: number;
  firstTripRate: number;
  carryingCost: number;
  explorationNeed: boolean;
  /** Omitted or null means the van was not counted. Unknown is not zero. */
  onVanCount?: number | null;
  warehouseCount?: number | null;
}): StockAction {
  if (typeof input.onVanCount === "number") {
    const covered = input.onVanCount >= input.consumption;
    const warehouseEmpty = typeof input.warehouseCount === "number" && input.warehouseCount === 0;
    if (!covered && input.consumption > 0 && (input.onVanCount === 0 || warehouseEmpty || input.firstTripRate < 0.6)) {
      return "increase";
    }
    if (covered && input.consumption > 0) return "hold-min";
    if (input.consumption === 0 && input.onVanCount > 0 && input.carryingCost > 0.5) return "reduce";
  }
  if (input.consumption === 0 && input.carryingCost > 0.5) return "eliminate";
  if (input.firstTripRate < 0.6) return "increase";
  if (input.explorationNeed && input.consumption < 1) return "hold-min";
  if (input.consumption > 3) return "add";
  return "reduce";
}

export function recommendVanProfile(
  profile: VanStockProfile & {
    onVanCounts?: Record<string, number | null>;
    warehouseCounts?: Record<string, number | null>;
  }
): Array<{ sku: string; action: StockAction }> {
  const skus = new Set([...Object.keys(profile.consumption), ...Object.keys(profile.predictedDemand)]);
  return [...skus].map((sku) => ({
    sku,
    action: recommendVanStock({
      consumption: profile.consumption[sku] ?? 0,
      firstTripRate: profile.firstTripRate,
      carryingCost: profile.carryingCost,
      explorationNeed: profile.explorationNeed,
      onVanCount: profile.onVanCounts?.[sku],
      warehouseCount: profile.warehouseCounts?.[sku]
    })
  }));
}

export interface JobPartDemand {
  callId: string;
  vanId: string;
  partNumber: string;
  quantity: number;
  onVanQuantity: number;
  location: StockLocation;
  urgency?: StockRequest["urgency"];
}

/** Warehouse queue is generated from live job demand and truck-stock consumption. */
export function fulfillmentQueueFromDemand(demand: JobPartDemand[]): StockRequest[] {
  return demand
    .filter((row) => row.quantity > row.onVanQuantity)
    .map((row) => ({
      requestId: `sr:${row.callId}:${row.partNumber}`,
      callId: row.callId,
      vanId: row.vanId,
      partNumber: row.partNumber,
      quantity: row.quantity - row.onVanQuantity,
      location: row.location,
      step: "REQUESTED" as const,
      urgency: row.urgency ?? "routine",
      replenishAfter: row.onVanQuantity === 0,
      shippingRequired: row.location === "SHIPPED" || row.location === "LOCAL_DISTRIBUTOR",
      procurementRequired: row.location === "BACKORDERED" || row.location === "LOCAL_DISTRIBUTOR"
    }));
}

export function advanceFulfillment(request: StockRequest): StockRequest {
  const i = FULFILLMENT_STEPS.indexOf(request.step);
  if (i < 0 || i === FULFILLMENT_STEPS.length - 1) return request;
  return { ...request, step: FULFILLMENT_STEPS[i + 1]! };
}

export function purchasingRequiresHuman(delegated = false): boolean {
  return !delegated;
}

/** Locations an operator can count on this machine. Not a hosted inventory ERP. */
export const COUNTABLE_LOCATIONS = ["ON_VAN", "BRANCH_STOCK", "CENTRAL_WAREHOUSE"] as const;
export type CountableLocation = (typeof COUNTABLE_LOCATIONS)[number];

export interface StockCountLine {
  sku: string;
  location: CountableLocation;
  quantity: number;
  /** Required when location is ON_VAN. */
  vanId?: string;
  /** Required for branch stock and the central warehouse. */
  placeId?: string;
  countedAt: string;
  countedBy: string;
}

export interface StockCountBook {
  instanceId: string;
  updatedAt: string;
  hostedInventory: false;
  liveErp: false;
  counts: StockCountLine[];
}

export function emptyStockBook(instanceId: string, at: string): StockCountBook {
  const id = instanceId.trim();
  if (!id) throw new Error("stock counts require a local instance id");
  return { instanceId: id, updatedAt: at, hostedInventory: false, liveErp: false, counts: [] };
}

export function stockCountKey(line: Pick<StockCountLine, "sku" | "location" | "vanId" | "placeId">): string {
  const sku = line.sku.trim();
  if (!sku) throw new Error("stock count requires a sku");
  if (line.location === "ON_VAN") {
    const vanId = line.vanId?.trim();
    if (!vanId) throw new Error("on-van count requires a van id");
    return `ON_VAN:${vanId}:${sku}`;
  }
  const placeId = line.placeId?.trim();
  if (!placeId) throw new Error("warehouse count requires a place id");
  return `${line.location}:${placeId}:${sku}`;
}

export function recordStockCount(book: StockCountBook, line: StockCountLine): StockCountBook {
  if (!Number.isInteger(line.quantity) || line.quantity < 0) {
    throw new Error("stock count must be a non-negative integer");
  }
  const key = stockCountKey(line);
  const counts = book.counts.filter((existing) => stockCountKey(existing) !== key);
  counts.push({
    sku: line.sku.trim(),
    location: line.location,
    quantity: line.quantity,
    vanId: line.location === "ON_VAN" ? line.vanId?.trim() : undefined,
    placeId: line.location === "ON_VAN" ? undefined : line.placeId?.trim(),
    countedAt: line.countedAt,
    countedBy: line.countedBy.trim() || "operator"
  });
  return { ...book, updatedAt: line.countedAt, hostedInventory: false, liveErp: false, counts };
}

/** Known on-van quantity, or null when that van/sku has not been counted. */
export function countOnVan(book: StockCountBook, vanId: string, sku: string): number | null {
  const line = book.counts.find((row) => row.location === "ON_VAN" && row.vanId === vanId && row.sku === sku);
  return line ? line.quantity : null;
}

/** Known warehouse quantity, or null when that sku has not been counted. */
export function countWarehouse(book: StockCountBook, sku: string, placeId?: string): number | null {
  const lines = book.counts.filter(
    (row) =>
      (row.location === "CENTRAL_WAREHOUSE" || row.location === "BRANCH_STOCK") &&
      row.sku === sku &&
      (placeId ? row.placeId === placeId : true)
  );
  if (!lines.length) return null;
  return lines.reduce((sum, row) => sum + row.quantity, 0);
}

export interface CountedPartDemand {
  callId: string;
  vanId: string;
  partNumber: string;
  quantity: number;
  /** Where to look when the counted van is short and a warehouse count can cover it. */
  location: StockLocation;
  urgency?: StockRequest["urgency"];
}

/**
 * Shortage requests use counted quantities.
 * A missing count is unknown, not zero, and does not invent a warehouse pull.
 */
export function fulfillmentQueueFromCounts(demand: readonly CountedPartDemand[], book: StockCountBook): StockRequest[] {
  const requests: StockRequest[] = [];
  for (const row of demand) {
    const onVan = countOnVan(book, row.vanId, row.partNumber);
    if (onVan == null || row.quantity <= onVan) continue;
    const short = row.quantity - onVan;
    const warehouse = countWarehouse(book, row.partNumber);
    const location: StockLocation =
      warehouse == null ? row.location : warehouse >= short ? (row.location === "ON_VAN" ? "BRANCH_STOCK" : row.location) : "BACKORDERED";
    requests.push({
      requestId: `sr:${row.callId}:${row.partNumber}`,
      callId: row.callId,
      vanId: row.vanId,
      partNumber: row.partNumber,
      quantity: short,
      location,
      step: "REQUESTED",
      urgency: row.urgency ?? "routine",
      replenishAfter: onVan === 0,
      shippingRequired: location === "SHIPPED" || location === "LOCAL_DISTRIBUTOR",
      procurementRequired: location === "BACKORDERED" || location === "LOCAL_DISTRIBUTOR" || (warehouse != null && warehouse < short)
    });
  }
  return requests;
}

export function assertLocalStockPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === "data/tenants" || normalized.startsWith("data/tenants/") || normalized.includes("/tenants/")) {
    throw new Error("hosted inventory layout is refused; stock counts stay on this machine");
  }
  return filePath;
}

/** Operator-machine path. JSON book plus a sibling JSONL of count events. */
export function defaultStockCountPath(instanceId: string, root = "data/runtime"): string {
  const id = instanceId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!id || id === "shared" || id === "hosted" || id === "tenants") {
    throw new Error("stock counts require a local instance id (not shared/hosted/tenants)");
  }
  return assertLocalStockPath(join(root, id, "stock-counts.json"));
}

export function writeStockBook(filePath: string, book: StockCountBook): void {
  assertLocalStockPath(filePath);
  if (book.hostedInventory !== false || book.liveErp !== false) {
    throw new Error("stock count file must not claim a hosted inventory ERP");
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify({ ...book, hostedInventory: false, liveErp: false }, null, 2)}\n`, "utf8");
}

export function readStockBook(filePath: string): StockCountBook {
  assertLocalStockPath(filePath);
  if (!existsSync(filePath)) throw new Error("stock count file is not on this machine");
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as StockCountBook;
  if (parsed.hostedInventory !== false || parsed.liveErp !== false) {
    throw new Error("stock count file claims a hosted inventory ERP");
  }
  return { ...parsed, hostedInventory: false, liveErp: false, counts: parsed.counts ?? [] };
}

export function readStockBookOrEmpty(filePath: string, instanceId: string, at: string): StockCountBook {
  assertLocalStockPath(filePath);
  if (!existsSync(filePath)) return emptyStockBook(instanceId, at);
  return readStockBook(filePath);
}

export function stockCountLogPath(bookPath: string): string {
  return bookPath.endsWith(".json") ? `${bookPath.slice(0, -".json".length)}.jsonl` : `${bookPath}.jsonl`;
}

/** Replace the current count for that key and append the event. Does not call a vendor. */
export function persistStockCount(args: { bookPath: string; book: StockCountBook; line: StockCountLine }): StockCountBook {
  const next = recordStockCount(args.book, args.line);
  writeStockBook(args.bookPath, next);
  const logPath = stockCountLogPath(args.bookPath);
  assertLocalStockPath(logPath);
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(
    logPath,
    `${JSON.stringify({ instanceId: next.instanceId, hostedInventory: false, liveErp: false, ...args.line })}\n`,
    "utf8"
  );
  return next;
}
