import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOneBranchShadowConfig } from "../core/shadow-branch.js";
import { RUNTIME_MANIFEST } from "../manifest.js";
import { DurableReceiptStore } from "./durable-receipts.js";
import { isHostedTenantLayout } from "./inbound-layout.js";
import { LOCAL_SOFTWARES_LABEL, LOCAL_SOFTWARES_TRACK } from "./local-softwares-gate.js";
import { runOptionCPrep, OPTION_C_PREP_BRANCH } from "./option-c-prep.js";
import {
  readIsolatePilot,
  resolveInstanceId,
  writeIsolatePilot,
  type IsolateInboundKind,
  type IsolatePilotRecord
} from "./pilot-isolate.js";
import { isolateReceiptPath } from "./runtime-isolate.js";
import { mayWriteProBooks, refuseProBooksWrite } from "./probooks-shadow.js";
import { mayWriteServiceTitan, refuseServiceTitanWrite } from "./servicetitan-shadow.js";
import { mayWriteTradesApp, refuseTradesAppWrite } from "./trades-app-shadow.js";

const DATA_FILE = /\.(json|csv)$/i;
const MODULE_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../test/fixtures/byo");

export const OPTION_C_START_REFUSAL = {
  branch: "pilot-start requires --branch <branchId>",
  oneBranch: "pilot-start names one branch",
  prepBranch: "prep branch is not the start branch",
  prep: "prep is not ready",
  companyClaim: "synthetic or empty inbound cannot be claimed as a company",
  otherBranch: "this isolate is already started for a different branch",
  sealed: "shadow config did not stay SHADOW-SEALED with pilotStarted false",
  writes: "live writes are not refused",
  catalog: "shipped catalog flipped live_backends or a company claim"
} as const;

const SUCCESS_CLAIM =
  "Local isolate Option C pilot started for one named branch. SHADOW-SEALED. live_backends false. Writes refused. This is not a company OS live claim. This is not Field 1.0. This is not Office Softwares 1.0.";

export interface OptionCPilotStartOptions {
  cwd?: string;
  /** One named branch. Omit to refuse. */
  branchId?: string;
  /** Every --branch value. More than one refuses. */
  branchIds?: string[];
  /** Operator tried to call this drop a company. Synthetic or empty inbound refuses the start. */
  claimCompany?: boolean;
  fixtureDir?: string;
  now?: string;
  /** Passed through to pilot prep. Default true, matching npm run pilot:prep. */
  bootDesk?: boolean;
}

export interface OptionCPilotStartReceipt {
  kind: "option-c-pilot-start";
  receiptId: string;
  at: string;
  author: "Aziel Eliab";
  identity: "Aziel Eliab";
  version: string;
  product_label: typeof LOCAL_SOFTWARES_LABEL;
  track: typeof LOCAL_SOFTWARES_TRACK;
  branchId: string | null;
  instanceId: string | null;
  pilot_started: boolean;
  accepted: boolean;
  already_started: boolean;
  refused: string | null;
  company_claim_refused: true;
  live_backends: false;
  writes: false;
  pages: "off";
  mode: "SHADOW-SEALED";
  auto_promote: false;
  field_claim: false;
  field_launch: false;
  company_os_live: false;
  office_softwares_1_0: false;
  field_softwares_1_0: false;
  phone_home: false;
  central_dump: false;
  customer_data: false;
  wrapper_is_verification: false;
  verification_status: "UNVERIFIED";
  inbound: IsolateInboundKind | "not-checked";
  synthetic_inbound: boolean;
  prep_ready: boolean;
  claim: string;
  ledger: {
    path: string | null;
    hash: string | null;
    verified: boolean;
  };
}

function defaultFixtureDir(cwd: string): string {
  const local = join(cwd, "test", "fixtures", "byo");
  if (existsSync(local)) return local;
  return MODULE_FIXTURES;
}

function receiptIdFor(at: string): string {
  return `tr:receipt:option-c-pilot-start:${at.replace(/[:.]/g, "-")}`;
}

function emptyLedger(): OptionCPilotStartReceipt["ledger"] {
  return { path: null, hash: null, verified: false };
}

