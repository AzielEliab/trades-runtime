import {
  grantAuthority,
  type ActorRegistry
} from "./actor-registry.js";
import { applyEngagement, isEngagementViolation, type EngagementSignal } from "./engagement-rules.js";
import { parseShadowMode, type ShadowMode } from "./shadow-modes.js";

/**
 * One named branch. Option C software scaffolding only.
 * Pilot is not started. Never auto-promote SHADOW-SEALED → SHADOW-VISIBLE.
 */
export interface OneBranchShadowConfig {
  branchId: string;
  mode: ShadowMode;
  autoPromote: false;
  pilotStarted: false;
  fieldLaunch: false;
  optionC: "code-ready-pilot-not-started";
  optionD: "not-started";
}

export interface ShadowModeChangeRequest {
  kind: "auto" | "explicit";
  engagement?: EngagementSignal;
  registry?: ActorRegistry;
  actorId?: string;
  lockHolderId?: string;
  at?: string;
}

export function createOneBranchShadowConfig(input: {
  branchId: string;
  mode?: ShadowMode | string;
}): OneBranchShadowConfig {
  const branchId = input.branchId.trim();
  if (!branchId) {
    throw new Error("one-branch shadow requires a named branchId");
  }
  return {
    branchId,
    mode: parseShadowMode(input.mode ?? "SHADOW-SEALED"),
    autoPromote: false,
    pilotStarted: false,
    fieldLaunch: false,
    optionC: "code-ready-pilot-not-started",
    optionD: "not-started"
  };
}

function gateAdviseLocked(config: OneBranchShadowConfig, request: ShadowModeChangeRequest): void {
  if (!request.registry || !request.actorId?.trim() || !request.lockHolderId?.trim() || !request.at?.trim()) {
    throw new Error("ADVISE-LOCKED requires a named lock-holder in the actor registry");
  }
  grantAuthority(request.registry, {
    actorId: request.actorId,
    action: "LOCK",
    branchId: config.branchId,
    lockHolderId: request.lockHolderId,
    at: request.at
  });
}

/**
 * Mode changes are explicit. Auto-promote SEALED → VISIBLE is refused.
 * Engagement violations on VISIBLE drop back to SEALED.
 * ADVISE-LOCKED stays gated on the actor registry.
 */
export function requestShadowModeChange(
  config: OneBranchShadowConfig,
  next: ShadowMode,
  request: ShadowModeChangeRequest
): OneBranchShadowConfig {
  const engagement = applyEngagement(config.mode, request.engagement);
  if (engagement.droppedToSealed) {
    return { ...config, mode: "SHADOW-SEALED", autoPromote: false, pilotStarted: false, fieldLaunch: false };
  }

  if (config.mode === next) {
    return { ...config, autoPromote: false, pilotStarted: false, fieldLaunch: false };
  }

  if (config.mode === "SHADOW-SEALED" && next === "SHADOW-VISIBLE" && request.kind !== "explicit") {
    throw new Error("never auto-promote SHADOW-SEALED to SHADOW-VISIBLE");
  }

  if (next === "ADVISE-LOCKED") {
    gateAdviseLocked(config, request);
  }

  if (next === "SHADOW-VISIBLE" && isEngagementViolation(request.engagement ?? {})) {
    return { ...config, mode: "SHADOW-SEALED", autoPromote: false, pilotStarted: false, fieldLaunch: false };
  }

  return {
    ...config,
    mode: next,
    autoPromote: false,
    pilotStarted: false,
    fieldLaunch: false
  };
}
