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

export interface BookingBlockExplanation {
  block: BookingBlock;
  blocked: boolean;
  headline: string;
  why: string;
}

/** Human reason for recommendBlock. A recommendation, not a forecast percent. */
export function explainBookingBlock(args: {
  hardUnavailable: boolean;
  protectEmergency: boolean;
  demandSurge: boolean;
  actual: number;
  expectedPace: number;
  elapsedFraction: number;
}): BookingBlockExplanation {
  const block = recommendBlock(args);
  const pace = `Completed calls are ${args.actual}. Expected pace at this clock is ${args.expectedPace.toFixed(2)}. Day fraction is ${args.elapsedFraction.toFixed(2)}.`;
  const tail = "This is a local recommendation on this desk. Writes stay refused. It is not a forecast percent.";
  if (block === "CLOSED") {
    return {
      block,
      blocked: true,
      headline: "Booking is closed",
      why: `Why: the lane is hard-unavailable, so recommendBlock is CLOSED. ${pace} ${tail}`
    };
  }
  if (block === "PROTECTED") {
    return {
      block,
      blocked: true,
      headline: "Emergency capacity is protected",
      why: `Why: emergency protection is on, so recommendBlock is PROTECTED. ${pace} ${tail}`
    };
  }
  if (block === "BLOCK_NEW_BOOKING") {
    return {
      block,
      blocked: true,
      headline: "New booking is blocked",
      why: `Why: completions are behind expected pace after 60% of the mission day, so recommendBlock is BLOCK_NEW_BOOKING. ${pace} ${tail}`
    };
  }
  if (block === "HOLD") {
    return {
      block,
      blocked: true,
      headline: "Booking is on hold",
      why: `Why: recommendBlock is HOLD. ${pace} ${tail}`
    };
  }
  if (block === "RESCHEDULE_CANDIDATE") {
    return {
      block,
      blocked: true,
      headline: "This block marks a reschedule candidate",
      why: `Why: recommendBlock is RESCHEDULE_CANDIDATE. ${pace} ${tail}`
    };
  }
  return {
    block,
    blocked: false,
    headline: "Nothing is blocking new booking",
    why: `Why: recommendBlock is OPEN. Completions are not behind pace after 60% of the day, emergency protection is off, and the lane is not hard-unavailable. ${pace} ${tail}`
  };
}

export function existingCommitmentProtected(hasExistingBooking: boolean, silent: boolean): boolean {
  if (hasExistingBooking && silent) {
    throw new Error("never silently displace an existing customer");
  }
  return hasExistingBooking;
}
