import type { CallFlag } from "./call-class.js";
import type { NamedCollaboration } from "./work-together.js";

/**
 * Employee friction rate from local handoffs and explicit callbacks.
 * Delayed handoffs are reported inside the negative flags, not added twice.
 * A silent export stays unknown. This is not a hosted HR system and not a skill score.
 */

export interface FrictionJob {
  technicianId: string | null;
  technicianName: string | null;
  department: string | null;
  callback: CallFlag;
}

export interface FrictionRow {
  id: string;
  label: string;
  scope: "employee" | "department";
  frictionRate: number | null;
  /** 1 is the highest known friction. Null when the rate is unknown. Not a performance rank. */
  frictionRank: number | null;
  calls: number;
  callbacks: number;
  callbackUnknown: number;
  negativeFlags: number;
  delayedHandoffs: number;
  participations: number;
  known: boolean;
  notASkillScore: true;
  trainingSeparate: true;
  lastPersonBlamed: false;
}

export interface FrictionBoard {
  product: "trades-runtime";
  live_backends: false;
  writes: false;
  phoneHome: false;
  hostedHr: false;
  companyExport: false;
  notASkillScore: true;
  trainingSeparate: true;
  source: "synthetic-demo" | "admitted-rows" | "unknown";
  note: string;
  employees: FrictionRow[];
  departments: FrictionRow[];
}

/** Friction is not technician skill. */
export function frictionAsSkillScore(_row?: FrictionRow | FrictionBoard): never {
  throw new Error("a friction rate is not technician skill");
}