function baseReceipt(at: string, branchId: string | null): OptionCPilotStartReceipt {
  return {
    kind: "option-c-pilot-start",
    receiptId: receiptIdFor(at),
    at,
    author: "Aziel Eliab",
    identity: "Aziel Eliab",
    version: RUNTIME_MANIFEST.version,
    product_label: LOCAL_SOFTWARES_LABEL,
    track: LOCAL_SOFTWARES_TRACK,
    branchId,
    instanceId: null,
    pilot_started: false,
    accepted: false,
    already_started: false,
    refused: null,
    company_claim_refused: true,
    live_backends: false,
    writes: false,
    pages: "off",
    mode: "SHADOW-SEALED",
    auto_promote: false,
    field_claim: false,
    field_launch: false,
    company_os_live: false,
    office_softwares_1_0: false,
    field_softwares_1_0: false,
    phone_home: false,
    central_dump: false,
    customer_data: false,
    wrapper_is_verification: false,
    verification_status: "UNVERIFIED",
    inbound: "not-checked",
    synthetic_inbound: false,
    prep_ready: false,
    claim: "Pilot start refused. Not a company OS. Not Field 1.0. Not Office Softwares 1.0.",
    ledger: emptyLedger()
  };
}

function namedBranch(options: OptionCPilotStartOptions): { branchId: string | null; refused: string | null } {
  const ids = options.branchIds ?? (options.branchId !== undefined ? [options.branchId] : []);
  if (ids.length === 0) return { branchId: null, refused: OPTION_C_START_REFUSAL.branch };
  if (ids.length !== 1) return { branchId: null, refused: OPTION_C_START_REFUSAL.oneBranch };
  const branchId = ids[0]?.trim() ?? "";
  if (!branchId) return { branchId: null, refused: OPTION_C_START_REFUSAL.branch };
  if (branchId.includes(",")) return { branchId: null, refused: OPTION_C_START_REFUSAL.oneBranch };
  if (branchId === OPTION_C_PREP_BRANCH) return { branchId, refused: OPTION_C_START_REFUSAL.prepBranch };
  return { branchId, refused: null };
}

function fixtureHashSet(fixtureDir: string): Set<string> {
  const hashes = new Set<string>();
  if (!existsSync(fixtureDir)) return hashes;
  for (const name of readdirSync(fixtureDir)) {
    const abs = join(fixtureDir, name);
    if (!statSync(abs).isFile() || !DATA_FILE.test(name)) continue;
    hashes.add(createHash("sha256").update(readFileSync(abs)).digest("hex"));
  }
  return hashes;
}

function fileIsSynthetic(abs: string, hashes: Set<string>): boolean {
  const buf = readFileSync(abs);
  if (hashes.has(createHash("sha256").update(buf).digest("hex"))) return true;
  if (!abs.toLowerCase().endsWith(".json")) return false;
  try {
    const parsed = JSON.parse(buf.toString("utf8")) as unknown;
    return Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as { synthetic?: unknown }).synthetic === true;
  } catch {
    return false;
  }
}

export function classifyOperatorInbound(cwd: string, fixtureDir: string): IsolateInboundKind {
  const files: string[] = [];
  for (const name of ["servicetitan", "probooks", "trades-app"]) {
    const dir = join(cwd, "data", "inbound", name);
    if (!existsSync(dir)) continue;
    for (const fileName of readdirSync(dir)) {
      if (!DATA_FILE.test(fileName)) continue;
      const abs = join(dir, fileName);
      if (statSync(abs).isFile()) files.push(abs);
    }
  }
  if (files.length === 0) return "empty";
  const hashes = fixtureHashSet(fixtureDir);
  return files.every((abs) => fileIsSynthetic(abs, hashes)) ? "synthetic-only" : "operator-drop";
}

function catalogClosed(): boolean {
  return (
    RUNTIME_MANIFEST.live_backends === false &&
    RUNTIME_MANIFEST.pilot_started === false &&
    RUNTIME_MANIFEST.field_launch === false &&
    RUNTIME_MANIFEST.field_claim === false &&
    RUNTIME_MANIFEST.company_os_live === false
  );
}

