import type { CallFlag } from "./call-class.js";

/**
 * Morning huddle for technicians already named on local rows.
 * Shares are call mix. Late risk is the desk's unfinished-job count.
 * Neither is a skill score and neither is a probability.
 */

export interface HuddleJob {
  technicianId: string | null;
  technicianName: string | null;
  lane: string | null;
  day: string;
  /** Unfinished, and on or before the mission day. */
  open: boolean;
  callback: CallFlag;
  warranty: CallFlag;
}

export interface HuddleCapacity {
  booked: number;
  slots: number | null;
  open: number | null;
  why: string;
}

export const TRAINING_SEVERITIES = ["none", "watch", "needed", "urgent"] as const;
export type TrainingSeverity = (typeof TRAINING_SEVERITIES)[number];

export const TRAINING_OBSERVATION_KINDS = [
  "repeated-same-failure",
  "procedure-gap",
  "certification-gap",
  "coaching-requested",
  "handoff-pattern"
] as const;

export type TrainingObservationKind = (typeof TRAINING_OBSERVATION_KINDS)[number];

/** A procedure observation. Revenue, margin, and contribution per hour are refused. */
export interface TrainingObservation {
  technicianId: string;
  kind: TrainingObservationKind;
  /** How many times this kind was observed. Defaults to 1. */
  count?: number;
  detail?: string;
}

export interface TrainingNeeded {
  severity: TrainingSeverity;
  reason: string;
  fromEconomics: false;
  notASkillScore: true;
}

const ECONOMICS_FIELDS = ["revenue", "margin", "marginPct", "contributionPerLaborHour", "realizedContribution"] as const;

/** Job economics must not become a training flag or a skill score. */
export function trainingFromJobEconomics(): never {
  throw new Error("revenue, margin, and contribution/hour are not a training flag");
}

export function flagTraining(input: {
  observations?: readonly TrainingObservation[];
  revenue?: number;
  margin?: number;
  marginPct?: number | null;
  contributionPerLaborHour?: number | null;
  realizedContribution?: number;
}): TrainingNeeded {
  for (const field of ECONOMICS_FIELDS) {
    if (input[field] != null) trainingFromJobEconomics();
  }
  return trainingNeeded(input.observations ?? []);
}

function observationScore(observation: TrainingObservation): number {
  const count = Math.max(1, observation.count ?? 1);
  if (observation.kind === "certification-gap") return 3 * count;
  if (observation.kind === "repeated-same-failure") return 2 * count;
  if (observation.kind === "procedure-gap") return 2 * Math.min(count, 3);
  return count;
}

function severityFor(score: number): TrainingSeverity {
  if (score >= 6) return "urgent";
  if (score >= 3) return "needed";
  if (score >= 1) return "watch";
  return "none";
}

function kindLabel(kind: TrainingObservationKind): string {
  if (kind === "repeated-same-failure") return "repeated same failure";
  if (kind === "procedure-gap") return "procedure gap";
  if (kind === "certification-gap") return "certification gap";
  if (kind === "coaching-requested") return "coaching requested";
  return "handoff pattern";
}

/** Per-tech training flag from procedure observations. Not a skill score. */
export function trainingNeeded(observations: readonly TrainingObservation[]): TrainingNeeded {
  if (observations.length === 0) {
    return {
      severity: "none",
      reason: "No procedure observation is on file. Training is not inferred from revenue, margin, or contribution per hour.",
      fromEconomics: false,
      notASkillScore: true
    };
  }
  const score = observations.reduce((sum, observation) => sum + observationScore(observation), 0);
  const parts = observations.map((observation) => {
    const count = Math.max(1, observation.count ?? 1);
    const detail = observation.detail?.trim() ? ` (${observation.detail.trim()})` : "";
    return `${count} ${kindLabel(observation.kind)}${detail}`;
  });
  return {
    severity: severityFor(score),
    reason: `Why: ${parts.join("; ")}. Severity is ${severityFor(score)}. This is a procedure observation, not a skill score from revenue, margin, or contribution per hour.`,
    fromEconomics: false,
    notASkillScore: true
  };
}

