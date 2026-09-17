export type BookingBlock =
  | "OPEN"
  | "HOLD"
  | "BLOCK_NEW_BOOKING"
  | "PROTECTED"
  | "RESCHEDULE_CANDIDATE"
  | "CLOSED";

export type ConstraintKind = "hard" | "soft";
export type UrgencyClass = "emergency" | "urgent" | "priority" | "routine" | "maintenance";

export interface RescheduleRisk {
  onTimeProbability: number;
  rescheduleProbability: number;
  expectedStartRange: [number, number];
  expectedCompletionRange: [number, number];
  emergencyDisplacementRisk: number;
  technicianOverrunRisk: number;
  customerFlexibility: number | null;
  downstreamScheduleImpact: number;
}

export function latestSafeDispatch(args: {
  mustLeaveByMinutes: number;
  predictedDuration: number;
  uncertaintyBuffer: number;
  travelReturn: number;
}): number {
  return args.mustLeaveByMinutes - args.predictedDuration - args.uncertaintyBuffer - args.travelReturn;
}

export function scoreRescheduleRisk(partial: Omit<RescheduleRisk, "rescheduleProbability"> & { rescheduleProbability?: number }): RescheduleRisk {
  const rescheduleProbability = partial.rescheduleProbability ?? 1 - partial.onTimeProbability;
  return { ...partial, rescheduleProbability };
}

export function recommendBlock(args: {
  hardUnavailable: boolean;
  protectEmergency: boolean;
  demandSurge: boolean;
}): BookingBlock {
  if (args.hardUnavailable) return "CLOSED";
  if (args.protectEmergency) return "PROTECTED";
  if (args.demandSurge) return "BLOCK_NEW_BOOKING";
  return "OPEN";
}

export function existingCommitmentProtected(hasExistingBooking: boolean, silent: boolean): boolean {
  if (hasExistingBooking && silent) {
    throw new Error("never silently displace an existing customer");
  }
  return hasExistingBooking;
}
