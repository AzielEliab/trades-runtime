export const GOAL_SCOPES = ["company", "region", "branch", "team", "role"] as const;
export type GoalScope = (typeof GOAL_SCOPES)[number];

export const CORE_MEASURES = [
  "repair-service-sales",
  "equipment-sales",
  "calls-completed",
  "turnovers-generated",
  "turnovers-closed",
  "first-trip-completion"
] as const;

export type CoreMeasure = (typeof CORE_MEASURES)[number];

export interface MissionGoal {
  id: string;
  measure: string;
  target: number;
  actual: number;
  elapsedFraction: number;
  scope?: GoalScope;
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

export function forScope(rows: MissionBoardRow[], scope: GoalScope): MissionBoardRow[] {
  return rows.filter((row) => row.scope === scope);
}
