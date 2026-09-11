import { appendRecord, emptyChain, type FullDayTrajectoryRecord } from "../core/chains.js";

export interface TrajectoryState {
  dayId: string;
  chain: ReturnType<typeof emptyChain<FullDayTrajectoryRecord>>;
  current: Record<string, unknown>;
}

function rec(
  partial: Omit<FullDayTrajectoryRecord, "chain" | "prevRecordId">
): FullDayTrajectoryRecord {
  return { ...partial, chain: "A" };
}

export function openMorningPlan(dayId: string, plan: Record<string, unknown>, at: string): TrajectoryState {
  const chain = appendRecord(
    emptyChain<FullDayTrajectoryRecord>("A"),
    rec({
      recordId: `${dayId}:morning`,
      at,
      kind: "morning-plan",
      plannedState: plan
    })
  );
  return { dayId, chain, current: plan };
}

export function rebaseFromActual(
  state: TrajectoryState,
  actual: Record<string, unknown>,
  at: string,
  note?: string
): TrajectoryState {
  const next = appendRecord(
    state.chain,
    rec({
      recordId: `${state.dayId}:rebase:${state.chain.records.length}`,
      at,
      kind: "rebase",
      plannedState: state.current,
      actualState: actual,
      note
    })
  );
  return { dayId: state.dayId, chain: next, current: actual };
}

export function closeDay(state: TrajectoryState, at: string): TrajectoryState {
  const next = appendRecord(
    state.chain,
    rec({
      recordId: `${state.dayId}:close`,
      at,
      kind: "close",
      plannedState: state.current,
      actualState: state.current
    })
  );
  return { ...state, chain: next };
}
