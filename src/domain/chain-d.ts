import { appendRecord, emptyChain, type CoordinationRecord } from "../core/chains.js";

export const FAILURE_TYPES = [
  "missing-information",
  "stale-information",
  "contradictory-information",
  "delayed-handoff",
  "unacknowledged-handoff",
  "unclear-ownership",
  "incorrect-routing",
  "duplicate-work",
  "integration-failure",
  "policy-conflict",
  "authorization-bottleneck",
  "capacity-bottleneck",
  "human-execution-error"
] as const;

export type FailureType = (typeof FAILURE_TYPES)[number];

export interface HandoffInput {
  recordId: string;
  at: string;
  fromRole: string;
  toRole: string;
  expectedAction: string;
  actualAction?: string;
  acknowledged: boolean;
  knowledgeAtOrigin: Record<string, unknown>;
  knowledgeAtRecipient?: Record<string, unknown>;
}

export function classifyHandoff(input: HandoffInput): FailureType | undefined {
  if (!input.actualAction) return "missing-information";
  if (!input.acknowledged) return "unacknowledged-handoff";
  if (input.knowledgeAtRecipient && input.knowledgeAtOrigin.ready !== input.knowledgeAtRecipient.ready) {
    return "stale-information";
  }
  if (input.actualAction !== input.expectedAction) return "incorrect-routing";
  return undefined;
}

export function reconstructHandoff(
  chain: ReturnType<typeof emptyChain<CoordinationRecord>>,
  input: HandoffInput
) {
  const failureType = classifyHandoff(input);
  const record: CoordinationRecord = {
    chain: "D",
    ...input,
    failureType
  };
  return { chain: appendRecord(chain, record), failureType };
}

/** Last person touching a broken workflow is not automatically its cause. */
export function systemBeforeBlame(failureType: FailureType | undefined): "system" | "human" | "unknown" {
  if (!failureType) return "unknown";
  if (failureType === "human-execution-error") return "human";
  return "system";
}
