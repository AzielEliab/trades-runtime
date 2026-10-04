import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOperatorSnapshot } from "../desk/snapshot.js";
import { RUNTIME_MANIFEST } from "../manifest.js";
import { mayWriteProBooks } from "../spine/probooks-shadow.js";
import { mayWriteServiceTitan } from "../spine/servicetitan-shadow.js";

/**
 * Local shadow office software. Fixtures only.
 * This file does not import field flags. Field software is src/shadow/field-try.ts.
 * Not Office Softwares 1.0. Not a live company. Does not start a pilot.
 */

export const OFFICE_SAMPLE_BRANCH = "sample-shop";
export const OFFICE_FIXTURE_ROOT = join("test", "fixtures", "sample-branch", "office");

export interface OfficeShadowReport {
  product: "trades-runtime";
  version: string;
  author: "Aziel Eliab";
  surface: "office-shadow";
  sampleBranch: typeof OFFICE_SAMPLE_BRANCH;
  office_softwares_1_0: false;
  field_softwares_1_0: false;
  field_claim: false;
  company_os_live: false;
  live_backends: false;
  pilot_started: false;
  writes: false;
  servicetitanWrite: false;
  probooksWrite: false;
  pages: "off";
  dataLabel: string;
  jobs: number;
  huddleTechs: number;
  qualityScoreIsAccuracyPercent: false;
  alertStubs: number;
  alertStubsWriteBack: "refused";
  fieldFlagsOnThisRun: number;
  startGatePilot: string;
  note: string;
}

export function runOfficeShadow(options?: { repoRoot?: string; now?: string }): OfficeShadowReport {
  const repoRoot = options?.repoRoot ?? process.cwd();
  const now = options?.now ?? "2026-10-03T16:00:00.000Z";
  const root = mkdtempSync(join(tmpdir(), "tr-office-shadow-"));
  try {
    const stDir = join(root, "data", "inbound", "servicetitan");
    const pbDir = join(root, "data", "inbound", "probooks");
    const appDir = join(root, "data", "inbound", "trades-app");
    mkdirSync(stDir, { recursive: true });
    mkdirSync(pbDir, { recursive: true });
    mkdirSync(appDir, { recursive: true });
    cpSync(join(repoRoot, OFFICE_FIXTURE_ROOT, "servicetitan.json"), join(stDir, "servicetitan.json"));
    cpSync(join(repoRoot, OFFICE_FIXTURE_ROOT, "probooks.json"), join(pbDir, "probooks.json"));
    const snapshot = buildOperatorSnapshot({
      cwd: root,
      now,
      persistAlertState: false,
      persistLocalReports: false,
      folders: [
        { dir: stDir, preferClass: "servicetitan" },
        { dir: pbDir, preferClass: "probooks" },
        { dir: appDir, preferClass: "trades-app" }
      ]
    });
    const fieldFlagsOnThisRun = snapshot.ruleAlerts.filter((alert) => alert.rule === "field-flag").length;
    return {
      product: "trades-runtime",
      version: RUNTIME_MANIFEST.version,
      author: "Aziel Eliab",
      surface: "office-shadow",
      sampleBranch: OFFICE_SAMPLE_BRANCH,
      office_softwares_1_0: false,
      field_softwares_1_0: false,
      field_claim: false,
      company_os_live: false,
      live_backends: false,
      pilot_started: false,
      writes: false,
      servicetitanWrite: mayWriteServiceTitan(),
      probooksWrite: mayWriteProBooks(),
      pages: "off",
      dataLabel: snapshot.dataLabel,
      jobs: snapshot.metrics.jobs,
      huddleTechs: snapshot.huddle.techs.length,
      qualityScoreIsAccuracyPercent: false,
      alertStubs: snapshot.alertActions.stubs.length,
      alertStubsWriteBack: "refused",
      fieldFlagsOnThisRun,
      startGatePilot: snapshot.optionCStartGate.pilot,
      note: "Local shadow office software on sample branch sample-shop. Synthetic fixtures already in the repo. Not Office Softwares 1.0. Not a live company. Not a ServiceTitan or ProBooks tenant. Field software is a separate command: npm run shadow:field. Merging this repo does not start a pilot. Aziel Eliab is the author, not the operator."
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function printOfficeShadow(): void {
  process.stdout.write(`${JSON.stringify(runOfficeShadow(), null, 2)}\n`);
}
