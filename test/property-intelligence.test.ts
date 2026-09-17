import { describe, expect, it } from "vitest";
import {
  isHighConfidenceUnsupported,
  mayAutonomousHighConsequence
} from "../src/core/confidence.js";
import {
  advanceLifecycle,
  asPriorNotTruth,
  attachFact,
  createPropertyRecord,
  ingestSourceKind,
  marketDataIsAutomaticTruth,
  mayTreatAsVerifiedPropertyFact,
  PROPERTY_LIFECYCLE,
  type PropertyFact
} from "../src/domain/property-record.js";
import {
  estimatedEffectFromWork,
  recordImprovement,
  repairCostEqualsResaleUplift
} from "../src/domain/property-improvement-ledger.js";
import {
  mortgageDemandPressure,
  projectTrajectory,
  propertyValueIsGuarantee,
  rangeIsNotFalsePrecision,
  refuseMortgageHaircut,
  settleAgainstSale,
  unsupportedHighConfidenceBlocksGuarantee,
  valueRange
} from "../src/domain/property-value-engine.js";
import { neighborhoodMomentum, propertyConditionDelta } from "../src/domain/neighborhood-momentum.js";
import {
  asDiagnosticPrior,
  mayCallVerifiedSubjectDefect,
  neighborhoodPatternProvesSubjectDefect,
  type NeighborhoodPattern
} from "../src/domain/neighborhood-failure-patterns.js";
import {
  evidenceWeight,
  GEO_LEVELS,
  moreSpecificOutweighsBroader,
  PATTERN_LADDER,
  promotePattern,
  weakenOnThinEvidence,
  type PatternEvidence
} from "../src/domain/regional-recalibration.js";
import { hookCallFit, hookFieldAdvisor } from "../src/domain/property-intelligence-hooks.js";
import { RULES_PROPERTY } from "../src/rules/constitution.js";

const unverifiedMarket: PropertyFact["confidence"] = {
  predictionConfidence: 0.97,
  evidenceStrength: "LOW",
  sourceQuality: "MEDIUM",
  agreement: "LOW",
  verificationStatus: "UNVERIFIED"
};

const marketFact = (over: Partial<PropertyFact> = {}): PropertyFact => ({
  claim: "last-sale-220k",
  sourceKind: "licensed-market-api",
  sourceId: "mls:1",
  observedAt: "2024-01-01T00:00:00Z",
  retrievedAt: "2026-09-12T00:00:00Z",
  freshnessDays: 620,
  confidence: unverifiedMarket,
  conflicts: [],
  corroboratedByFieldOrAuthority: false,
  ...over
});

const observedPattern = (over: Partial<NeighborhoodPattern> = {}): NeighborhoodPattern => ({
  patternId: "p1",
  kind: "ObservedNeighborhoodPattern",
  trade: "plumbing",
  patternClass: "orangeburg-collapse",
  neighborhoodId: "n-west",
  comparableCaseCount: 7,
  riskLevel: "high",
  evidenceBasis: "nearby completed laterals",
  verifiedOnSubjectProperty: false,
  ...over
});

const thin: PatternEvidence = {
  sampleSize: 2,
  geographicConcentration: 0.2,
  constructionSimilarity: 0.2,
  materialSimilarity: 0.2,
  technicianConfirmations: 0,
  outcomeConfirmations: 0,
  recencyDays: 800,
  crossBranchAgreement: 0.1,
  conflicting: true,
  stale: true,
  cohortDissimilar: true,
  stoppedRecurring: false
};

const strong: PatternEvidence = {
  sampleSize: 40,
  geographicConcentration: 0.8,
  constructionSimilarity: 0.85,
  materialSimilarity: 0.9,
  technicianConfirmations: 12,
  outcomeConfirmations: 10,
  recencyDays: 40,
  crossBranchAgreement: 0.8,
  conflicting: false,
  stale: false,
  cohortDissimilar: false,
  stoppedRecurring: false
};

