import type { DrivePerformance } from "./drive-miles.js";
import type { FrictionBoard } from "./friction.js";
import type { CoverageBoard, CoverageJobSite } from "./coverage-map.js";
import type { LocalPin } from "./local-positions.js";
import type { TimeCard, TimeTrackingBoard } from "./time-tracking.js";

/**
 * Ranked tech suggestions for one open job.
 * Geolocation, time remaining on the current call, and skill fit.
 * Suggestions only. No auto-dispatch and no write-back.
 * Geography is one factor. It is not the whole decision.
 */

export const RIGHT_TECH_AUTHORITY =
  "Human Authority Rule: these are suggestions only. A person dispatches. This panel does not auto-dispatch and does not write back to ServiceTitan or ProBooks.";

export interface RightTechJob {
  id: string;
  trade: string | null;
  label: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
}

export interface RightTechSuggestion {
  rank: number;
  technicianId: string;
  technicianName: string;
  score: number;
  miles: number | null;
  minutesRemaining: number | null;
  skill: number;
  frictionRate: number | null;
  reasons: string[];
  autoDispatch: false;
  writeBack: "refused";
}

export interface RightTechBoard {
  product: "trades-runtime";
  author: "Aziel Eliab";
  live_backends: false;
  writes: false;
  phoneHome: false;
  liveTelematics: false;
  telematicsVendor: false;
  vendorClaim: false;
  notALiveGps: true;
  suggestionsOnly: true;
  autoDispatch: false;
  writeBack: "refused";
  servicetitanWrite: false;
  probooksWrite: false;
  humanAuthorityRule: typeof RIGHT_TECH_AUTHORITY;
  dataLabel: string;
  note: string;
  job: RightTechJob | null;
  openJobs: { id: string; trade: string | null; label: string | null }[];
  suggestions: RightTechSuggestion[];
}

export interface RightTechCall {
  id: string;
  lane: string | null;
  status: string | null;
  technicianName: string | null;
}

const TRADE_LABELS: Record<string, string> = {
  hvac: "HVAC",
  plumbing: "Plumbing",
  electrical: "Electrical",
  sewer: "Sewer",
  "cross-trades": "Cross-trades"
};

const RELATED: Record<string, string[]> = {
  plumbing: ["sewer"],
  sewer: ["plumbing"],
  hvac: ["electrical"],
  electrical: ["hvac"]
};

function tradeLabel(value: string): string {
  return TRADE_LABELS[value] ?? value;
}

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earth = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earth * 2 * Math.asin(Math.min(1, Math.sqrt(h))) * 10) / 10;
}

export function skillFit(skills: readonly string[], trade: string | null): { score: number; reason: string } {
  const known = skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean);
  const job = (trade ?? "").trim().toLowerCase();
  if (!job) return { score: 0.5, reason: "This job has no trade label. Skill fit is not invented." };
  if (known.includes(job)) return { score: 1, reason: `${tradeLabel(job)} skill matches this job.` };
  if (known.includes("cross-trades") || known.includes("cross-trade")) {
    return { score: 0.62, reason: `Cross-trades can cover this ${tradeLabel(job)} job.` };
  }
  if ((RELATED[job] ?? []).some((item) => known.includes(item))) {
    const named = known[0] ? tradeLabel(known[0]) : "A nearby trade";
    return { score: 0.4, reason: `${named} is a nearby trade, not the primary fit for this ${tradeLabel(job)} job.` };
  }
  if (!known.length) return { score: 0.5, reason: "No local skill label for this tech. Fit is not invented." };
  return { score: 0.22, reason: `${tradeLabel(known[0] ?? "This trade")} is not the primary trade for this ${tradeLabel(job)} job.` };
}

function callBucket(status: string | null): "scheduled" | "on-the-job" | "done" | "other" {
  const text = (status ?? "").trim().toLowerCase();
  if (!text) return "other";
  if (/complet|done|closed|invoiced/.test(text)) return "done";
  if (/work|progress|dispatch|en route|enroute|arrived|on site|onsite/.test(text)) return "on-the-job";
  if (/schedul|open|book|pending|unassigned/.test(text)) return "scheduled";
  return "other";
}

function isOpenCall(status: string | null): boolean {
  const column = callBucket(status);
  return column === "scheduled" || column === "on-the-job";
}

function jobSite(coverage: CoverageBoard, id: string): CoverageJobSite | null {
  return coverage.jobs.find((job) => job.id === id) ?? null;
}

function candidateIds(cards: readonly TimeCard[], pins: readonly LocalPin[]): string[] {
  const ids = new Set<string>();
  for (const card of cards) ids.add(card.technicianId);
  for (const pin of pins) ids.add(pin.technicianId);
  return [...ids];
}

