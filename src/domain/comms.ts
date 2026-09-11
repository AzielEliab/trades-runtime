export const CHANNEL_KINDS = [
  "company",
  "branch",
  "department",
  "trade",
  "dispatch",
  "sales",
  "field",
  "warehouse",
  "project",
  "incident"
] as const;

export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export type ChannelState = "active" | "archived";

export interface Channel {
  channelId: string;
  kind: ChannelKind;
  title: string;
  state: ChannelState;
  createdBy: string;
  moderators: string[];
}

export function createChannel(input: Omit<Channel, "state"> & { state?: ChannelState }): Channel {
  return { ...input, state: input.state ?? "active" };
}

export function archiveChannel(channel: Channel, actorId: string): Channel {
  if (!channel.moderators.includes(actorId)) {
    throw new Error("only a moderator can archive a channel");
  }
  return { ...channel, state: "archived" };
}

export type RecognitionKind =
  | "successful-repair"
  | "turnover-closed"
  | "difficult-job"
  | "high-value-quality"
  | "duration-adjusted-quality";

export interface RecognitionCandidate {
  kind: RecognitionKind;
  revenue: number;
  qualityOk: boolean;
  callbackAcceptable: boolean;
  firstTrip?: boolean;
  difficultyNormalized?: boolean;
  /** If true, the only proposed signal is revenue. Always refused. */
  rawRevenueOnly?: boolean;
}

/** Constitutional: recognition must not reward raw revenue alone. */
export function rewardRawRevenueAlone(): false {
  return false;
}

/** Recognition is context-aware and must not reward raw revenue alone. */
export function mayRecognize(candidate: RecognitionCandidate): boolean {
  if (candidate.rawRevenueOnly) return false;
  if (!candidate.qualityOk || !candidate.callbackAcceptable) return false;
  if (candidate.kind === "difficult-job" && !candidate.difficultyNormalized) return false;
  if (candidate.kind === "duration-adjusted-quality" && !candidate.firstTrip && !candidate.difficultyNormalized) {
    return false;
  }
  return true;
}

export interface TurnoverAttribution {
  originatingVanId: string;
  closingComfortAdvisorId: string;
}

/** Replacement turnovers preserve both the originating Van and the closing Comfort Advisor. */
export function turnoverAttribution(input: TurnoverAttribution): TurnoverAttribution {
  if (!input.originatingVanId || !input.closingComfortAdvisorId) {
    throw new Error("turnover recognition requires originating Van and closing Comfort Advisor");
  }
  return { ...input };
}

export interface MissionGoal {
  id: string;
  measure: string;
  target: number;
  actual: number;
  elapsedFraction: number;
}

export interface MissionBoardRow extends MissionGoal {
  expectedPace: number;
  remainingGap: number;
  projectedFinish: number;
}

export function missionBoard(goals: MissionGoal[]): MissionBoardRow[] {
  return goals.map((goal) => {
    const expectedPace = goal.target * goal.elapsedFraction;
    const remainingGap = goal.target - goal.actual;
    const projectedFinish = goal.elapsedFraction === 0 ? 0 : goal.actual / goal.elapsedFraction;
    return { ...goal, expectedPace, remainingGap, projectedFinish };
  });
}
