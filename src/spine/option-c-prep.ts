import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { applyEngagement, engagementNotice } from "../core/engagement-rules.js";
import { createOneBranchShadowConfig, requestShadowModeChange } from "../core/shadow-branch.js";
import { RUNTIME_MANIFEST } from "../manifest.js";
import { runByoAdmitDemo } from "../demo/byo-admit.js";
import { startOperatorDesk } from "../desk/server.js";
import { parseAlertConfig } from "../desk/alerts.js";
import { admitDropInFile } from "./drop-in.js";
import { DurableReceiptStore } from "./durable-receipts.js";
import { recordEngagementDrop } from "./engagement-receipt.js";
import { healthLocal, type HealthLocal } from "./health-local.js";
import { BYO_INBOUND_ROOT, HOSTED_TENANT_LAYOUT, isHostedTenantLayout } from "./inbound-layout.js";
import { parseLocalInboundConfig } from "./local-inbound-config.js";
import { mayWriteProBooks, refuseProBooksWrite, refuseProBooksWriteMethod } from "./probooks-shadow.js";
import {
  ALERTS_EXAMPLE_PATH,
  describeRuntimeIsolate,
  isolateAlertsPath,
  isolateReceiptPath,
  sanitizeInstanceId
} from "./runtime-isolate.js";
import { mayWriteServiceTitan, refuseServiceTitanWrite, refuseServiceTitanWriteMethod } from "./servicetitan-shadow.js";
import { mayWriteTradesApp, refuseTradesAppWrite, refuseTradesAppWriteMethod } from "./trades-app-shadow.js";

const PREP_BRANCH = "tr:branch:option-c-prep";
const CLAIM = "Machine prep only. Option C pilot has not started. Not a live company pilot.";

export interface OptionCPrepOptions {
  /** Operator box root. Defaults to the process working directory. */
  cwd?: string;
  /** Synthetic fixtures. Defaults to test/fixtures/byo under cwd, then under the module tree. */
  fixtureDir?: string;
  now?: string;
  /** Boot the local desk and read /api/health. Default true. */
  bootDesk?: boolean;
}

export interface OptionCPrepCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface OptionCPrepReceipt {
  kind: "option-c-pilot-prep";
  receiptId: string;
  at: string;
  author: "Aziel Eliab";
  identity: "Aziel Eliab";
  version: string;
  surface: "health-local";
  pilot_started: false;
  pilot: "not-started";
  optionC: "code-ready-pilot-not-started";
  optionD: "not-started";
  field_launch: false;
  live_backends: false;
  writes: false;
  pages: "off";
  phone_home: false;
  central_dump: false;
  tenant_data_on_worker: false;
  mode: "SHADOW-SEALED";
  auto_promote: false;
  wrapper_is_verification: false;
  customer_data: false;
  synthetic_fixtures: true;
  endpoints_called: false;
  claim: typeof CLAIM;
  ready: boolean;
  checks: OptionCPrepCheck[];
  health: HealthLocal;
  config: {
    exampleCopied: boolean;
    copiedThisRun: boolean;
    alertsExampleCopied: boolean;
    alertsCopiedThisRun: boolean;
    endpointsCalled: false;
  };
  admit: {
    synthetic: true;
    customerData: false;
    verificationStatus: "UNVERIFIED" | "not-run";
    wrapperIsVerification: false;
    sources: string[];
    packetCount: number;
  };
  engagement: {
    notice: string;
    droppedToSealed: boolean;
    mode: "SHADOW-SEALED";
    receiptHash: string | null;
  };
  writeRefusals: string[];
  desk: {
    booted: boolean;
    host: "127.0.0.1";
    url: string | null;
    health_pilot_started: false | null;
  };
  ledger: {
    path: string | null;
    hash: string | null;
    verified: boolean;
  };
}

function under(root: string, path: string): string {
  return isAbsolute(path) ? path : join(root, path);
}