/** In-repo fixture. Not a company roster and not derived from job economics. */
export const SYNTHETIC_HUDDLE_TRAINING: readonly TrainingObservation[] = [
  {
    technicianId: "tech-priya",
    kind: "repeated-same-failure",
    count: 2,
    detail: "same panel fault returned without a procedure note"
  },
  {
    technicianId: "tech-luis",
    kind: "coaching-requested",
    count: 1,
    detail: "asked for a second set of eyes on tankless venting"
  },
  {
    technicianId: "tech-andre",
    kind: "certification-gap",
    count: 1,
    detail: "sewer camera ticket names a cert the roster does not show"
  }
];

export interface TechHuddleRow {
  id: string;
  name: string;
  lane: string | null;
  openJobs: number;
  lateRisk: number;
  lateRiskWhy: string;
  calls: number;
  callbacks: number;
  warrantyCalls: number;
  callbackShare: string;
  warrantyShare: string;
  callbackShareWhy: string;
  warrantyShareWhy: string;
  capacity: HuddleCapacity;
  trainingNeeded: TrainingNeeded;
  notASkillScore: true;
}

export interface HuddleBoard {
  source: "synthetic-sample" | "admitted-jobs";
  missionDay: string;
  elapsedFraction: number;
  sameDayElapsedFractionAtOrAbove: number;
  note: string;
  notASkillScore: true;
  geographic: false;
  techs: TechHuddleRow[];
}

export const UNASSIGNED_TECH_ID = "unassigned";

export function jobOpenOnBoard(unfinished: boolean, day: string, missionDay: string): boolean {
  return unfinished && day <= missionDay;
}

/** Same clock as the desk late-jobs rule. A count, not a probability. */
export function jobCountsAsLate(args: {
  open: boolean;
  day: string;
  missionDay: string;
  elapsedFraction: number;
  sameDayElapsedFractionAtOrAbove: number;
}): boolean {
  if (!args.open) return false;
  if (args.day < args.missionDay) return true;
  return args.day === args.missionDay && args.elapsedFraction >= args.sameDayElapsedFractionAtOrAbove;
}

function share(count: number, calls: number): string {
  return `${count} of ${calls}`;
}

function laneOf(jobs: HuddleJob[]): string | null {
  const lanes = [...new Set(jobs.map((job) => job.lane).filter((lane): lane is string => Boolean(lane)))];
  return lanes.length === 1 ? lanes[0]! : null;
}

function shareWhy(kind: "callback" | "warranty", count: number, calls: number): string {
  const label = kind === "callback" ? "callback" : "warranty";
  if (calls === 0) {
    return `Why: no calls are on this tech, so a ${label} share is not invented. This is not a skill score.`;
  }
  return `Why: ${count} of ${calls} calls on this tech carry an explicit ${label} label. Unknown labels stay out of that count. This is call mix on the rows, not a skill score.`;
}

function lateWhy(args: {
  prior: number;
  countedToday: number;
  elapsedFraction: number;
  sameDayAt: number;
}): string {
  const count = args.prior + args.countedToday;
  return `Why: ${count} unfinished jobs on this tech meet the late-jobs clock (${args.prior} before the mission day, ${args.countedToday} counted today). Same-day unfinished jobs count only after day fraction ${args.sameDayAt.toFixed(2)}. Current day fraction is ${args.elapsedFraction.toFixed(2)}. This is a count, not a probability, and not a skill score.`;
}

function capacityWhy(args: {
  booked: number;
  slots: number | null;
  synthetic: boolean;
}): HuddleCapacity {
  if (args.slots == null) {
    return {
      booked: args.booked,
      slots: null,
      open: null,
      why: `Why: no slot count is stored for this tech. Open slots stay blank. Booked on the mission day is ${args.booked}. A blank is not a full lane.`
    };
  }
  const open = Math.max(0, args.slots - args.booked);
  const sample = args.synthetic
    ? " The slot count is the in-repo fixture, not a live capacity board."
    : "";
  const over = args.booked > args.slots ? ` Booked exceeds the known ${args.slots} slots.` : "";
  return {
    booked: args.booked,
    slots: args.slots,
    open,
    why: `Why: booked on the mission day is ${args.booked}. Known slots are ${args.slots}. Open is ${open}.${over}${sample}`
  };
}