describe("Property Intelligence v1.0 governance", () => {
  it("lists the six hard property-intelligence rules", () => {
    expect(RULES_PROPERTY).toHaveLength(6);
  });

  it("neighborhood pattern is not a verified property defect", () => {
    expect(neighborhoodPatternProvesSubjectDefect()).toBe(false);
    const prior = asDiagnosticPrior(observedPattern());
    expect(prior.proofOfSubjectDefect).toBe(false);
    expect(prior.diagnosticPrior).toBe(true);
    expect(mayCallVerifiedSubjectDefect(observedPattern())).toBe(false);
    expect(mayCallVerifiedSubjectDefect(observedPattern({
      kind: "VerifiedPropertyCondition",
      verifiedOnSubjectProperty: true
    }))).toBe(true);
  });

  it("public/market data is a prior, not automatic truth, until corroborated", () => {
    expect(marketDataIsAutomaticTruth()).toBe(false);
    const fact = marketFact();
    expect(asPriorNotTruth(fact).automaticTruth).toBe(false);
    expect(mayTreatAsVerifiedPropertyFact(fact)).toBe(false);
    expect(mayTreatAsVerifiedPropertyFact(marketFact({
      corroboratedByFieldOrAuthority: true,
      confidence: {
        predictionConfidence: 0.7,
        evidenceStrength: "HIGH",
        sourceQuality: "HIGH",
        agreement: "HIGH",
        verificationStatus: "VERIFIED"
      }
    }))).toBe(true);
  });

  it("property-value effects are estimate ranges, not guarantees", () => {
    const range = valueRange(180000, 200000, 225000);
    expect(propertyValueIsGuarantee()).toBe(false);
    expect(range.guarantee).toBe(false);
    expect(rangeIsNotFalsePrecision(range)).toBe(true);
    const settled = settleAgainstSale(range, 210000);
    expect(settled.estimateWasGuarantee).toBe(false);
    expect(settled.error).toBe(10000);
  });

  it("repair cost is never assumed to equal resale-value increase", () => {
    expect(repairCostEqualsResaleUplift()).toBe(false);
    const effect = estimatedEffectFromWork(8000, "ValueAdded");
    expect(effect.mid).not.toBe(8000);
    expect(() => recordImprovement({
      date: "2026-09-01",
      trade: "hvac",
      work: "condenser replace",
      cost: 8000,
      asset: "condenser",
      remainingLifeChangeYears: 12,
      evidenceIds: ["e1"],
      category: "ValueAdded",
      estimatedValueEffect: valueRange(8000, 8000, 8000),
      confidence: {
        predictionConfidence: 0.4,
        evidenceStrength: "MEDIUM",
        sourceQuality: "MEDIUM",
        agreement: "MEDIUM",
        verificationStatus: "PARTIAL"
      }
    })).toThrow(/never equal assumed resale-value/);
  });

  it("reuses confidence ≠ truth: 97% + LOW + UNVERIFIED is not verified property fact", () => {
    expect(isHighConfidenceUnsupported(unverifiedMarket)).toBe(true);
    expect(mayAutonomousHighConsequence(unverifiedMarket)).toBe(false);
    expect(unsupportedHighConfidenceBlocksGuarantee(unverifiedMarket)).toBe(true);
    expect(mayTreatAsVerifiedPropertyFact(marketFact())).toBe(false);
  });

  it("refuses unauthorized scraping as a source kind", () => {
    expect(ingestSourceKind("county-assessor")).toBe("county-assessor");
    expect(() => ingestSourceKind("unauthorized-scrape")).toThrow(/unauthorized scraping/);
  });
});

