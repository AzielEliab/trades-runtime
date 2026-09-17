import { sha256 } from "../core/hash.js";
import type { ConfidenceSeparation } from "../core/confidence.js";

export interface SealedCounterfactual {
  sealedAt: string;
  evidenceLockHash: string;
  action: string;
  expected: Record<string, unknown>;
  confidence: ConfidenceSeparation;
  knownInputs: Record<string, unknown>;
}

export interface ShadowSettlement {
  sealed: SealedCounterfactual;
  actual: Record<string, unknown>;
  deltas: Record<string, { expected: unknown; actual: unknown }>;
  hindsightLeak: false;
}

export function sealCounterfactual(input: {
  knownInputs: Record<string, unknown>;
  action: string;
  expected: Record<string, unknown>;
  confidence: ConfidenceSeparation;
  sealedAt: string;
}): SealedCounterfactual {
  return {
    sealedAt: input.sealedAt,
    evidenceLockHash: sha256(input.knownInputs),
    action: input.action,
    expected: input.expected,
    confidence: input.confidence,
    knownInputs: input.knownInputs
  };
}

export function settleShadow(
  sealed: SealedCounterfactual,
  actual: Record<string, unknown>,
  lateInformation?: Record<string, unknown>
): ShadowSettlement {
  if (lateInformation && Object.keys(lateInformation).length > 0) {
    const leaked = sha256({ ...sealed.knownInputs, ...lateInformation }) !== sealed.evidenceLockHash;
    if (leaked) {
      throw new Error("hindsight leakage: late information cannot mutate a sealed counterfactual");
    }
  }
  const deltas: ShadowSettlement["deltas"] = {};
  const keys = new Set([...Object.keys(sealed.expected), ...Object.keys(actual)]);
  for (const key of keys) {
    if (sealed.expected[key] !== actual[key]) {
      deltas[key] = { expected: sealed.expected[key], actual: actual[key] };
    }
  }
  return { sealed, actual, deltas, hindsightLeak: false };
}
