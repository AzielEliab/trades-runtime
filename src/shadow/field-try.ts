import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCoverage } from "../domain/coverage-map.js";
import { loadDrivePerformance } from "../domain/drive-miles.js";
import { buildFriction } from "../domain/friction.js";
import { readPositionFile } from "../domain/local-positions.js";
import { buildRightTech } from "../domain/right-tech.js";
import { loadTimeTracking } from "../domain/time-tracking.js";
import { fieldFlagsFromInboundRow, readFieldFlagDirectory } from "../desk/field-flags.js";
import { RUNTIME_MANIFEST } from "../manifest.js";
import { mayWriteProBooks } from "../spine/probooks-shadow.js";
import { mayWriteServiceTitan } from "../spine/servicetitan-shadow.js";

/**
 * Local shadow field software. Fixtures only.
 * This file does not import the office shadow runner.
 * Not Field 1.0. Not a live company. Does not start a pilot.
 */

export const FIELD_SAMPLE_BRANCH = "sample-shop";
export const FIELD_FIXTURE_ROOT = join("test", "fixtures", "sample-branch", "field");

export interface FieldShadowReport {
  product: "trades-runtime";
  version: string;
  author: "Aziel Eliab";
  surface: "field-shadow";
  sampleBranch: typeof FIELD_SAMPLE_BRANCH;
  office_softwares_1_0: false;
  field_softwares_1_0: false;
  field_claim: false;
  company_os_live: false;
  live_backends: false;
  pilot_started: false;
  writes: false;
  servicetitanWrite: false;
  probooksWrite: false;
  inventedAccuracy: false;
  notALiveGps: true;
  telematicsVendor: false;
  pages: "off";
  flags: { flagId: string; vanId: string; kind: string; severity: string }[];
  vanNotInvented: string[];
  timeCards: number;
  timeSource: string;
  coveragePlaces: number;
  coverageSource: string;
  rightTech: { technicianId: string; autoDispatch: false; writeBack: "refused" } | null;
  note: string;
}

export function runFieldShadow(options?: { repoRoot?: string; now?: string }): FieldShadowReport {
  const repoRoot = options?.repoRoot ?? process.cwd();
  const now = options?.now ?? "2026-10-03T16:30:00.000Z";
  const root = join(repoRoot, FIELD_FIXTURE_ROOT);
  const fromFiles = readFieldFlagDirectory(join(root, "flags"));
  const rowPath = join(root, "inbound-rows.json");
  const parsed = JSON.parse(readFileSync(rowPath, "utf8")) as { jobs?: Record<string, unknown>[] };
  const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  const inboundFlags: FieldShadowReport["flags"] = [];
  const vanNotInvented: string[] = [];
  for (const job of jobs) {
    const jobId = typeof job.id === "string" ? job.id : "row";
    const extracted = fieldFlagsFromInboundRow({ raw: job, jobId, now, raisedBy: "sample-tech" });
    for (const flag of extracted.flags) {
      inboundFlags.push({ flagId: flag.flagId, vanId: flag.vanId, kind: flag.kind, severity: flag.severity });
    }
    for (const notice of extracted.notices) {
      if (notice.title === "Field flag waiting on a van") vanNotInvented.push(jobId);
    }
  }
  const flags = [
    ...fromFiles.flags.map((flag) => ({
      flagId: flag.flagId,
      vanId: flag.vanId,
      kind: flag.kind,
      severity: flag.severity
    })),
    ...inboundFlags
  ];
  const time = loadTimeTracking({
    cwd: repoRoot,
    instanceId: "sample-shop",
    now,
    allowSynthetic: false,
    explicitPath: join(root, "time-cards.json")
  });
  const coverage = loadCoverage({
    cwd: repoRoot,
    instanceId: "sample-shop",
    allowSynthetic: false,
    explicitPath: join(root, "coverage.json"),
    pins: []
  });
  const pins = readPositionFile(join(root, "positions.json"));
  const drive = loadDrivePerformance({
    cwd: repoRoot,
    instanceId: "sample-shop",
    allowSynthetic: false,
    completedJobs: null
  });
  const friction = buildFriction({ source: "unknown", jobs: [], collaborations: [] });
  const right = buildRightTech({
    dataLabel: "sample-shop-fixture",
    calls: [{ id: "JOB-1", lane: "hvac", status: "Scheduled", technicianName: null }],
    time,
    pins,
    coverage,
    friction,
    drive,
    jobId: "JOB-1"
  });
  const top = right.suggestions[0];
  return {
    product: "trades-runtime",
    version: RUNTIME_MANIFEST.version,
    author: "Aziel Eliab",
    surface: "field-shadow",
    sampleBranch: FIELD_SAMPLE_BRANCH,
    office_softwares_1_0: false,
    field_softwares_1_0: false,
    field_claim: false,
    company_os_live: false,
    live_backends: false,
    pilot_started: false,
    writes: false,
    servicetitanWrite: mayWriteServiceTitan(),
    probooksWrite: mayWriteProBooks(),
    inventedAccuracy: false,
    notALiveGps: true,
    telematicsVendor: false,
    pages: "off",
    flags,
    vanNotInvented,
    timeCards: time.cards.length,
    timeSource: time.source,
    coveragePlaces: coverage.totals.features,
    coverageSource: coverage.source,
    rightTech: top
      ? { technicianId: top.technicianId, autoDispatch: false, writeBack: "refused" }
      : null,
    note: "Local shadow field software on sample branch sample-shop. Fixtures already in the repo. Needs-parts, safety, escalation, van-down, and callback-risk stay local files. Not Field 1.0. Not a live GPS feed. Not a company van. Office software is a separate command: npm run shadow:office. Merging this repo does not start a pilot. Aziel Eliab is the author, not the operator."
  };
}

export function printFieldShadow(): void {
  process.stdout.write(`${JSON.stringify(runFieldShadow(), null, 2)}\n`);
}
