import { appendRecord, emptyChain, type OverrideRecord } from "../core/chains.js";

export const TECH_TAGS = [
  "maintenance-1",
  "maintenance-2",
  "maintenance-3",
  "service-1",
  "service-2",
  "service-3",
  "selling-tech",
  "repair-tech",
  "warranty",
  "comfort-advisor",
  "manager"
] as const;

export type TechTag = (typeof TECH_TAGS)[number];

export interface MaintenanceCandidate {
  vanId: string;
  tags: TechTag[];
  availableNow: boolean;
  qualifiedForPrimary: boolean;
}

export function sellingWeightForAge(ageYears: number): number {
  if (ageYears < 8) return 0;
  if (ageYears < 10) return 0.1;
  return Math.min(0.4, 0.15 + (ageYears - 10) * 0.03);
}

/** Sales opportunity is a matching factor, not permission to delay qualified service. */
export function mayHoldForIdealSeller(humanOverride: boolean): boolean {
  return humanOverride;
}

/** Demand-first: do not delay a qualified tech to wait for an ideal Selling Tech. */
export function pickMaintenanceVan(input: {
  candidates: MaintenanceCandidate[];
  equipmentAgeYears: number;
  humanOverrideVanId?: string;
}): { vanId: string; heldForSeller: false; sellingWeight: number } {
  if (input.humanOverrideVanId) {
    return {
      vanId: input.humanOverrideVanId,
      heldForSeller: false,
      sellingWeight: sellingWeightForAge(input.equipmentAgeYears)
    };
  }
  const qualified = input.candidates.filter((c) => c.qualifiedForPrimary && c.availableNow);
  if (qualified.length === 0) {
    throw new Error("no qualified available technician");
  }
  const weight = sellingWeightForAge(input.equipmentAgeYears);
  const scored = qualified
    .map((c) => ({
      vanId: c.vanId,
      score: (c.tags.includes("selling-tech") ? weight : 0) + (c.tags.includes("service-3") ? 0.2 : 0)
    }))
    .sort((a, b) => b.score - a.score);
  return { vanId: scored[0]!.vanId, heldForSeller: false, sellingWeight: weight };
}

export function applyTagChange(
  current: TechTag[],
  next: TechTag[],
  authorizedHuman: boolean,
  actor: { actorId: string; role: string; reason: string; at: string }
): { tags: TechTag[]; chain: ReturnType<typeof emptyChain<OverrideRecord>> } {
  if (!authorizedHuman) {
    throw new Error("tag changes require authorized human recalibration");
  }
  const chain = appendRecord(emptyChain<OverrideRecord>("C"), {
    chain: "C",
    recordId: `c:tag:${actor.actorId}:${actor.at}`,
    at: actor.at,
    recommendationId: `tag:${current.join(",")}`,
    actorId: actor.actorId,
    role: actor.role,
    reason: actor.reason,
    originalAction: current.join(","),
    replacementAction: next.join(",")
  });
  return { tags: next, chain };
}
