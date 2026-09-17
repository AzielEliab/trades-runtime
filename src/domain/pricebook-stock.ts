/**
 * @deprecated TR-AUDIT-2026-09-17 F10.
 * Canonical paths: `src/domain/pricebook.ts` and `src/domain/truck-stock.ts`.
 * Do not add new imports here.
 */
export const DEPRECATED_PRICEBOOK_STOCK_BARREL =
  "use src/domain/pricebook.ts and src/domain/truck-stock.ts" as const;

export {
  applyManagerDecision,
  applyShadowBaseline,
  collectEvidenceWhileLocked,
  recommendFromShadowBaseline,
  refuseLockedAutoRecalibrate,
  type ManagerDecision,
  type PricebookInputs,
  type PricebookRecommendation
} from "./pricebook.js";

export {
  FULFILLMENT_STEPS,
  STOCK_LOCATIONS,
  advanceFulfillment,
  applyLocationToEconomics,
  economicsForLocation,
  firstTripProbability,
  fulfillmentQueueFromDemand,
  procurementBurden,
  purchasingRequiresHuman,
  recommendVanProfile,
  recommendVanStock,
  type FulfillmentStep,
  type JobPartDemand,
  type StockAction,
  type StockLocation,
  type StockRequest,
  type VanStockProfile
} from "./truck-stock.js";