export function buildHuddleBoard(args: {
  jobs: readonly HuddleJob[];
  missionDay: string;
  elapsedFraction: number;
  sameDayElapsedFractionAtOrAbove: number;
  source: HuddleBoard["source"];
  /** Known slots by technician id. Absent ids stay blank. */
  slotsById?: ReadonlyMap<string, number>;
  namesById?: ReadonlyMap<string, string>;
  /** Procedure observations. Absent techs stay severity none. Economics are not accepted here. */
  trainingObservations?: readonly TrainingObservation[];
}): HuddleBoard {
  const groups = new Map<string, HuddleJob[]>();
  const names = new Map<string, string>();
  for (const job of args.jobs) {
    const id = job.technicianId?.trim() || UNASSIGNED_TECH_ID;
    const list = groups.get(id) ?? [];
    list.push(job);
    groups.set(id, list);
    if (id !== UNASSIGNED_TECH_ID && job.technicianName?.trim()) names.set(id, job.technicianName.trim());
  }

  const synthetic = args.source === "synthetic-sample";
  const trainingById = new Map<string, TrainingObservation[]>();
  for (const observation of args.trainingObservations ?? []) {
    const id = observation.technicianId.trim();
    if (!id) continue;
    const list = trainingById.get(id) ?? [];
    list.push(observation);
    trainingById.set(id, list);
  }
  const techs: TechHuddleRow[] = [...groups.entries()]
    .map(([id, jobs]) => {
      const prior = jobs.filter((job) => job.open && job.day < args.missionDay).length;
      const todayOpen = jobs.filter((job) => job.open && job.day === args.missionDay).length;
      const countedToday = args.elapsedFraction >= args.sameDayElapsedFractionAtOrAbove ? todayOpen : 0;
      const callbacks = jobs.filter((job) => job.callback === "yes").length;
      const warrantyCalls = jobs.filter((job) => job.warranty === "yes").length;
      const booked = jobs.filter((job) => job.day === args.missionDay).length;
      const rosterName = args.namesById?.get(id);
      const name =
        id === UNASSIGNED_TECH_ID ? "Unassigned" : rosterName || names.get(id) || id;
      const training: TrainingNeeded =
        id === UNASSIGNED_TECH_ID
          ? {
              severity: "none",
              reason: "Unassigned is not a person. Training is not invented for a blank row, and it is not a skill score.",
              fromEconomics: false,
              notASkillScore: true
            }
          : trainingNeeded(trainingById.get(id) ?? []);
      return {
        id,
        name,
        lane: laneOf(jobs),
        openJobs: jobs.filter((job) => job.open).length,
        lateRisk: prior + countedToday,
        lateRiskWhy: lateWhy({
          prior,
          countedToday,
          elapsedFraction: args.elapsedFraction,
          sameDayAt: args.sameDayElapsedFractionAtOrAbove
        }),
        calls: jobs.length,
        callbacks,
        warrantyCalls,
        callbackShare: share(callbacks, jobs.length),
        warrantyShare: share(warrantyCalls, jobs.length),
        callbackShareWhy: shareWhy("callback", callbacks, jobs.length),
        warrantyShareWhy: shareWhy("warranty", warrantyCalls, jobs.length),
        capacity: capacityWhy({
          booked,
          slots: id === UNASSIGNED_TECH_ID ? null : (args.slotsById?.get(id) ?? null),
          synthetic
        }),
        trainingNeeded: training,
        notASkillScore: true as const
      };
    })
    .sort((a, b) => {
      if (a.id === UNASSIGNED_TECH_ID) return 1;
      if (b.id === UNASSIGNED_TECH_ID) return -1;
      return a.name.localeCompare(b.name);
    });

  const note = synthetic
    ? "Fixture names and slot counts from the in-repo sample. Not a company roster. Callback share and warranty share are call mix on these rows. They are not a skill score. Late risk is the same unfinished-job count the desk late-jobs rule uses. It is not a probability. Training needed is a procedure observation on the fixture, not a score from revenue, margin, or contribution per hour."
    : techs.length
      ? "Built from technician labels on admitted job rows. A row with no technician stays on Unassigned. That row is not a person. Open slots stay blank when the export does not name a slot count. Shares are not a skill score. Late risk is a count, not a probability. Training stays none unless a procedure observation is passed in. It is not inferred from margin."
      : "No job rows are on this desk, so no technician huddle is invented.";

  return {
    source: args.source,
    missionDay: args.missionDay,
    elapsedFraction: args.elapsedFraction,
    sameDayElapsedFractionAtOrAbove: args.sameDayElapsedFractionAtOrAbove,
    note,
    notASkillScore: true,
    geographic: false,
    techs
  };
}
