import { entityId } from "../core/ids.js";
import {
  attachFact,
  createPropertyRecord,
  type PropertyRecord
} from "./property-record.js";
import {
  recordImprovement,
  repairCostEqualsResaleUplift,
  type ImprovementCategory,
  type ImprovementEntry
} from "./property-improvement-ledger.js";
import {
  asDiagnosticPrior,
  mayCallVerifiedSubjectDefect,
  neighborhoodPatternProvesSubjectDefect,
  type NeighborhoodPattern
} from "./neighborhood-failure-patterns.js";
import type { ConfidenceSeparation } from "../core/confidence.js";

export interface FieldJob {
  jobId: string;
  address: string;
  branchId: string;
  trade: ImprovementEntry["trade"];
  status: "open" | "completed";
  work?: string;
  cost?: number;
  asset?: string;
  completedAt?: string;
  propertyId?: string;
}

export interface AttachedJob {
  job: FieldJob;
  property: PropertyRecord;
}

const priorConfidence: ConfidenceSeparation = {
  predictionConfidence: 0.4,
  evidenceStrength: "MEDIUM",
  sourceQuality: "MEDIUM",
  agreement: "MEDIUM",
  verificationStatus: "PARTIAL"
};

export function propertyIdForAddress(address: string): string {
  return entityId("property", address.trim().toLowerCase());
}

/** A job attaches to an address. Market/listing scrape is not a source. */
export function attachJobToAddress(job: FieldJob, property?: PropertyRecord): AttachedJob {
  const propertyId = job.propertyId ?? property?.propertyId ?? propertyIdForAddress(job.address);
  const record = property ?? createPropertyRecord(propertyId);
  const withAddress = attachFact(record, {
    claim: `service-address:${job.address}`,
    sourceKind: "company-service-history",
    sourceId: job.jobId,
    observedAt: job.completedAt ?? "1970-01-01T00:00:00Z",
    retrievedAt: job.completedAt ?? "1970-01-01T00:00:00Z",
    freshnessDays: 0,
    confidence: priorConfidence,
    conflicts: [],
    corroboratedByFieldOrAuthority: false
  });
  return {
    job: { ...job, propertyId: withAddress.propertyId },
    property: withAddress
  };
}

export function appendImprovementFromCompletedJob(
  property: PropertyRecord,
  job: FieldJob,
  category: ImprovementCategory = "ValuePreserved"
): { property: PropertyRecord; entry: ImprovementEntry } {
  if (job.status !== "completed") {
    throw new Error("improvement ledger appends only from completed work");
  }
  if (job.propertyId && job.propertyId !== property.propertyId) {
    throw new Error("job is not attached to this property");
  }
  const entry = recordImprovement({
    date: job.completedAt ?? "1970-01-01T00:00:00Z",
    trade: job.trade,
    work: job.work ?? "completed field work",
    cost: job.cost ?? 0,
    asset: job.asset ?? job.trade,
    remainingLifeChangeYears: 1,
    evidenceIds: [job.jobId],
    category,
    confidence: priorConfidence
  });
  if (repairCostEqualsResaleUplift()) {
    throw new Error("repair cost must never equal assumed resale-value increase");
  }
  const next = attachFact(property, {
    claim: `completed-work:${job.jobId}`,
    sourceKind: "company-service-history",
    sourceId: job.jobId,
    observedAt: entry.date,
    retrievedAt: entry.date,
    freshnessDays: 0,
    confidence: priorConfidence,
    conflicts: [],
    corroboratedByFieldOrAuthority: true
  });
  return { property: next, entry };
}

export function jobPatternIsNotDefect(pattern: NeighborhoodPattern): {
  diagnosticPrior: true;
  proofOfSubjectDefect: false;
  verifiedSubjectDefect: boolean;
} {
  const prior = asDiagnosticPrior(pattern);
  return {
    diagnosticPrior: prior.diagnosticPrior,
    proofOfSubjectDefect: neighborhoodPatternProvesSubjectDefect(),
    verifiedSubjectDefect: mayCallVerifiedSubjectDefect(pattern)
  };
}
