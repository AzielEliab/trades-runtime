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

export interface MissionDayBoard {
  branchId: string;
  day: string;
  openedAt: string;
  closesAt: string;
  clock: string;
  goals: MissionBoardRow[];
  lockedGoalIds: string[];
  lockHolders: Record<string, string>;
}

export function elapsedFractionOfDay(openedAt: string, clock: string, closesAt: string): number {
  const open = Date.parse(openedAt);
  const now = Date.parse(clock);
  const close = Date.parse(closesAt);
  if (![open, now, close].every(Number.isFinite) || close <= open) {
    throw new Error("mission clock requires a valid branch day window");
  }
  return Math.min(1, Math.max(0, (now - open) / (close - open)));
}

/** One branch, one day. KPIs recompute from the clock. */
export function openMissionDay(input: {
  branchId: string;
  day: string;
  openedAt: string;
  closesAt: string;
  clock: string;
  goals: Array<Omit<MissionGoal, "elapsedFraction" | "scope"> & { scope?: GoalScope }>;
}): MissionDayBoard {
  const elapsedFraction = elapsedFractionOfDay(input.openedAt, input.clock, input.closesAt);
  return {
    branchId: input.branchId,
    day: input.day,
    openedAt: input.openedAt,
    closesAt: input.closesAt,
    clock: input.clock,
    lockedGoalIds: [],
    lockHolders: {},
    goals: missionBoard(
      input.goals.map((goal) => ({
        ...goal,
        elapsedFraction,
        scope: goal.scope ?? "branch"
      }))
    )
  };
}

export function tickMissionClock(board: MissionDayBoard, clock: string): MissionDayBoard {
  const elapsedFraction = elapsedFractionOfDay(board.openedAt, clock, board.closesAt);
  return {
    ...board,
    clock,
    goals: missionBoard(board.goals.map((goal) => ({ ...goal, elapsedFraction })))
  };
}

export function applyCompletion(
  board: MissionDayBoard,
  measure: string,
  count: number,
  clock: string
): MissionDayBoard {
  const elapsed = tickMissionClock(board, clock);
  return {
    ...elapsed,
    goals: missionBoard(
      elapsed.goals.map((goal) =>
        goal.measure === measure ? { ...goal, actual: goal.actual + count, elapsedFraction: goal.elapsedFraction } : goal
      )
    )
  };
}

export function lockMissionGoal(
  board: MissionDayBoard,
  goalId: string,
  lockHolderId: string
): MissionDayBoard {
  if (!lockHolderId.trim()) {
    throw new Error("ACCEPT / OVERRIDE / LOCK requires a lock-holder id");
  }
  if (!board.goals.some((goal) => goal.id === goalId)) {
    throw new Error(`unknown mission goal: ${goalId}`);
  }
  return {
    ...board,
    lockedGoalIds: board.lockedGoalIds.includes(goalId) ? board.lockedGoalIds : [...board.lockedGoalIds, goalId],
    lockHolders: { ...board.lockHolders, [goalId]: lockHolderId }
  };
}

export interface MissionPaceExplanation {
  band: "not-started" | "behind" | "on-pace" | "ahead";
  why: string;
}

/** Plain-language pace band. A gap is not a forecast accuracy percent. */
export function explainMissionPace(
  goal: Pick<MissionBoardRow, "measure" | "actual" | "target" | "expectedPace" | "elapsedFraction">
): MissionPaceExplanation {
  const measure = goal.measure;
  if (goal.elapsedFraction <= 0) {
    return {
      band: "not-started",
      why: `Why: the mission clock is still at the open of the day, so ${measure} has no pace band yet. Target is ${goal.target}. Actual is ${goal.actual}.`
    };
  }
  const expected = goal.expectedPace.toFixed(2);
  const clock = `at day fraction ${goal.elapsedFraction.toFixed(2)}`;
  const slack = 0.05;
  if (goal.actual + slack < goal.expectedPace) {
    return {
      band: "behind",
      why: `Why: ${goal.actual} ${measure} are done and the clock expects about ${expected} ${clock}. The bar is actual against target ${goal.target}. The marker is that expected pace. A gap is not a forecast percent.`
    };
  }
  if (goal.actual > goal.expectedPace + slack) {
    return {
      band: "ahead",
      why: `Why: ${goal.actual} ${measure} are done, ahead of the clock's expected ${expected} ${clock}. Target is ${goal.target}. This is pace, not a forecast percent.`
    };
  }
  return {
    band: "on-pace",
    why: `Why: ${goal.actual} ${measure} sit with the clock's expected ${expected} ${clock}. Target is ${goal.target}. This is pace, not a forecast percent.`
  };
}

export function retargetGoal(board: MissionDayBoard, goalId: string, target: number): MissionDayBoard {
  if (board.lockedGoalIds.includes(goalId)) {
    throw new Error("locked mission goal cannot be retargeted");
  }
  return {
    ...board,
    goals: missionBoard(
      board.goals.map((goal) => (goal.id === goalId ? { ...goal, target, elapsedFraction: goal.elapsedFraction } : goal))
    )
  };
}