function writesRefused(): boolean {
  if (mayWriteServiceTitan() !== false || mayWriteProBooks() !== false || mayWriteTradesApp() !== false) return false;
  const probes = [
    () => refuseServiceTitanWrite("POST"),
    () => refuseProBooksWrite("POST"),
    () => refuseTradesAppWrite("POST")
  ];
  for (const probe of probes) {
    try {
      probe();
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/refused/.test(message)) return false;
    }
  }
  return true;
}

function appendLedger(
  cwd: string,
  instanceId: string,
  receipt: OptionCPilotStartReceipt
): OptionCPilotStartReceipt["ledger"] {
  const rel = isolateReceiptPath(instanceId);
  if (isHostedTenantLayout(rel) || isHostedTenantLayout(join(cwd, rel))) return emptyLedger();
  const store = new DurableReceiptStore(isAbsolute(rel) ? rel : join(cwd, rel));
  const stored = store.appendKind("lifecycle", receipt.receiptId, receipt.at, {
    event: "option-c-pilot-start",
    branchId: receipt.branchId,
    pilot_started: receipt.pilot_started,
    live_backends: false,
    writes: false,
    pages: "off",
    mode: "SHADOW-SEALED",
    auto_promote: false,
    field_claim: false,
    field_launch: false,
    company_os_live: false,
    office_softwares_1_0: false,
    field_softwares_1_0: false,
    inbound: receipt.inbound,
    customer_data: false,
    wrapper_is_verification: false,
    accepted: receipt.accepted,
    refused: receipt.refused,
    claim: receipt.claim,
    at: receipt.at
  });
  return { path: rel, hash: stored.hash, verified: store.verify() };
}

function successClaim(inbound: IsolateInboundKind): string {
  if (inbound === "synthetic-only") {
    return `${SUCCESS_CLAIM} Synthetic inbound is not their books.`;
  }
  if (inbound === "empty") {
    return `${SUCCESS_CLAIM} Inbound folders are empty. Empty is not a company drop.`;
  }
  return `${SUCCESS_CLAIM} Operator inbound stays UNVERIFIED. A folder of files is not a company OS.`;
}

function fromRecord(record: IsolatePilotRecord, already: boolean): OptionCPilotStartReceipt {
  const receipt = baseReceipt(record.at, record.branchId);
  receipt.receiptId = already ? `tr:receipt:option-c-pilot-start:already:${record.branchId}` : receiptIdFor(record.at);
  receipt.instanceId = record.instanceId;
  receipt.pilot_started = true;
  receipt.accepted = true;
  receipt.already_started = already;
  receipt.inbound = record.inbound;
  receipt.synthetic_inbound = record.inbound === "synthetic-only";
  receipt.prep_ready = true;
  receipt.claim = record.claim;
  return receipt;
}

/**
 * Human Option C start for one named branch on this operator box.
 * Does not run unless the caller passes that branch. Does not flip the shipped catalog.
 * Prep, desk boot, and an explicit mode change do not call this function.
 */
