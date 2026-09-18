import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfidenceSeparation } from "../core/confidence.js";
import type { HumanOverride } from "../core/human-authority.js";
import { createOneBranchShadowConfig, requestShadowModeChange } from "../core/shadow-branch.js";
import { settleRequired } from "../core/settlement-harness.js";
import { sealCounterfactual } from "../inherited/shadow-engine.js";
import {
  mayWriteServiceTitan,
  refuseServiceTitanWrite,
  refuseServiceTitanWriteMethod
} from "../spine/servicetitan-shadow.js";
import {
  mayWriteProBooks,
  refuseProBooksWrite,
  refuseProBooksWriteMethod
} from "../spine/probooks-shadow.js";

export interface SealedShadowDayFixture {
  day: string;
  sealedAt: string;
  settledAt: string;
  plannedAction: string;
  knownInputs: Record<string, unknown>;
  expected: Record<string, unknown>;
  confidence: ConfidenceSeparation;
  actualOutcome: Record<string, unknown>;
  override: HumanOverride | null;
}

export interface SealedShadowFixtureFile {
  synthetic: true;
  customerData: false;
  pilotStarted: false;
  fieldLaunch: false;
  branchId: string;
  mode: "SHADOW-SEALED";
  days: SealedShadowDayFixture[];
}

export interface SealedShadowDayProof {
  day: string;
  mode: "SHADOW-SEALED";
  plannedAction: string;
  contemporaneousEvidenceHash: string;
  prediction_confidence: number;
  evidence_strength: string;
  source_quality: string;
  cross_source_agreement: string;
  verification_status: string;
  humanOverride: HumanOverride | null;
  actualOutcome: Record<string, unknown>;
  timeToSettleMs: number;
  sealedRecommendationHash: string;
  settlementHash: string;
  hindsightLeak: false;
}

export interface SealedShadowDemoProof {
  synthetic: true;
  customerData: false;
  authoringNodeIsCustodian: false;
  pilotStarted: false;
  fieldLaunch: false;
  optionC: "code-ready-pilot-not-started";
  optionD: "not-started";
  branchId: string;
  mode: "SHADOW-SEALED";
  autoPromote: false;
  autoPromoteRefused: true;
  days: number;
  settlements: SealedShadowDayProof[];
  settlementHashes: string[];
  writesThrew: true;
  writeRefusals: string[];
  mayWriteServiceTitan: false;
  mayWriteProBooks: false;
}

function defaultFixturePath(): string {
  return join(process.cwd(), "test", "fixtures", "shadow-sealed-days.json");
}

function writeRefused(fn: () => never): string {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/refused/.test(message)) return message;
    throw error;
  }
  throw new Error("expected live write to throw");
}

export function loadSealedShadowFixture(path = defaultFixturePath()): SealedShadowFixtureFile {
  const fixture = JSON.parse(readFileSync(path, "utf8")) as SealedShadowFixtureFile;
  if (fixture.synthetic !== true || fixture.customerData !== false) {
    throw new Error("sealed shadow demo fixtures must be synthetic (not customer data)");
  }
  if (!Array.isArray(fixture.days) || fixture.days.length === 0) {
    throw new Error("sealed shadow demo requires N synthetic days");
  }
  return fixture;
}

/**
 * Operator-software proof: N sealed synthetic shadow days with required
 * settlement fields. Mode stays SHADOW-SEALED. Auto-promote is refused.
 * Not a company pilot. Not a customer dump.
 */
export function runSealedShadowDemo(options: { fixturePath?: string } = {}): SealedShadowDemoProof {
  const fixture = loadSealedShadowFixture(options.fixturePath);
  const config = createOneBranchShadowConfig({
    branchId: fixture.branchId,
    mode: "SHADOW-SEALED"
  });

  let autoPromoteRefused = false;
  try {
    requestShadowModeChange(config, "SHADOW-VISIBLE", { kind: "auto" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/never auto-promote/.test(message)) autoPromoteRefused = true;
    else throw error;
  }
  if (!autoPromoteRefused) {
    throw new Error("auto-promote SHADOW-SEALED → SHADOW-VISIBLE must throw");
  }

  const settlements: SealedShadowDayProof[] = [];
  for (const day of fixture.days) {
    const sealed = sealCounterfactual({
      knownInputs: day.knownInputs,
      action: day.plannedAction,
      expected: day.expected,
      confidence: day.confidence,
      sealedAt: day.sealedAt
    });
    const settled = settleRequired(sealed, day.actualOutcome, {
      settledAt: day.settledAt,
      mode: config.mode,
      override: day.override
    });
    settlements.push({
      day: day.day,
      mode: "SHADOW-SEALED",
      plannedAction: settled.plannedAction,
      contemporaneousEvidenceHash: settled.contemporaneousEvidenceHash,
      prediction_confidence: settled.prediction_confidence,
      evidence_strength: settled.evidence_strength,
      source_quality: settled.source_quality,
      cross_source_agreement: settled.cross_source_agreement,
      verification_status: settled.verification_status,
      humanOverride: settled.humanOverride,
      actualOutcome: settled.actualOutcome,
      timeToSettleMs: settled.timeToSettleMs,
      sealedRecommendationHash: settled.sealedRecommendationHash,
      settlementHash: settled.settlementHash,
      hindsightLeak: false
    });
  }

  const writeRefusals = [
    writeRefused(() => refuseServiceTitanWrite("job.update")),
    writeRefused(() => refuseServiceTitanWriteMethod("POST")),
    writeRefused(() => refuseProBooksWrite("item.update")),
    writeRefused(() => refuseProBooksWriteMethod("PATCH"))
  ];

  if (mayWriteServiceTitan() || mayWriteProBooks()) {
    throw new Error("ServiceTitan and ProBooks writes must stay refused");
  }

  return {
    synthetic: true,
    customerData: false,
    authoringNodeIsCustodian: false,
    pilotStarted: false,
    fieldLaunch: false,
    optionC: "code-ready-pilot-not-started",
    optionD: "not-started",
    branchId: config.branchId,
    mode: "SHADOW-SEALED",
    autoPromote: false,
    autoPromoteRefused: true,
    days: settlements.length,
    settlements,
    settlementHashes: settlements.map((row) => row.settlementHash),
    writesThrew: true,
    writeRefusals,
    mayWriteServiceTitan: false,
    mayWriteProBooks: false
  };
}

export function printSealedShadowDemo(proof = runSealedShadowDemo()): SealedShadowDemoProof {
  process.stdout.write(
    `${JSON.stringify(
      {
        demo: "shadow-sealed",
        mode: proof.mode,
        branchId: proof.branchId,
        optionC: proof.optionC,
        optionD: proof.optionD,
        pilotStarted: proof.pilotStarted,
        synthetic: proof.synthetic,
        settlementHashes: proof.settlementHashes,
        sealedRecommendationHashes: proof.settlements.map((row) => row.sealedRecommendationHash),
        days: proof.days,
        writesThrew: proof.writesThrew,
        proof
      },
      null,
      2
    )}\n`
  );
  return proof;
}