export function buildRightTech(args: {
  dataLabel: string;
  calls: readonly RightTechCall[];
  time: TimeTrackingBoard;
  pins: readonly LocalPin[];
  coverage: CoverageBoard;
  friction: FrictionBoard;
  drive: DrivePerformance;
  jobId?: string | null;
}): RightTechBoard {
  const open = args.calls.filter((call) => isOpenCall(call.status));
  const requested = args.jobId?.trim() || null;
  const chosen = requested
    ? args.calls.find((call) => call.id === requested) ?? null
    : open.find((call) => callBucket(call.status) === "scheduled") ?? open[0] ?? null;
  const site = chosen ? jobSite(args.coverage, chosen.id) : null;
  const job: RightTechJob | null = chosen
    ? {
        id: chosen.id,
        trade: site?.trade ?? chosen.lane,
        label: site?.label ?? chosen.lane,
        status: chosen.status,
        lat: site?.lat ?? null,
        lng: site?.lng ?? null
      }
    : null;
  const frictionById = new Map(args.friction.employees.map((row) => [row.id, row]));
  const driveById = new Map(args.drive.techs.map((row) => [row.technicianId, row]));
  const cardById = new Map(args.time.cards.map((card) => [card.technicianId, card]));
  const pinById = new Map(args.pins.map((pin) => [pin.technicianId, pin]));
  const suggestions: RightTechSuggestion[] = job
    ? candidateIds(args.time.cards, args.pins)
        .map((technicianId) => {
          const card = cardById.get(technicianId) ?? null;
          const pin = pinById.get(technicianId) ?? null;
          const name = card?.technicianName ?? pin?.technicianName ?? technicianId;
          const fit = skillFit(card?.skills ?? [], job.trade);
          const miles = pin && job.lat != null && job.lng != null ? milesBetween(pin, { lat: job.lat, lng: job.lng }) : null;
          const minutesRemaining = card?.estimatedRemainingMinutes ?? null;
          const friction = frictionById.get(technicianId);
          const frictionRate = friction?.frictionRate ?? null;
          const driveRow = driveById.get(technicianId);
          const avail = minutesRemaining == null ? 0.5 : 1 / (1 + minutesRemaining / 60);
          const geo = miles == null ? 0.5 : 1 / (1 + miles / 8);
          const frictionPenalty = frictionRate == null ? 0 : frictionRate * 0.1;
          const heavyDrive = driveRow?.minutesPerStop != null && driveRow.minutesPerStop >= 45;
          const drivePenalty = heavyDrive ? 0.03 : 0;
          const score = Math.round((fit.score * 0.45 + avail * 0.3 + geo * 0.25 - frictionPenalty - drivePenalty) * 1000) / 1000;
          const reasons = [fit.reason];
          reasons.push(
            miles == null
              ? "No local pin for this tech. Distance is not invented."
              : `About ${miles.toFixed(1)} miles from the job pin on the local map.`
          );
          if (minutesRemaining == null) reasons.push("Estimated time remaining is unknown. It is not invented.");
          else if (minutesRemaining === 0) reasons.push(card?.status === "on-call" ? "The current call estimate is used up. Free now on this card." : "Free now on the local time card.");
          else reasons.push(`About ${minutesRemaining} minutes left before this tech is free.`);
          if (frictionRate == null) reasons.push("Friction is unknown on this desk. A silent export stays unknown.");
          else reasons.push(`Friction on the local board is ${Math.round(frictionRate * 100)}%.`);
          if (heavyDrive && driveRow?.minutesPerStop != null) {
            reasons.push(`Drive minutes per stop are high on the local miles file (${driveRow.minutesPerStop.toFixed(0)} min).`);
          }
          return {
            rank: 0,
            technicianId,
            technicianName: name,
            score,
            miles,
            minutesRemaining,
            skill: fit.score,
            frictionRate,
            reasons,
            autoDispatch: false as const,
            writeBack: "refused" as const
          };
        })
        .sort((a, b) => b.score - a.score || a.technicianName.localeCompare(b.technicianName))
        .map((row, index) => ({ ...row, rank: index + 1 }))
    : [];
  const missingJob = requested && !chosen;
  const note = missingJob
    ? "That job is not on this desk. Suggestions stay empty. Nothing is dispatched."
    : !job
      ? "No open or scheduled job on this desk. Suggestions stay empty. Nothing is dispatched."
      : args.time.source === "synthetic-demo" || args.coverage.source === "synthetic-demo"
        ? "Suggestions from the labeled local demo. Geolocation, time remaining, and skill fit. Not a live GPS feed. Not a dispatch. live_backends false."
        : args.time.source === "local-file" || args.coverage.source === "local-file" || args.pins.length
          ? "Suggestions from local files on this machine. Geolocation, time remaining, and skill fit. Not a live GPS feed. Not a dispatch. live_backends false."
          : "No local pins or time cards for a suggestion. Distance and remaining time are not invented. Nothing is dispatched.";
  return {
    product: "trades-runtime",
    author: "Aziel Eliab",
    live_backends: false,
    writes: false,
    phoneHome: false,
    liveTelematics: false,
    telematicsVendor: false,
    vendorClaim: false,
    notALiveGps: true,
    suggestionsOnly: true,
    autoDispatch: false,
    writeBack: "refused",
    servicetitanWrite: false,
    probooksWrite: false,
    humanAuthorityRule: RIGHT_TECH_AUTHORITY,
    dataLabel: args.dataLabel,
    note,
    job,
    openJobs: open.map((call) => ({
      id: call.id,
      trade: jobSite(args.coverage, call.id)?.trade ?? call.lane,
      label: jobSite(args.coverage, call.id)?.label ?? call.lane
    })),
    suggestions
  };
}
