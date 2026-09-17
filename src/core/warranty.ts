export const WARRANTY_STATES = [
  "CONFIRMED",
  "NOT_COVERED",
  "POSSIBLE",
  "UNKNOWN",
  "LOOKUP_FAILED"
] as const;

export type WarrantyState = (typeof WARRANTY_STATES)[number];

/** Unknown / lookup-failed never silently become not-covered. */
export function freezeWarrantyState(state: WarrantyState): WarrantyState {
  return state;
}

export function isCovered(state: WarrantyState): boolean {
  return state === "CONFIRMED";
}

export function mayTreatAsNotCovered(state: WarrantyState): boolean {
  return state === "NOT_COVERED";
}
