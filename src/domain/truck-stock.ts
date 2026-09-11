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
}): StockAction {
  if (input.consumption === 0 && input.carryingCost > 0.5) return "eliminate";
  if (input.firstTripRate < 0.6) return "increase";
  if (input.explorationNeed && input.consumption < 1) return "hold-min";
  if (input.consumption > 3) return "add";
  return "reduce";
}

export function recommendVanProfile(profile: VanStockProfile): Array<{ sku: string; action: StockAction }> {
  const skus = new Set([...Object.keys(profile.consumption), ...Object.keys(profile.predictedDemand)]);
  return [...skus].map((sku) => ({
    sku,
    action: recommendVanStock({
      consumption: profile.consumption[sku] ?? 0,
      firstTripRate: profile.firstTripRate,
      carryingCost: profile.carryingCost,
      explorationNeed: profile.explorationNeed
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
