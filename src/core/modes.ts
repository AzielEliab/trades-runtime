export const OPERATING_MODES = [
  "Watcher",
  "Shadow",
  "Recommendation",
  "HumanApproved",
  "LimitedAutonomy",
  "Autonomous"
] as const;

export type OperatingMode = (typeof OPERATING_MODES)[number];

export interface BranchOperatingState {
  branchId: string;
  mode: OperatingMode;
  subsystemModes?: Partial<Record<string, OperatingMode>>;
}

export function parseOperatingMode(value: string): OperatingMode {
  if ((OPERATING_MODES as readonly string[]).includes(value)) {
    return value as OperatingMode;
  }
  throw new Error(`unknown operating mode: ${value}`);
}

export function canWriteBack(mode: OperatingMode): boolean {
  return mode === "LimitedAutonomy" || mode === "Autonomous";
}

export function isObserveOnly(mode: OperatingMode): boolean {
  return mode === "Watcher" || mode === "Shadow";
}

export function mayRecommend(mode: OperatingMode): boolean {
  return mode !== "Watcher";
}
