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
  const behavior = flagHandoffBehavior(input);
  const record: CoordinationRecord = {
    chain: "D",
    ...input,
    failureType,
    polarity: behavior.polarity,
    behaviorKind: behavior.kind
  };
  return { chain: appendRecord(chain, record), failureType, behavior };
}

/** Last person touching a broken workflow is not automatically its cause. */
export function systemBeforeBlame(failureType: FailureType | undefined): "system" | "human" | "unknown" {
  if (!failureType) return "unknown";
  if (failureType === "human-execution-error") return "human";
  return "system";
}

export const BEHAVIOR_POLARITIES = ["positive", "negative"] as const;
export type BehaviorPolarity = (typeof BEHAVIOR_POLARITIES)[number];

export type BehaviorSource = "chain-d" | "cross-trade" | "recognition";

export interface DepartmentBehaviorFlag {
  flagId: string;
  polarity: BehaviorPolarity;
  source: BehaviorSource;
  fromRole: string;
  toRole: string;
  kind: string;
  summary: string;
  attribution: "system" | "human" | "unknown";
  /** True only when a caller explicitly names a human-execution cause. Default is false. */
  lastPersonBlamed: boolean;
  systemBeforeBlame: true;
}

export interface DepartmentBehaviorBoard {
  positive: DepartmentBehaviorFlag[];
  negative: DepartmentBehaviorFlag[];
  systemBeforeBlame: true;
  lastPersonBlamedByDefault: false;
  note: string;
}

function behaviorFlag(input: {
  flagId: string;
  polarity: BehaviorPolarity;
  source: BehaviorSource;
  fromRole: string;
  toRole: string;
  kind: string;
  summary: string;
  attribution: "system" | "human" | "unknown";
  blameLastPerson?: boolean;
}): DepartmentBehaviorFlag {
  const lastPersonBlamed = input.blameLastPerson === true && input.attribution === "human";
  return {
    flagId: input.flagId,
    polarity: input.polarity,
    source: input.source,
    fromRole: input.fromRole,
    toRole: input.toRole,
    kind: input.kind,
    summary: input.summary,
    attribution: input.attribution,
    lastPersonBlamed,
    systemBeforeBlame: true
  };
}

/** A completed, acknowledged handoff is a good flag. A classified miss is a bad flag. */
export function flagHandoffBehavior(input: HandoffInput & { blameLastPerson?: boolean }): DepartmentBehaviorFlag {
  const failureType = classifyHandoff(input);
  if (!failureType) {
    return behaviorFlag({
      flagId: `d:${input.recordId}:positive`,
      polarity: "positive",
      source: "chain-d",
      fromRole: input.fromRole,
      toRole: input.toRole,
      kind: "clean-handoff",
      summary: `${input.fromRole} handed ${input.expectedAction} to ${input.toRole} and it was acknowledged. This is a good handoff, not a score of either person.`,
      attribution: "unknown"
    });
  }
  const attribution = systemBeforeBlame(failureType);
  return behaviorFlag({
    flagId: `d:${input.recordId}:negative`,
    polarity: "negative",
    source: "chain-d",
    fromRole: input.fromRole,
    toRole: input.toRole,
    kind: failureType,
    summary: `${failureType} between ${input.fromRole} and ${input.toRole}. Attribution is ${attribution}. The last person to touch the workflow is not the cause unless a human names that cause.`,
    attribution,
    blameLastPerson: input.blameLastPerson
  });
}

/** Named Chain D failure, including types classifyHandoff does not infer on its own. */
export function flagNamedFailure(input: {
  recordId: string;
  fromRole: string;
  toRole: string;
  failureType: FailureType;
  blameLastPerson?: boolean;
}): DepartmentBehaviorFlag {
  const attribution = systemBeforeBlame(input.failureType);
  return behaviorFlag({
    flagId: `d:${input.recordId}:negative`,
    polarity: "negative",
    source: "chain-d",
    fromRole: input.fromRole,
    toRole: input.toRole,
    kind: input.failureType,
    summary: `${input.failureType} between ${input.fromRole} and ${input.toRole}. Attribution is ${attribution}. The last person is not blamed unless a human names that cause.`,
    attribution,
    blameLastPerson: input.blameLastPerson
  });
}

export function collectDepartmentFlags(flags: readonly DepartmentBehaviorFlag[]): DepartmentBehaviorBoard {
  return {
    positive: flags.filter((flag) => flag.polarity === "positive"),
    negative: flags.filter((flag) => flag.polarity === "negative"),
    systemBeforeBlame: true,
    lastPersonBlamedByDefault: false,
    note: "Good handoffs and bad coordination are both listed. The last person to touch a broken workflow is not its cause by default."
  };
}
