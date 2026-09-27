import { adaptPartCost, type AdaptedPartCost } from "./pricebook.js";
import type { PatternEvidence } from "./regional-recalibration.js";

export interface JobEconomicsInput {
  revenue: number;
  warrantyRecovery: number;
  parts: number;
  procurement: number;
  loadedLabor: number;
  callbackRework: number;
  concessions: number;
  laborHours: number;
}

export interface PartCostLine {
  currentCost: number;
  lastCost: number;
  averageCost: number;
  quantity: number;
  evidence?: PatternEvidence;
}

export interface PartCostRollup {
  currentParts: number;
  lastParts: number;
  adaptedParts: number;
  costMove: number;
  marketWeight: number;
  weakened: boolean;
  lines: AdaptedPartCost[];
  subordinateToHuman: true;
  notASkillScore: true;
  note: string;
}

export interface JobEconomics {
  realizedContribution: number;
  marginPct: number | null;
  contributionPerLaborHour: number | null;
}

export function reconcileJob(input: JobEconomicsInput): JobEconomics {
  const realizedContribution =
    input.revenue +
    input.warrantyRecovery -
    input.parts -
    input.procurement -
    input.loadedLabor -
    input.callbackRework -
    input.concessions;
  return {
    realizedContribution,
    marginPct: input.revenue === 0 ? null : realizedContribution / input.revenue,
    contributionPerLaborHour: input.laborHours === 0 ? null : realizedContribution / input.laborHours
  };
}

/** Contribution per labor hour is never a skill score. */
export function asSkillScore(_economics: JobEconomics): never {
  throw new Error("revenue, margin, and contribution/hour are not technician skill");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Parts dollars from current cost, last cost, and the regional adaptation ladder. */
export function rollupPartCosts(lines: readonly PartCostLine[]): PartCostRollup {
  const adapted = lines.map((line) => ({
    quantity: line.quantity,
    signal: adaptPartCost(line, line.evidence)
  }));
  const currentParts = roundMoney(adapted.reduce((sum, line) => sum + line.signal.currentCost * line.quantity, 0));
  const lastParts = roundMoney(adapted.reduce((sum, line) => sum + line.signal.lastCost * line.quantity, 0));
  const adaptedParts = roundMoney(adapted.reduce((sum, line) => sum + line.signal.adaptedCost * line.quantity, 0));
  const weightBase = adapted.reduce((sum, line) => sum + Math.max(line.quantity, 0), 0);
  const marketWeight =
    weightBase === 0
      ? 0
      : roundMoney(adapted.reduce((sum, line) => sum + line.signal.marketWeight * line.quantity, 0) / weightBase);
  const weakened = adapted.length === 0 || adapted.some((line) => line.signal.weakened);
  return {
    currentParts,
    lastParts,
    adaptedParts,
    costMove: roundMoney(currentParts - lastParts),
    marketWeight,
    weakened,
    lines: adapted.map((line) => line.signal),
    subordinateToHuman: true,
    notASkillScore: true,
    note: weakened
      ? "Adapted parts stay near current cost where regional evidence is thin, stale, or conflicted. Last cost is the previous observation. This rollup is not a skill score."
      : "Adapted parts blend current cost toward the broader average only as far as regional evidence supports. This rollup is not a skill score."
  };
}

/**
 * Job contribution uses adapted part cost (current, last, and market weight).
 * The result is still not a technician skill score.
 */
export function reconcileJobWithPartCosts(
  input: Omit<JobEconomicsInput, "parts">,
  lines: readonly PartCostLine[]
): JobEconomics & { partCost: PartCostRollup; notASkillScore: true } {
  const partCost = rollupPartCosts(lines);
  return {
    ...reconcileJob({ ...input, parts: partCost.adaptedParts }),
    partCost,
    notASkillScore: true
  };
}