function check(checks: OptionCPrepCheck[], id: string, ok: boolean, detail: string): void {
  checks.push({ id, ok, detail });
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

function ensureDir(path: string): boolean {
  const existed = existsSync(path);
  mkdirSync(path, { recursive: true });
  return existed;
}

function copyExample(examplePath: string, destPath: string): { copied: boolean; created: boolean } {
  if (!existsSync(examplePath)) {
    return { copied: false, created: false };
  }
  if (existsSync(destPath)) {
    return { copied: true, created: false };
  }
  mkdirSync(join(destPath, ".."), { recursive: true });
  copyFileSync(examplePath, destPath);
  return { copied: true, created: true };
}

function receiptIdFor(at: string): string {
  return `tr:receipt:option-c-prep:${at.replace(/[:.]/g, "-")}`;
}

function baseReceipt(at: string, checks: OptionCPrepCheck[]): OptionCPrepReceipt {
  const health = healthLocal();
  return {
    kind: "option-c-pilot-prep",
    receiptId: receiptIdFor(at),
    at,
    author: "Aziel Eliab",
    identity: "Aziel Eliab",
    version: RUNTIME_MANIFEST.version,
    surface: "health-local",
    pilot_started: false,
    pilot: "not-started",
    optionC: "code-ready-pilot-not-started",
    optionD: "not-started",
    field_launch: false,
    live_backends: false,
    writes: false,
    pages: "off",
    phone_home: false,
    central_dump: false,
    tenant_data_on_worker: false,
    mode: "SHADOW-SEALED",
    auto_promote: false,
    wrapper_is_verification: false,
    customer_data: false,
    synthetic_fixtures: true,
    endpoints_called: false,
    claim: CLAIM,
    ready: false,
    checks,
    health,
    config: {
      exampleCopied: false,
      copiedThisRun: false,
      alertsExampleCopied: false,
      alertsCopiedThisRun: false,
      endpointsCalled: false
    },
    admit: {
      synthetic: true,
      customerData: false,
      verificationStatus: "not-run",
      wrapperIsVerification: false,
      sources: [],
      packetCount: 0
    },
    engagement: {
      notice: engagementNotice(),
      droppedToSealed: false,
      mode: "SHADOW-SEALED",
      receiptHash: null
    },
    writeRefusals: [],
    desk: {
      booted: false,
      host: "127.0.0.1",
      url: null,
      health_pilot_started: null
    },
    ledger: {
      path: null,
      hash: null,
      verified: false
    }
  };
}

/**
 * Validate an operator box for a future Option C human pilot.
 * Copies example config when the local copy is missing, admits synthetic fixtures
 * in a temp tree, boots the desk, and prints nothing itself — the caller prints the receipt.
 * pilot_started stays false. This function does not start a company pilot.
 */
export async function runOptionCPrep(options: OptionCPrepOptions = {}): Promise<OptionCPrepReceipt> {
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? new Date().toISOString();
  const bootDesk = options.bootDesk !== false;
  const checks: OptionCPrepCheck[] = [];
  const receipt = baseReceipt(now, checks);

  if (!existsSync(cwd)) {
    check(checks, "cwd", false, `operator root is missing: ${cwd}`);
    return receipt;
  }

  check(checks, "author", RUNTIME_MANIFEST.author === "Aziel Eliab" && RUNTIME_MANIFEST.identity === "Aziel Eliab", "author is Aziel Eliab only");
  check(
    checks,
    "honesty-flags",
    RUNTIME_MANIFEST.live_backends === false &&
      RUNTIME_MANIFEST.pilot_started === false &&
      receipt.health.pilot_started === false &&
      receipt.health.live_backends === false &&
      receipt.health.writes === false &&
      receipt.health.pages === "off",
    "manifest and health-local keep live_backends false and pilot_started false"
  );

  const pagesWorkflow = join(cwd, ".github", "workflows", "pages.yml");
  check(checks, "pages-off", !existsSync(pagesWorkflow), existsSync(pagesWorkflow) ? "pages workflow is present" : "no Pages workflow on this tree");

  const tenants = under(cwd, HOSTED_TENANT_LAYOUT);
  const hosted = existsSync(tenants) || isHostedTenantLayout(tenants);
  check(
    checks,
    "no-hosted-tenants",
    !hosted,
    hosted ? "data/tenants is present; hosted multi-tenant layout is refused" : "data/tenants is absent"
  );

  const isolate = describeRuntimeIsolate("local");
  const folders = [
    isolate.inbound.servicetitan,
    isolate.inbound.probooks,
    isolate.inbound["trades-app"],
    "data/runtime"
  ];
  const folderDetails: string[] = [];
  let foldersOk = true;
  for (const rel of folders) {
    if (isHostedTenantLayout(rel)) {
      foldersOk = false;
      folderDetails.push(`${rel} refused`);
      continue;
    }
    const abs = under(cwd, rel);
    const existed = ensureDir(abs);
    folderDetails.push(`${rel} ${existed ? "present" : "created"}`);
  }
  check(checks, "folders", foldersOk, folderDetails.join("; "));

  const fixtureDir = options.fixtureDir ?? join(cwd, "test", "fixtures", "byo");
  const examplePath = under(cwd, join(BYO_INBOUND_ROOT, "local.json.example"));
  const localPath = under(cwd, join(BYO_INBOUND_ROOT, "local.json"));
  let instanceId = "local";
  if (!existsSync(examplePath)) {
    check(checks, "config-example-copied", false, "data/inbound/local.json.example is missing");
  } else {
    const copied = copyExample(examplePath, localPath);
    receipt.config.exampleCopied = copied.copied;
    receipt.config.copiedThisRun = copied.created;
    try {
      const parsed = parseLocalInboundConfig(JSON.parse(readFileSync(localPath, "utf8")) as unknown);
      instanceId = sanitizeInstanceId(parsed.instanceId);
      const hints = [parsed.servicetitanReadEndpoint, parsed.probooksReadEndpoint, parsed.tradesAppReadEndpoint].filter(Boolean);
      check(
        checks,
        "config-example-copied",
        true,
        copied.created
          ? `copied local.json.example to local.json (instance ${instanceId}). Read-endpoint hints: ${hints.length}. Endpoints were not called.`
          : `local.json already present (instance ${instanceId}). Read-endpoint hints: ${hints.length}. Endpoints were not called.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check(checks, "config-example-copied", false, message);
    }
  }

  const alertsExample = under(cwd, ALERTS_EXAMPLE_PATH);
  const alertsDest = under(cwd, isolateAlertsPath(instanceId));
  if (!existsSync(alertsExample)) {
    check(checks, "alerts-example-copied", false, "data/runtime/alerts.json.example is missing");
  } else {
    const copied = copyExample(alertsExample, alertsDest);
    receipt.config.alertsExampleCopied = copied.copied;
    receipt.config.alertsCopiedThisRun = copied.created;
    try {
      parseAlertConfig(JSON.parse(readFileSync(alertsDest, "utf8")) as unknown);
      check(
        checks,
        "alerts-example-copied",
        true,
        copied.created ? `copied alerts.json.example to ${isolateAlertsPath(instanceId)}` : `alerts.json already present at ${isolateAlertsPath(instanceId)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check(checks, "alerts-example-copied", false, message);
    }
  }

  const sealed = createOneBranchShadowConfig({ branchId: PREP_BRANCH });
  let autoRefused = false;
  try {
    requestShadowModeChange(sealed, "SHADOW-VISIBLE", { kind: "auto" });
  } catch (error) {
    autoRefused = error instanceof Error && /never auto-promote SHADOW-SEALED to SHADOW-VISIBLE/.test(error.message);
  }
  const explicit = requestShadowModeChange(sealed, "SHADOW-VISIBLE", { kind: "explicit" });
  check(
    checks,
    "shadow-sealed",
    sealed.mode === "SHADOW-SEALED" &&
      sealed.pilotStarted === false &&
      sealed.fieldLaunch === false &&
      sealed.autoPromote === false &&
      sealed.optionC === "code-ready-pilot-not-started" &&
      autoRefused &&
      explicit.pilotStarted === false &&
      explicit.fieldLaunch === false,
    "default mode is SHADOW-SEALED; auto-promote throws; an explicit mode change still leaves pilotStarted false"
  );

  const decision = applyEngagement("SHADOW-VISIBLE", { treatedAsOrder: true });
  receipt.engagement.droppedToSealed = decision.droppedToSealed;
  receipt.engagement.notice = decision.notice;
  check(
    checks,
    "engagement-drop",
    decision.droppedToSealed === true && decision.mode === "SHADOW-SEALED" && /not an order/i.test(decision.notice),
    decision.droppedToSealed ? `dropped to SHADOW-SEALED (${decision.reason ?? "engagement-violation"})` : "engagement drop did not return to SHADOW-SEALED"
  );

  try {
    const refusals = [
      writeRefused(() => refuseServiceTitanWrite("POST")),
      writeRefused(() => refuseServiceTitanWriteMethod("PUT")),
      writeRefused(() => refuseProBooksWrite("PATCH")),
      writeRefused(() => refuseProBooksWriteMethod("POST")),
      writeRefused(() => refuseTradesAppWrite("PUT")),
      writeRefused(() => refuseTradesAppWriteMethod("PATCH"))
    ];
    const mayNot =
      mayWriteServiceTitan() === false && mayWriteProBooks() === false && mayWriteTradesApp() === false;
    receipt.writeRefusals = refusals;
    check(
      checks,
      "refuse-write",
      mayNot && refusals.every((line) => /refused/.test(line)),
      mayNot ? "ServiceTitan, ProBooks, and trades-app writes threw" : "a write flag was not false"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(checks, "refuse-write", false, message);
  }

  if (!existsSync(fixtureDir)) {
    check(checks, "synthetic-admit", false, `synthetic fixtures missing at ${fixtureDir}`);
  } else {
    try {
      const workRoot = mkdtempSync(join(tmpdir(), "tr-option-c-prep-admit-"));
      const admitted = runByoAdmitDemo({
        fixtureDir,
        workRoot,
        instanceId: "option-c-prep-admit",
        receivedAt: now
      });
      const trades = admitDropInFile(join(fixtureDir, "jobber-export.json"), { receivedAt: now });
      const tradesOk = trades.result.ok === true && trades.result.peerClass === "trades-app";
      const tradesSynthetic = trades.result.ok === true && trades.result.synthetic === true;
      const tradesUnverified =
        trades.result.ok === true &&
        trades.result.verificationStatus === "UNVERIFIED" &&
        trades.result.wrapperIsVerification === false &&
        trades.result.write === false &&
        trades.result.live === false;
      const ok =
        admitted.synthetic === true &&
        admitted.customerData === false &&
        admitted.wrapperIsVerification === false &&
        admitted.verificationStatus === "UNVERIFIED" &&
        admitted.writesThrew === true &&
        admitted.mayWriteServiceTitan === false &&
        admitted.mayWriteProBooks === false &&
        admitted.hashes.length > 0 &&
        tradesOk &&
        tradesSynthetic &&
        tradesUnverified;
      receipt.admit = {
        synthetic: true,
        customerData: false,
        verificationStatus: ok ? "UNVERIFIED" : "not-run",
        wrapperIsVerification: false,
        sources: ok ? ["servicetitan", "probooks", "trades-app"] : [],
        packetCount: admitted.hashes.length + (trades.result.ok ? trades.result.records.length : 0)
      };
      check(
        checks,
        "synthetic-admit",
        ok,
        ok
          ? `synthetic ST + ProBooks + trades-app fixtures admitted in a temp tree (${receipt.admit.packetCount} packets). Operator inbound folders were not filled. Wrapper is not verification.`
          : "synthetic admit did not stay UNVERIFIED, trades-app, and write-false"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check(checks, "synthetic-admit", false, message);
    }
  }

  if (bootDesk) {
    let desk: Awaited<ReturnType<typeof startOperatorDesk>> | undefined;
    try {
      desk = await startOperatorDesk({
        cwd,
        host: "127.0.0.1",
        port: 0,
        persistAlertState: false
      });
      receipt.desk.booted = true;
      receipt.desk.url = desk.url;
      const page = await fetch(desk.url);
      const html = await page.text();
      const healthResponse = await fetch(new URL("/api/health", desk.url));
      const health = (await healthResponse.json()) as Partial<HealthLocal>;
      const healthHonest =
        healthResponse.ok &&
        health.pilot_started === false &&
        health.live_backends === false &&
        health.writes === false &&
        health.mode === "SHADOW-SEALED" &&
        health.surface === "health-local";
      if (healthHonest) receipt.desk.health_pilot_started = false;
      const pageHonest = page.ok && html.includes("pilot_started false") && html.includes("Option C pilot not started");
      check(
        checks,
        "desk-boot",
        healthHonest && pageHonest,
        healthHonest && pageHonest
          ? `desk booted at ${desk.url} and /api/health reported pilot_started false`
          : `desk responded without the expected honesty flags (${desk.url})`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check(checks, "desk-boot", false, message);
    } finally {
      if (desk) await desk.close();
    }
  }

  const shadowOk = checks.find((item) => item.id === "shadow-sealed")?.ok === true;
  const engagementOk = checks.find((item) => item.id === "engagement-drop")?.ok === true;
  const receiptPath = under(cwd, isolateReceiptPath(instanceId));
  if (!isHostedTenantLayout(receiptPath) && existsSync(under(cwd, "data/runtime"))) {
    try {
      const store = new DurableReceiptStore(receiptPath);
      if (engagementOk && decision.droppedToSealed) {
        const drop = recordEngagementDrop({
          store,
          branchId: PREP_BRANCH,
          decision,
          at: now,
          receiptId: `tr:receipt:engagement-drop:${now.replace(/[:.]/g, "-")}`
        });
        receipt.engagement.receiptHash = drop.hash;
      }
      const stored = store.appendKind("lifecycle", receipt.receiptId, now, {
        event: "option-c-pilot-prep",
        claim: CLAIM,
        pilot_started: false,
        pilot: "not-started",
        optionC: "code-ready-pilot-not-started",
        optionD: "not-started",
        field_launch: false,
        live_backends: false,
        writes: false,
        pages: "off",
        phone_home: false,
        central_dump: false,
        mode: "SHADOW-SEALED",
        auto_promote: false,
        wrapper_is_verification: false,
        customer_data: false,
        synthetic_fixtures: true,
        endpoints_called: false,
        ready: checks.every((item) => item.ok) && shadowOk,
        checks: checks.map((item) => ({ id: item.id, ok: item.ok }))
      });
      receipt.ledger = {
        path: receiptPath,
        hash: stored.hash,
        verified: store.verify()
      };
      check(checks, "prep-receipt", receipt.ledger.verified === true && shadowOk, `isolate receipt ${stored.hash}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check(checks, "prep-receipt", false, message);
    }
  } else {
    check(checks, "prep-receipt", false, "isolate receipt path was refused or the runtime folder is missing");
  }

  receipt.ready = checks.every((item) => item.ok) && receipt.pilot_started === false && receipt.ledger.verified === true;
  return receipt;
}