export async function runOptionCPilotStart(options: OptionCPilotStartOptions = {}): Promise<OptionCPilotStartReceipt> {
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? new Date().toISOString();
  const named = namedBranch(options);
  const receipt = baseReceipt(now, named.branchId);

  if (!existsSync(cwd)) {
    receipt.refused = "operator root is missing";
    return receipt;
  }
  if (named.refused || !named.branchId) {
    receipt.refused = named.refused ?? OPTION_C_START_REFUSAL.branch;
    receipt.claim = `${receipt.refused}. Not a company OS. Not Field 1.0. Not Office Softwares 1.0.`;
    return receipt;
  }

  if (!catalogClosed()) {
    receipt.refused = OPTION_C_START_REFUSAL.catalog;
    receipt.claim = `${receipt.refused}. Not a company OS. Not Field 1.0. Not Office Softwares 1.0.`;
    return receipt;
  }

  const instanceId = resolveInstanceId(cwd);
  receipt.instanceId = instanceId;
  const existing = readIsolatePilot(cwd, instanceId);
  if (existing) {
    if (existing.branchId === named.branchId) return fromRecord(existing, true);
    receipt.refused = OPTION_C_START_REFUSAL.otherBranch;
    receipt.claim = `${receipt.refused}. Not a company OS. Not Field 1.0. Not Office Softwares 1.0.`;
    receipt.ledger = appendLedger(cwd, instanceId, receipt);
    return receipt;
  }

  const prep = await runOptionCPrep({
    cwd,
    fixtureDir: options.fixtureDir ?? defaultFixtureDir(cwd),
    now,
    bootDesk: options.bootDesk
  });
  receipt.prep_ready = prep.ready;
  if (!prep.ready || prep.pilot_started !== false) {
    receipt.refused = OPTION_C_START_REFUSAL.prep;
    receipt.claim = "Prep is not ready. Pilot start refused. Not a company OS. Not Field 1.0. Not Office Softwares 1.0.";
    receipt.ledger = appendLedger(cwd, resolveInstanceId(cwd), receipt);
    return receipt;
  }

  const fixtureDir = options.fixtureDir ?? defaultFixtureDir(cwd);
  const inbound = classifyOperatorInbound(cwd, fixtureDir);
  receipt.inbound = inbound;
  receipt.synthetic_inbound = inbound === "synthetic-only";
  if (options.claimCompany === true && (inbound === "synthetic-only" || inbound === "empty")) {
    receipt.refused = OPTION_C_START_REFUSAL.companyClaim;
    receipt.claim =
      "Synthetic or empty inbound is not a company drop. Pilot start refused. Not a company OS. Not Field 1.0. Not Office Softwares 1.0.";
    receipt.ledger = appendLedger(cwd, resolveInstanceId(cwd), receipt);
    return receipt;
  }

  let sealedOk = false;
  try {
    const sealed = createOneBranchShadowConfig({ branchId: named.branchId });
    sealedOk =
      sealed.mode === "SHADOW-SEALED" &&
      sealed.pilotStarted === false &&
      sealed.fieldLaunch === false &&
      sealed.autoPromote === false;
  } catch {
    sealedOk = false;
  }
  if (!sealedOk || !writesRefused()) {
    receipt.refused = sealedOk ? OPTION_C_START_REFUSAL.writes : OPTION_C_START_REFUSAL.sealed;
    receipt.claim = `${receipt.refused}. Not a company OS. Not Field 1.0. Not Office Softwares 1.0.`;
    receipt.ledger = appendLedger(cwd, resolveInstanceId(cwd), receipt);
    return receipt;
  }

  const startedInstance = resolveInstanceId(cwd);
  receipt.instanceId = startedInstance;
  receipt.pilot_started = true;
  receipt.accepted = true;
  receipt.claim = successClaim(inbound);
  const record: IsolatePilotRecord = {
    kind: "option-c-pilot-isolate",
    author: "Aziel Eliab",
    identity: "Aziel Eliab",
    version: RUNTIME_MANIFEST.version,
    product_label: "Local Softwares 1.0",
    track: "L",
    instanceId: startedInstance,
    branchId: named.branchId,
    at: now,
    pilot_started: true,
    live_backends: false,
    writes: false,
    pages: "off",
    mode: "SHADOW-SEALED",
    auto_promote: false,
    field_claim: false,
    field_launch: false,
    company_os_live: false,
    office_softwares_1_0: false,
    field_softwares_1_0: false,
    phone_home: false,
    central_dump: false,
    inbound,
    customer_data: false,
    wrapper_is_verification: false,
    claim: receipt.claim
  };
  receipt.ledger = appendLedger(cwd, startedInstance, receipt);
  if (!receipt.ledger.verified) {
    receipt.pilot_started = false;
    receipt.accepted = false;
    receipt.refused = "isolate receipt was not verified";
    receipt.claim = "Pilot start refused. The isolate receipt did not verify. Not a company OS. Not Field 1.0. Not Office Softwares 1.0.";
    return receipt;
  }
  writeIsolatePilot(cwd, record);
  return receipt;
}