/** Friction is not a training flag. trainingNeeded stays a procedure observation. */
export function frictionAsTraining(_row?: FrictionRow | FrictionBoard): never {
  throw new Error("a friction rate is not a training flag");
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

interface Bucket {
  id: string;
  label: string;
  scope: "employee" | "department";
  calls: number;
  callbacks: number;
  callbackUnknown: number;
  negativeFlags: number;
  delayedHandoffs: number;
  participations: number;
}

function emptyBucket(id: string, label: string, scope: Bucket["scope"]): Bucket {
  return {
    id,
    label,
    scope,
    calls: 0,
    callbacks: 0,
    callbackUnknown: 0,
    negativeFlags: 0,
    delayedHandoffs: 0,
    participations: 0
  };
}

function rate(bucket: Bucket): number | null {
  const silentCallbacks = bucket.calls > 0 && bucket.callbackUnknown === bucket.calls;
  if (bucket.participations === 0 && (bucket.calls === 0 || silentCallbacks)) return null;
  const denominator = bucket.calls + bucket.participations;
  if (denominator === 0) return null;
  return round4((bucket.negativeFlags + bucket.callbacks) / denominator);
}

function rankRows(buckets: Bucket[]): FrictionRow[] {
  const rows = buckets.map((bucket) => {
    const frictionRate = rate(bucket);
    return {
      id: bucket.id,
      label: bucket.label,
      scope: bucket.scope,
      frictionRate,
      frictionRank: null as number | null,
      calls: bucket.calls,
      callbacks: bucket.callbacks,
      callbackUnknown: bucket.callbackUnknown,
      negativeFlags: bucket.negativeFlags,
      delayedHandoffs: bucket.delayedHandoffs,
      participations: bucket.participations,
      known: frictionRate != null,
      notASkillScore: true as const,
      trainingSeparate: true as const,
      lastPersonBlamed: false as const
    };
  });
  const known = rows.filter((row) => row.known).sort((a, b) => (b.frictionRate ?? 0) - (a.frictionRate ?? 0) || a.label.localeCompare(b.label));
  known.forEach((row, index) => {
    row.frictionRank = index + 1;
  });
  const unknown = rows.filter((row) => !row.known).sort((a, b) => a.label.localeCompare(b.label));
  return [...known, ...unknown];
}

function touchDepartment(collab: NamedCollaboration, side: "from" | "to"): { id: string; label: string } {
  const person = side === "from" ? collab.fromPerson : collab.toPerson;
  if (person) return { id: person.lane, label: person.lane };
  const role = side === "from" ? collab.fromRole : collab.toRole;
  return { id: role, label: role };
}

export function buildFriction(args: {
  source: "synthetic-demo" | "admitted-rows" | "unknown";
  jobs: readonly FrictionJob[];
  collaborations: readonly NamedCollaboration[];
}): FrictionBoard {
  const employees = new Map<string, Bucket>();
  const departments = new Map<string, Bucket>();

  for (const job of args.jobs) {
    const employeeId = job.technicianId ?? "unassigned";
    const employee = employees.get(employeeId) ?? emptyBucket(employeeId, job.technicianName ?? employeeId, "employee");
    if (job.technicianName && employee.label === employee.id) employee.label = job.technicianName;
    employee.calls += 1;
    if (job.callback === "yes") employee.callbacks += 1;
    if (job.callback === "unknown") employee.callbackUnknown += 1;
    employees.set(employeeId, employee);

    const departmentId = job.department ?? "unnamed";
    const department = departments.get(departmentId) ?? emptyBucket(departmentId, departmentId, "department");
    department.calls += 1;
    if (job.callback === "yes") department.callbacks += 1;
    if (job.callback === "unknown") department.callbackUnknown += 1;
    departments.set(departmentId, department);
  }

  for (const collab of args.collaborations) {
    const delayed = collab.kind === "delayed-handoff" || collab.kind === "unacknowledged-handoff";
    const people = [collab.fromPerson, collab.toPerson].filter((person): person is NonNullable<typeof person> => Boolean(person));
    for (const person of people) {
      const bucket = employees.get(person.id) ?? emptyBucket(person.id, person.name, "employee");
      bucket.participations += 1;
      if (collab.polarity === "negative") bucket.negativeFlags += 1;
      if (delayed) bucket.delayedHandoffs += 1;
      employees.set(person.id, bucket);
    }
    for (const side of ["from", "to"] as const) {
      const touch = touchDepartment(collab, side);
      const bucket = departments.get(touch.id) ?? emptyBucket(touch.id, touch.label, "department");
      bucket.participations += 1;
      if (collab.polarity === "negative") bucket.negativeFlags += 1;
      if (delayed) bucket.delayedHandoffs += 1;
      departments.set(touch.id, bucket);
    }
  }

  const employeeRows = rankRows([...employees.values()]);
  const departmentRows = rankRows([...departments.values()]);
  const anyKnown = employeeRows.some((row) => row.known) || departmentRows.some((row) => row.known);
  const source = employeeRows.length === 0 && departmentRows.length === 0 ? "unknown" : anyKnown ? args.source : "unknown";
  const note =
    source === "unknown"
      ? "Friction stays unknown. A silent export did not name callbacks or handoffs, and a missing flag is not treated as zero. Not a hosted HR system. Not a skill score. It does not set trainingNeeded."
      : source === "synthetic-demo"
        ? "Synthetic demo friction. Explicit callbacks plus negative Chain D, cross-trade, and recognition flags, divided by calls plus those participations. Delayed handoffs are inside the negative count, not added twice. Highest friction is listed first. That order is not the performance rank. The last person is not blamed. Not a hosted HR system. Not a skill score. It does not set trainingNeeded."
        : "Local friction from explicit callbacks and coordination flags on this machine. Unknown callbacks stay out of the numerator. A row with no flags and only unknown callbacks stays unknown. Highest known friction is listed first. That order is not the performance rank. Not a hosted HR system. Not a skill score. It does not set trainingNeeded.";
  return {
    product: "trades-runtime",
    live_backends: false,
    writes: false,
    phoneHome: false,
    hostedHr: false,
    companyExport: false,
    notASkillScore: true,
    trainingSeparate: true,
    source,
    note,
    employees: employeeRows,
    departments: departmentRows
  };
}