describe("Property Intelligence v1.0 engines", () => {
  it("advances the living property lifecycle", () => {
    let record = createPropertyRecord("tr:property:100-oak");
    expect(record.lifecycle).toBe("baseline");
    for (let i = 1; i < PROPERTY_LIFECYCLE.length; i += 1) {
      record = advanceLifecycle(record);
    }
    expect(record.lifecycle).toBe("trajectory");
    record = attachFact(record, marketFact());
    expect(record.facts).toHaveLength(1);
  });

  it("tracks nominal and real value; mortgage widens uncertainty instead of haircutting mid", () => {
    const previous = valueRange(190000, 200000, 210000);
    const mortgage = mortgageDemandPressure(7.5);
    expect(mortgage.appliedAsValueHaircut).toBe(false);
    expect(mortgage.purchasingPowerIndex).toBeLessThan(1);
    expect(() => refuseMortgageHaircut()).toThrow(/not a simplistic fixed percentage/);
    const path = projectTrajectory({
      previousNominal: previous,
      inflationFactor: 1.1,
      marketMovement: 4000,
      neighborhoodMovement: 1500,
      conditionMovement: -800,
      completedWorkEffect: 1200,
      depreciation: 600,
      confidence: {
        predictionConfidence: 0.55,
        evidenceStrength: "MEDIUM",
        sourceQuality: "MEDIUM",
        agreement: "MEDIUM",
        verificationStatus: "PARTIAL"
      },
      mortgage
    });
    expect(path.current.inflationAdjusted.mid).toBeCloseTo(path.current.nominal.mid / 1.1);
    expect(path.current.nominal.mid).toBe(previous.mid + 4000 + 1500 - 800 + 1200 - 600);
    expect(path.contributors.map((c) => c.name)).toContain("completed-work-effect");
    expect(path.attributionEstimated).toBe(true);
    expect(path.current.nominal.low).toBeLessThan(path.current.nominal.mid);
    expect(path.current.nominal.high).toBeGreaterThan(path.current.nominal.mid);
  });

  it("exposes neighborhood momentum methodology and condition delta vs evidence-supported comps", () => {
    const score = neighborhoodMomentum({
      comparableSaleTrend: 0.8,
      pricePerSqft: 0.6,
      transactionVelocity: 0.5,
      inventory: 0.3,
      daysOnMarket: 0.4,
      saleToList: 0.7,
      constructionPermitActivity: 0.2,
      distress: 0.1
    });
    expect(score.methodologyVisible).toBe(true);
    expect(score.methodology).toMatch(/visible/i);
    expect(() => propertyConditionDelta(
      { propertyId: "s", hvacCondition: 0.4, plumbingCondition: 0.5, electricalCondition: 0.5, otherCondition: 0.5, evidenceSupported: true },
      [{ propertyId: "c", hvacCondition: 0.8, plumbingCondition: 0.8, electricalCondition: 0.8, otherCondition: 0.8, evidenceSupported: false }]
    )).toThrow(/evidence-supported/);
    const delta = propertyConditionDelta(
      { propertyId: "s", hvacCondition: 0.4, plumbingCondition: 0.5, electricalCondition: 0.5, otherCondition: 0.5, evidenceSupported: true },
      [{ propertyId: "c", hvacCondition: 0.8, plumbingCondition: 0.8, electricalCondition: 0.8, otherCondition: 0.8, evidenceSupported: true }]
    );
    expect(delta.delta).toBeLessThan(0);
    expect(delta.usedUnsupportedComps).toBe(false);
  });

  it("weakens thin/stale/conflicting regional samples and lists the promotion ladder", () => {
    expect(GEO_LEVELS).toEqual(["company", "region", "branch", "zip", "neighborhood", "cohort", "property"]);
    expect(PATTERN_LADDER).toEqual([
      "OBSERVED",
      "CANDIDATE",
      "REGIONALLY_SUPPORTED",
      "VERIFIED",
      "ACTIVE_PRIOR",
      "MONITORED_FOR_DRIFT",
      "RETIRED"
    ]);
    expect(weakenOnThinEvidence(thin)).toBe(true);
    expect(evidenceWeight(thin)).toBeLessThan(evidenceWeight(strong));
    expect(promotePattern("OBSERVED", thin)).toBe("OBSERVED");
    expect(promotePattern("CANDIDATE", strong)).toBe("VERIFIED");
    expect(moreSpecificOutweighsBroader(
      { level: "property", weight: 0.6 },
      { level: "region", weight: 0.9 }
    )).toBe(true);
  });

  it("downstream hooks stay non-live and do not promote priors to verified facts", () => {
    const advisor = hookFieldAdvisor([observedPattern()]);
    expect(advisor.live).toBe(false);
    expect(advisor.treatedAsVerifiedPropertyFact).toBe(false);
    expect(advisor.payload.hypotheses).toContain("orangeburg-collapse");
    const fit = hookCallFit({
      quality: 0.8,
      competence: 0.8,
      technicalFit: 0.7,
      clientFit: 0.7,
      geolocation: 0.9,
      inventory: 0.7,
      runtime: 0.7,
      contribution: 0.6,
      margin: 0.6,
      scheduleImpact: 0.7,
      exploration: 0.1
    }, 0.4);
    expect(fit.payload.geographyStillNotSole).toBe(true);
    expect(fit.payload.factors.technicalFit).toBeLessThanOrEqual(0.85);
  });
});
