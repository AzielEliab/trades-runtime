import type { OperatingMode } from "../core/modes.js";

export type AnalyticalLevel = "descriptive" | "diagnostic" | "predictive" | "prescriptive";
export type ReportStatus = "observed" | "estimated" | "attributed" | "reconciled" | "simulated" | "unresolved";

export interface ReportMetadata {
  scope: string;
  dataSources: string[];
  sampleSize: number;
  formula: string;
  assumptions: string[];
  confidenceNote: string;
  status: ReportStatus;
  versionLineage: string;
  receiptRefs: string[];
}

export interface AnalyticsQuery {
  level: AnalyticalLevel;
  question: string;
  mode?: OperatingMode;
}

export function requireReportMetadata(meta: Partial<ReportMetadata>): ReportMetadata {
  const required: (keyof ReportMetadata)[] = [
    "scope",
    "dataSources",
    "sampleSize",
    "formula",
    "assumptions",
    "confidenceNote",
    "status",
    "versionLineage",
    "receiptRefs"
  ];
  for (const key of required) {
    if (meta[key] == null) {
      throw new Error(`mandatory report metadata missing: ${key}`);
    }
  }
  if ((meta.sampleSize ?? 0) < 0) {
    throw new Error("sampleSize cannot be negative");
  }
  return meta as ReportMetadata;
}

export function estimatedIsNotRealized(status: ReportStatus): boolean {
  return status === "estimated" || status === "simulated";
}
