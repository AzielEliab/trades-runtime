export interface MomentumComponents {
  comparableSaleTrend: number;
  pricePerSqft: number;
  transactionVelocity: number;
  inventory: number;
  daysOnMarket: number;
  saleToList: number;
  constructionPermitActivity: number;
  distress: number;
}

export interface NeighborhoodMomentumScore {
  score: number;
  components: MomentumComponents;
  methodology: string;
  methodologyVisible: true;
}

export const MOMENTUM_METHODOLOGY =
  "Weighted sum of comparable-sale trend, price/sqft, transaction velocity, inverse inventory, inverse days-on-market, sale/list, construction/permit activity, and inverse distress. Components stay visible.";

const WEIGHTS: Record<keyof MomentumComponents, number> = {
  comparableSaleTrend: 0.2,
  pricePerSqft: 0.15,
  transactionVelocity: 0.15,
  inventory: -0.1,
  daysOnMarket: -0.1,
  saleToList: 0.15,
  constructionPermitActivity: 0.1,
  distress: -0.15
};

export function neighborhoodMomentum(components: MomentumComponents): NeighborhoodMomentumScore {
  const raw = (Object.keys(WEIGHTS) as (keyof MomentumComponents)[]).reduce(
    (sum, key) => sum + components[key] * WEIGHTS[key],
    0
  );
  return {
    score: raw,
    components,
    methodology: MOMENTUM_METHODOLOGY,
    methodologyVisible: true
  };
}

export interface ConditionComparable {
  propertyId: string;
  hvacCondition: number;
  plumbingCondition: number;
  electricalCondition: number;
  otherCondition: number;
  evidenceSupported: boolean;
}

export interface PropertyConditionDelta {
  subjectId: string;
  delta: number;
  accountedSystems: Array<"hvac" | "plumbing" | "electrical" | "other">;
  usedUnsupportedComps: false;
}

export function propertyConditionDelta(
  subject: ConditionComparable,
  comps: ConditionComparable[]
): PropertyConditionDelta {
  const usable = comps.filter((c) => c.evidenceSupported);
  if (usable.length === 0) {
    throw new Error("condition delta requires evidence-supported comparables");
  }
  const subjectScore =
    subject.hvacCondition + subject.plumbingCondition + subject.electricalCondition + subject.otherCondition;
  const avg =
    usable.reduce(
      (sum, c) => sum + c.hvacCondition + c.plumbingCondition + c.electricalCondition + c.otherCondition,
      0
    ) / usable.length;
  return {
    subjectId: subject.propertyId,
    delta: subjectScore - avg,
    accountedSystems: ["hvac", "plumbing", "electrical", "other"],
    usedUnsupportedComps: false
  };
}
