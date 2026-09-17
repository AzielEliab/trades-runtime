import type { CallFitFactors } from "./call-fit.js";
import type { NeighborhoodPattern } from "./neighborhood-failure-patterns.js";
import { mayCallVerifiedSubjectDefect } from "./neighborhood-failure-patterns.js";
import type { StockAction } from "./truck-stock.js";
import type { WeatherFeatures } from "./weather-demand.js";
import type { ReportMetadata } from "./analytics.js";

export const DOWNSTREAM_SUBSYSTEMS = [
  "field-advisor",
  "call-fit",
  "truck-stock",
  "warehouse",
  "training",
  "pricebook",
  "weather",
  "property-value",
  "analytics"
] as const;

export type DownstreamSubsystem = (typeof DOWNSTREAM_SUBSYSTEMS)[number];

export interface IntelligenceHook<T = Record<string, unknown>> {
  subsystem: DownstreamSubsystem;
  live: false;
  treatedAsVerifiedPropertyFact: false;
  payload: T;
}

function hook<T>(subsystem: DownstreamSubsystem, payload: T): IntelligenceHook<T> {
  return { subsystem, live: false, treatedAsVerifiedPropertyFact: false, payload };
}

/** Field Advisor: locally elevated failure modes as inspection hypotheses, not defects. */
export function hookFieldAdvisor(patterns: NeighborhoodPattern[]): IntelligenceHook<{
  hypotheses: string[];
  verifiedDefects: string[];
}> {
  return hook("field-advisor", {
    hypotheses: patterns.filter((p) => !mayCallVerifiedSubjectDefect(p)).map((p) => p.patternClass),
    verifiedDefects: patterns.filter(mayCallVerifiedSubjectDefect).map((p) => p.patternClass)
  });
}

/** Call-Fit: local issue class is a matching factor; governing dispatch constraints still win. */
export function hookCallFit(
  factors: CallFitFactors,
  localIssueFit: number
): IntelligenceHook<{ factors: CallFitFactors; geographyStillNotSole: true }> {
  const clamped = Math.max(0, Math.min(0.15, localIssueFit));
  return hook("call-fit", {
    factors: {
      ...factors,
      technicalFit: Math.min(1, factors.technicalFit + clamped),
      competence: factors.competence
    },
    geographyStillNotSole: true
  });
}

export function hookTruckStock(patterns: NeighborhoodPattern[]): IntelligenceHook<{
  skuHints: string[];
  action: StockAction;
}> {
  return hook("truck-stock", {
    skuHints: patterns.map((p) => p.patternClass),
    action: patterns.some((p) => p.riskLevel === "high") ? "increase" : "hold-min"
  });
}

export function hookWarehouse(patterns: NeighborhoodPattern[]): IntelligenceHook<{
  preposition: string[];
  liveProcurement: false;
}> {
  return hook("warehouse", {
    preposition: patterns.filter((p) => p.comparableCaseCount >= 5).map((p) => p.patternClass),
    liveProcurement: false
  });
}

export function hookTraining(patterns: NeighborhoodPattern[]): IntelligenceHook<{ emergingClasses: string[] }> {
  return hook("training", {
    emergingClasses: patterns.filter((p) => p.kind === "ObservedNeighborhoodPattern").map((p) => p.patternClass)
  });
}

export function hookPricebook(regionalRuntimeBias: number): IntelligenceHook<{
  runtimeBiasHours: number;
  autoWrite: false;
}> {
  return hook("pricebook", { runtimeBiasHours: regionalRuntimeBias, autoWrite: false });
}

export function hookWeather(
  features: WeatherFeatures,
  clusterCount: number
): IntelligenceHook<{ environmentalHypothesis: boolean; clusterCount: number }> {
  return hook("weather", {
    environmentalHypothesis: Boolean(features.freezeThaw || features.heavyRain || features.extremeEvent),
    clusterCount
  });
}

export function hookAnalytics(meta: Pick<ReportMetadata, "scope" | "status">): IntelligenceHook<{
  allowed: Array<"heatmap" | "cohort" | "probability" | "regional-pattern">;
  status: ReportMetadata["status"];
}> {
  return hook("analytics", {
    allowed: ["heatmap", "cohort", "probability", "regional-pattern"],
    status: meta.status
  });
}
