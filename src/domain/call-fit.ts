export interface CallFitFactors {
  quality: number;
  competence: number;
  technicalFit: number;
  clientFit: number;
  geolocation: number;
  inventory: number;
  runtime: number;
  contribution: number;
  margin: number;
  scheduleImpact: number;
  exploration: number;
}

export interface ScoredVan {
  vanId: string;
  qualifiedForPrimary: boolean;
  factors: CallFitFactors;
  baseScore: number;
  crossTradeAdjustment: number;
  finalScore: number;
}

const WEIGHTS: Record<keyof CallFitFactors, number> = {
  quality: 1,
  competence: 1,
  technicalFit: 1.2,
  clientFit: 0.8,
  geolocation: 0.6,
  inventory: 0.9,
  runtime: 0.7,
  contribution: 0.7,
  margin: 0.6,
  scheduleImpact: 0.8,
  exploration: 0.4
};

export function scoreFactors(factors: CallFitFactors): number {
  return (Object.keys(WEIGHTS) as (keyof CallFitFactors)[]).reduce(
    (sum, key) => sum + factors[key] * WEIGHTS[key],
    0
  );
}

export function geographyIsSoleDecider(a: CallFitFactors, b: CallFitFactors): boolean {
  const keys = Object.keys(WEIGHTS) as (keyof CallFitFactors)[];
  return keys.every((key) => (key === "geolocation" ? true : a[key] === b[key])) && a.geolocation !== b.geolocation;
}

export function rankVans(vans: Array<Omit<ScoredVan, "baseScore" | "crossTradeAdjustment" | "finalScore">>): ScoredVan[] {
  const qualified = vans.filter((van) => van.qualifiedForPrimary);
  return qualified
    .map((van) => {
      const baseScore = scoreFactors(van.factors);
      return { ...van, baseScore, crossTradeAdjustment: 0, finalScore: baseScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}

export function assertGeographyNeverSoleWinner(ranked: ScoredVan[]): void {
  if (ranked.length < 2) return;
  const [first, second] = ranked;
  if (geographyIsSoleDecider(first.factors, second.factors) && first.factors.geolocation > second.factors.geolocation) {
    throw new Error("geography/fuel may not be the sole final deciding factor");
  }
}
