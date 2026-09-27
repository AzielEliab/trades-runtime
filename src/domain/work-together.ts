import { SYNTHETIC_DESK_TECHS } from "./call-class.js";
import { flagNamedFailure, type DepartmentBehaviorFlag } from "./chain-d.js";

/**
 * How employees work together across departments.
 * Suggestions come from Chain D, cross-trade, and recognition flags.
 * They name who or which lane should pair or hand off.
 * Revenue alone does not create a suggestion. This is not a skill score.
 */

export const WORK_KINDS = ["service", "install"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export interface CollaborationPerson {
  id: string;
  name: string;
  lane: string;
}

export interface NamedCollaboration {
  flagId: string;
  polarity: DepartmentBehaviorFlag["polarity"];
  source: DepartmentBehaviorFlag["source"];
  kind: string;
  fromRole: string;
  toRole: string;
  summary: string;
  workKind: WorkKind;
  fromPerson: CollaborationPerson | null;
  toPerson: CollaborationPerson | null;
  lastPersonBlamed: false;
}

export interface CollaborationSuggestion {
  id: string;
  workKind: WorkKind;
  action: "pair" | "hand-off";
  who: string;
  lane: string;
  withWhom: string;
  withLane: string;
  text: string;
  basis: string;
  fromRevenueAlone: false;
  notASkillScore: true;
  lastPersonBlamed: false;
}

export interface WorkTogetherBoard {
  product: "trades-runtime";
  live_backends: false;
  writes: false;
  phoneHome: false;
  hostedHr: false;
  companyExport: false;
  notASkillScore: true;
  trainingSeparate: true;
  source: "synthetic-demo" | "local-flags" | "none";
  note: string;
  pairs: NamedCollaboration[];
  positiveCount: number;
  negativeCount: number;
  suggestions: {
    service: CollaborationSuggestion[];
    install: CollaborationSuggestion[];
  };
}

const TECH = Object.fromEntries(SYNTHETIC_DESK_TECHS.map((tech) => [tech.id, { id: tech.id, name: tech.name, lane: tech.lane }])) as Record<
  string,
  CollaborationPerson
>;

/** Names on the empty-folder fixture only. A missing flag stays role-level. People are not invented for a silent export. */
export const SYNTHETIC_COLLABORATION_ASSIGNMENTS: Readonly<
  Record<string, { workKind: WorkKind; from: CollaborationPerson | null; to: CollaborationPerson | null }>
> = {
  "x:hvac:electrical:assist": { workKind: "service", from: TECH["tech-maya"]!, to: TECH["tech-priya"]! },
  "x:plumbing:sewer:unevidenced": { workKind: "service", from: TECH["tech-luis"]!, to: TECH["tech-andre"]! },
  "d:syn-install:positive": { workKind: "install", from: TECH["tech-sam"]!, to: TECH["tech-maya"]! },
  "d:syn-delayed:negative": { workKind: "service", from: TECH["tech-priya"]!, to: TECH["tech-maya"]! },
  "d:syn-clean:positive": { workKind: "service", from: null, to: null },
  "d:syn-missed:negative": { workKind: "service", from: null, to: null },
  "syn-rec": { workKind: "service", from: null, to: null },
  "syn-quality": { workKind: "service", from: null, to: null }
};

function installClean(at: string): DepartmentBehaviorFlag {
  return {
    flagId: "d:syn-install:positive",
    polarity: "positive",
    source: "chain-d",
    fromRole: "cross-trades",
    toRole: "hvac",
    kind: "clean-handoff",
    summary: `cross-trades handed install-scope to hvac and it was acknowledged at ${at}. This is a good install handoff, not a score of either person.`,
    attribution: "unknown",
    lastPersonBlamed: false,
    systemBeforeBlame: true
  };
}

/** Delayed service handoff. Counts as friction. The last person is not blamed. */
export function syntheticDelayedHandoff(): DepartmentBehaviorFlag {
  return flagNamedFailure({
    recordId: "syn-delayed",
    fromRole: "electrical",
    toRole: "hvac",
    failureType: "delayed-handoff"
  });
}

export function syntheticInstallFlag(at: string): DepartmentBehaviorFlag {
  return installClean(at);
}

/** Revenue alone is not a collaboration suggestion. */
export function workTogetherFromRevenue(_revenue?: number): never {
  throw new Error("revenue alone is not a collaboration suggestion");
}

export function nameCollaborations(args: {
  flags: readonly DepartmentBehaviorFlag[];
  assignments?: Readonly<Record<string, { workKind: WorkKind; from: CollaborationPerson | null; to: CollaborationPerson | null }>>;
}): NamedCollaboration[] {
  return args.flags.map((flag) => {
    const assignment = args.assignments?.[flag.flagId];
    return {
      flagId: flag.flagId,
      polarity: flag.polarity,
      source: flag.source,
      kind: flag.kind,
      fromRole: flag.fromRole,
      toRole: flag.toRole,
      summary: flag.summary,
      workKind: assignment?.workKind ?? "service",
      fromPerson: assignment?.from ?? null,
      toPerson: assignment?.to ?? null,
      lastPersonBlamed: false
    };
  });
}

function sideLabel(person: CollaborationPerson | null, role: string): { who: string; lane: string } {
  if (person) return { who: person.name, lane: person.lane };
  return { who: role, lane: role };
}

function suggestionFor(collab: NamedCollaboration): CollaborationSuggestion | null {
  const from = sideLabel(collab.fromPerson, collab.fromRole);
  const to = sideLabel(collab.toPerson, collab.toRole);
  const base = {
    id: `suggest:${collab.flagId}`,
    workKind: collab.workKind,
    who: from.who,
    lane: from.lane,
    withWhom: to.who,
    withLane: to.lane,
    fromRevenueAlone: false as const,
    notASkillScore: true as const,
    lastPersonBlamed: false as const
  };
  if (collab.polarity === "positive" && collab.kind === "cross-trade-assist") {
    const lead = collab.workKind === "install" ? "For install, pair" : "When a service tech is needed, pair";
    return {
      ...base,
      action: "pair",
      basis: "cross-trade-assist",
      text: `${lead} ${from.who} (${from.lane}) with ${to.who} (${to.lane}). Basis: evidence-supported cross-trade assist. Not a skill score from revenue.`
    };
  }
  if (collab.polarity === "positive" && (collab.kind === "clean-handoff" || collab.kind === "shared-diagnosis")) {
    const lead = collab.workKind === "install" ? "Hand install from" : "When a service tech is needed, hand off from";
    return {
      ...base,
      action: "hand-off",
      basis: collab.kind,
      text: `${lead} ${from.who} (${from.lane}) to ${to.who} (${to.lane}). Basis: ${collab.kind}. Revenue alone did not fire this. Not a skill score.`
    };
  }
  if (collab.polarity === "negative" && (collab.kind === "delayed-handoff" || collab.kind === "unacknowledged-handoff")) {
    const lead = collab.workKind === "install" ? "Install handoff:" : "Service handoff:";
    return {
      ...base,
      action: "hand-off",
      basis: collab.kind,
      text: `${lead} ${from.who} (${from.lane}) should hand off to ${to.who} (${to.lane}) and wait for acknowledgement. Basis: ${collab.kind}. The last person is not blamed. Not a skill score from revenue.`
    };
  }
  if (collab.polarity === "negative" && collab.kind === "unevidenced-cross-trade") {
    return {
      ...base,
      action: "hand-off",
      basis: collab.kind,
      text: `Do not pair ${from.who} (${from.lane}) with ${to.who} (${to.lane}) on an unevidenced weight. Hand off only after evidence exists. Not a skill score from revenue.`
    };
  }
  return null;
}

export function buildWorkTogether(args: {
  source: "synthetic-demo" | "local-flags" | "none";
  collaborations: readonly NamedCollaboration[];
}): WorkTogetherBoard {
  const pairs = [...args.collaborations];
  const suggestions = pairs.map(suggestionFor).filter((row): row is CollaborationSuggestion => Boolean(row));
  const source = pairs.length === 0 ? "none" : args.source;
  const note =
    source === "none"
      ? "No collaboration flags on this desk. Pair and handoff suggestions are not invented. This is not a skill score from revenue and not a hosted HR system."
      : source === "synthetic-demo"
        ? "Synthetic demo of Chain D, cross-trade, and recognition flags. Not a company export. Positive collaboration is listed. Suggestions name who or which lane should pair or hand off for service techs when needed and for install. Revenue alone did not fire them. Not a skill score. Not a hosted HR system."
        : "Local Chain D, cross-trade, and recognition flags. UNVERIFIED. Suggestions name who or which lane should pair or hand off. A role with no person stays a role. Revenue alone did not fire them. Not a skill score. Not a hosted HR system.";
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
    pairs,
    positiveCount: pairs.filter((pair) => pair.polarity === "positive").length,
    negativeCount: pairs.filter((pair) => pair.polarity === "negative").length,
    suggestions: {
      service: suggestions.filter((row) => row.workKind === "service"),
      install: suggestions.filter((row) => row.workKind === "install")
    }
  };
}
