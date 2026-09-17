import { mayAutonomousHighConsequence, type ConfidenceSeparation } from "../core/confidence.js";

export type GateStage = "Definition" | "Evidence" | "Impact" | "Integrity" | "Responsibility";
export type GateOutcome = "PASS" | "REVISE" | "BLOCK";

export interface GateCheck {
  stage: GateStage;
  ok: boolean;
  note: string;
}

export interface DecisionGateInput {
  action: string;
  highConsequence: boolean;
  defined: boolean;
  confidence: ConfidenceSeparation;
  impactAssessed: boolean;
  integrityOk: boolean;
  accountableHuman?: string;
  checks?: GateCheck[];
}

export interface DecisionGateResult {
  outcome: GateOutcome;
  failedStages: GateStage[];
}

export function evaluateDecisionGate(input: DecisionGateInput): DecisionGateResult {
  const failed: GateStage[] = [];
  if (!input.defined) failed.push("Definition");
  if (!mayAutonomousHighConsequence(input.confidence) && input.highConsequence) {
    failed.push("Evidence");
  }
  if (!input.impactAssessed && input.highConsequence) failed.push("Impact");
  if (!input.integrityOk) failed.push("Integrity");
  if (input.highConsequence && !input.accountableHuman) failed.push("Responsibility");

  for (const check of input.checks ?? []) {
    if (!check.ok && !failed.includes(check.stage)) failed.push(check.stage);
  }

  if (failed.includes("Integrity") || failed.includes("Evidence") || failed.includes("Responsibility")) {
    return { outcome: "BLOCK", failedStages: failed };
  }
  if (failed.length > 0) {
    return { outcome: "REVISE", failedStages: failed };
  }
  return { outcome: "PASS", failedStages: [] };
}
