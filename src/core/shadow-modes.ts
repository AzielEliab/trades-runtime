export const SHADOW_MODES = ["SHADOW-SEALED", "SHADOW-VISIBLE", "ADVISE-LOCKED"] as const;
export type ShadowMode = (typeof SHADOW_MODES)[number];

export interface ShadowModeState {
  mode: ShadowMode;
  branchId: string;
  liveEffect: "none" | "display-only" | "human-gated";
  viewers: string;
}

export function parseShadowMode(value: string): ShadowMode {
  if ((SHADOW_MODES as readonly string[]).includes(value)) return value as ShadowMode;
  throw new Error(`unknown shadow mode: ${value}`);
}

export function shadowLiveEffect(mode: ShadowMode): ShadowModeState["liveEffect"] {
  if (mode === "ADVISE-LOCKED") return "human-gated";
  if (mode === "SHADOW-VISIBLE") return "display-only";
  return "none";
}

export function describeShadowMode(mode: ShadowMode, branchId: string): ShadowModeState {
  return {
    mode,
    branchId,
    liveEffect: shadowLiveEffect(mode),
    viewers:
      mode === "SHADOW-SEALED"
        ? "operator + designated managers"
        : "dispatch / warehouse / selected techs (display only)"
  };
}

export function dropVisibleToSealed(mode: ShadowMode): ShadowMode {
  return mode === "SHADOW-VISIBLE" ? "SHADOW-SEALED" : mode;
}

export function mayAdviseLock(mode: ShadowMode): boolean {
  return mode === "ADVISE-LOCKED";
}
