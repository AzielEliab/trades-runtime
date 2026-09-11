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
