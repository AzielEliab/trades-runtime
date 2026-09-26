import type { CallFlag } from "../domain/call-class.js";
import { isNotClassified } from "../domain/call-class.js";

/**
 * Loopback weekly callback rate by trade lane.
 * The numerator is explicit callback labels. Unknown is not a callback.
 */

const LANE_ORDER = ["hvac", "plumbing", "electrical", "sewer", "cross-trades", "unnamed"];

export interface CallbackRate {
  callbacks: number;
  calls: number;
  /** Null when the lane has no calls, so a rate is not invented. */
  value: number | null;
}

export interface LaneCallbackWeek {
  lane: string;
  calls: number;
  callbacks: number;
  warranty: number;
  notClassified: number;
  callbackRate: CallbackRate;
  note: string;
}

export interface WeeklyCallbackDigest {
  product: "trades-runtime";
  version: string;
  author: "Aziel Eliab";
  generatedAt: string;
  live_backends: false;
  writes: false;
  phoneHome: false;
  pilot_started: false;
  loopback: true;
  window: "trailing-7-days";
  weekStart: string;
  weekEnd: string;
  source: "synthetic-sample" | "admitted-jobs";
  note: string;
  lanes: LaneCallbackWeek[];
  totals: {
    calls: number;
    callbacks: number;
    warranty: number;
    notClassified: number;
    callbackRate: CallbackRate;
  };
}

export interface WeekCall {
  lane: string | null;
  day: string;
  callback: CallFlag;
  warranty: CallFlag;
}

export function trailingWeek(missionDay: string): { weekStart: string; weekEnd: string } {
  const end = Date.parse(`${missionDay}T00:00:00Z`);
  if (!Number.isFinite(end)) return { weekStart: missionDay, weekEnd: missionDay };
  const start = new Date(end - 6 * 24 * 60 * 60 * 1000);
  return { weekStart: start.toISOString().slice(0, 10), weekEnd: missionDay };
}

function rate(callbacks: number, calls: number): CallbackRate {
  if (calls === 0) return { callbacks: 0, calls: 0, value: null };
  return { callbacks, calls, value: callbacks / calls };
}

function laneNote(lane: string, callbacks: number, calls: number): string {
  const head = `${callbacks} explicit callback labels divided by ${calls} calls on ${lane} in this local week.`;
  if (lane === "unnamed") {
    return `${head} No known trade token. A city name is not a lane.`;
  }
  return head;
}

export function buildWeeklyCallbackDigest(args: {
  version: string;
  generatedAt: string;
  source: WeeklyCallbackDigest["source"];
  missionDay: string;
  calls: readonly WeekCall[];
}): WeeklyCallbackDigest {
  const { weekStart, weekEnd } = trailingWeek(args.missionDay);
  const buckets = new Map<string, { calls: number; callbacks: number; warranty: number; notClassified: number }>();
  for (const call of args.calls) {
    if (call.day < weekStart || call.day > weekEnd) continue;
    const lane = call.lane ?? "unnamed";
    const bucket = buckets.get(lane) ?? { calls: 0, callbacks: 0, warranty: 0, notClassified: 0 };
    bucket.calls += 1;
    if (call.callback === "yes") bucket.callbacks += 1;
    if (call.warranty === "yes") bucket.warranty += 1;
    if (isNotClassified(call)) bucket.notClassified += 1;
    buckets.set(lane, bucket);
  }

  const lanes = [...buckets.entries()]
    .map(([lane, bucket]) => ({
      lane,
      calls: bucket.calls,
      callbacks: bucket.callbacks,
      warranty: bucket.warranty,
      notClassified: bucket.notClassified,
      callbackRate: rate(bucket.callbacks, bucket.calls),
      note: laneNote(lane, bucket.callbacks, bucket.calls)
    }))
    .sort((a, b) => {
      const ai = LANE_ORDER.indexOf(a.lane);
      const bi = LANE_ORDER.indexOf(b.lane);
      if (ai === -1 && bi === -1) return a.lane.localeCompare(b.lane);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  const totals = lanes.reduce(
    (sum, lane) => {
      sum.calls += lane.calls;
      sum.callbacks += lane.callbacks;
      sum.warranty += lane.warranty;
      sum.notClassified += lane.notClassified;
      return sum;
    },
    { calls: 0, callbacks: 0, warranty: 0, notClassified: 0 }
  );

  const empty = totals.calls === 0;
  const note = empty
    ? `No calls fall in the trailing 7 days ending ${weekEnd}, so a callback rate is not invented. Unknown is not a callback. Loopback only. Not a coverage decision and not a skill score.`
    : `Callback rate by trade lane for the trailing 7 days ${weekStart} through ${weekEnd}. The numerator is explicit callback labels. Unknown is not a callback. Rows without a known trade token sit in unnamed. A city name is not a lane. Loopback only. Not a coverage decision and not a skill score.`;

  return {
    product: "trades-runtime",
    version: args.version,
    author: "Aziel Eliab",
    generatedAt: args.generatedAt,
    live_backends: false,
    writes: false,
    phoneHome: false,
    pilot_started: false,
    loopback: true,
    window: "trailing-7-days",
    weekStart,
    weekEnd,
    source: args.source,
    note,
    lanes,
    totals: { ...totals, callbackRate: rate(totals.callbacks, totals.calls) }
  };
}
