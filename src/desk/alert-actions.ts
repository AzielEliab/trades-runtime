import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../core/hash.js";
import type { AlertDataLabel, AlertRuleKind, StoredAlert } from "./alerts.js";

/**
 * Proposed actions for a firing local alert.
 * Stubs only. Nothing calls ServiceTitan or ProBooks.
 */

export const HUMAN_AUTHORITY_RULE =
  "Human Authority Rule: a person with the registered role must decide. This stub is not an order, not a ticket, and not a dispatch write. ServiceTitan and ProBooks stay read-only.";

const RULE_STUBS: Record<AlertRuleKind, { label: string; role: string; rationale: string }> = {
  capacity: {
    label: "Review open slots before any booking change",
    role: "dispatcher",
    rationale: "The capacity rule fired on the local desk. A dispatcher reviews the lane. The desk does not book."
  },
  "late-jobs": {
    label: "Review unfinished jobs before the day closes",
    role: "manager",
    rationale: "The late-jobs rule fired on local rows. A manager decides what, if anything, changes. The desk does not reschedule."
  },
  "trust-band": {
    label: "Hold the recommendation until a human reviews the evidence band",
    role: "operator",
    rationale: "The trust-band rule fired. Trust is not truth. An operator decides. The desk does not promote the row."
  },
  "booking-block": {
    label: "Leave booking unchanged until a human accepts the block",
    role: "dispatcher",
    rationale: "The booking-block rule fired from the local score. A dispatcher owns the block. The desk does not write a booking."
  },
  "verification-stall": {
    label: "Keep the row unverified until a human supplies evidence",
    role: "operator",
    rationale: "The verification-stall rule fired. Wrapper admission is not verification. An operator decides. The desk does not mark the row verified."
  },
  "field-flag": {
    label: "Read the field flag and decide on this machine",
    role: "operator",
    rationale: "A local field flag named a van and a label. A person decides. The stub is not an order and it does not write ServiceTitan or ProBooks. Not an accuracy percent. Not Field 1.0."
  }
};

export interface AlertActionStub {
  id: string;
  alertId: string;
  rule: AlertRuleKind;
  label: string;
  rationale: string;
  requiredHumanAuthority: string;
  refused: "write-back";
  servicetitanWrite: false;
  probooksWrite: false;
  live_backends: false;
  executed: false;
  tenantCall: false;
  humanAuthorityRule: typeof HUMAN_AUTHORITY_RULE;
}

export interface AlertActionReport {
  product: "trades-runtime";
  author: "Aziel Eliab";
  version: string;
  generatedAt: string;
  live_backends: false;
  writes: false;
  phoneHome: false;
  pilot_started: false;
  tenantCall: false;
  servicetitanWrite: false;
  probooksWrite: false;
  refused: "write-back";
  humanAuthorityRule: typeof HUMAN_AUTHORITY_RULE;
  dataLabel: AlertDataLabel;
  note: string;
  path: string;
  auditPath: string;
  written: boolean;
  digest: string;
  stubs: AlertActionStub[];
}

function assertLocalActionPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === "data/tenants" || normalized.startsWith("data/tenants/") || normalized.includes("/tenants/")) {
    throw new Error("hosted alert-action layout is refused; stubs stay on this machine");
  }
  return filePath;
}

function sanitizeInstanceId(instanceId: string): string {
  const id = instanceId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!id || id === "shared" || id === "hosted" || id === "tenants") {
    throw new Error("alert action stubs require a local instance id (not shared/hosted/tenants)");
  }
  return id;
}

export function defaultAlertActionPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalActionPath(join(root, sanitizeInstanceId(instanceId), "alert-actions.json"));
}

export function defaultAlertActionAuditPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalActionPath(join(root, sanitizeInstanceId(instanceId), "alert-actions.jsonl"));
}

export function proposeAlertActions(alerts: readonly StoredAlert[]): AlertActionStub[] {
  const stubs: AlertActionStub[] = [];
  for (const alert of alerts) {
    if (!alert.active) continue;
    const spec = RULE_STUBS[alert.rule];
    const authority = `${spec.role} — registered authority role. ${HUMAN_AUTHORITY_RULE}`;
    stubs.push({
      id: `${alert.id}:review`,
      alertId: alert.id,
      rule: alert.rule,
      label: spec.label,
      rationale: `${spec.rationale} Desk detail: ${alert.detail}`,
      requiredHumanAuthority: authority,
      refused: "write-back",
      servicetitanWrite: false,
      probooksWrite: false,
      live_backends: false,
      executed: false,
      tenantCall: false,
      humanAuthorityRule: HUMAN_AUTHORITY_RULE
    });
    stubs.push({
      id: `${alert.id}:hold-write`,
      alertId: alert.id,
      rule: alert.rule,
      label: "Hold ServiceTitan and ProBooks unchanged",
      rationale: "This alert does not authorize a tenant mutation. Write-back stays refused.",
      requiredHumanAuthority: `operator — registered authority role. ${HUMAN_AUTHORITY_RULE}`,
      refused: "write-back",
      servicetitanWrite: false,
      probooksWrite: false,
      live_backends: false,
      executed: false,
      tenantCall: false,
      humanAuthorityRule: HUMAN_AUTHORITY_RULE
    });
  }
  return stubs;
}

function digestFor(stubs: AlertActionStub[]): string {
  return sha256(
    stubs.map((stub) => ({
      id: stub.id,
      alertId: stub.alertId,
      rule: stub.rule,
      label: stub.label,
      refused: stub.refused
    }))
  );
}

export function buildAlertActionReport(args: {
  version: string;
  now: string;
  instanceId: string;
  dataLabel: AlertDataLabel;
  alerts: readonly StoredAlert[];
  root?: string;
}): AlertActionReport {
  const root = args.root ?? "data/runtime";
  const stubs = proposeAlertActions(args.alerts);
  return {
    product: "trades-runtime",
    author: "Aziel Eliab",
    version: args.version,
    generatedAt: args.now,
    live_backends: false,
    writes: false,
    phoneHome: false,
    pilot_started: false,
    tenantCall: false,
    servicetitanWrite: false,
    probooksWrite: false,
    refused: "write-back",
    humanAuthorityRule: HUMAN_AUTHORITY_RULE,
    dataLabel: args.dataLabel,
    note: stubs.length
      ? "Stubs only. Persisted on this machine. No ServiceTitan or ProBooks call. Human authority decides. live_backends false."
      : "No rule is firing, so no action stub is proposed. Nothing is sent to ServiceTitan or ProBooks.",
    path: defaultAlertActionPath(args.instanceId, root),
    auditPath: defaultAlertActionAuditPath(args.instanceId, root),
    written: false,
    digest: digestFor(stubs),
    stubs
  };
}

export function persistAlertActions(args: { cwd: string; report: AlertActionReport }): AlertActionReport {
  const jsonPath = assertLocalActionPath(join(args.cwd, args.report.path));
  const auditPath = assertLocalActionPath(join(args.cwd, args.report.auditPath));
  mkdirSync(join(jsonPath, ".."), { recursive: true });
  const stored: AlertActionReport = { ...args.report, written: true };
  writeFileSync(jsonPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  const line = {
    at: stored.generatedAt,
    digest: stored.digest,
    stubCount: stored.stubs.length,
    live_backends: false as const,
    writes: false as const,
    refused: "write-back" as const,
    tenantCall: false as const,
    pilot_started: false as const,
    author: "Aziel Eliab" as const
  };
  let append = true;
  if (existsSync(auditPath)) {
    const text = readFileSync(auditPath, "utf8").trim();
    const last = text ? text.split("\n").at(-1) : "";
    if (last) {
      try {
        const parsed = JSON.parse(last) as { digest?: string };
        if (parsed.digest === stored.digest) append = false;
      } catch {
        append = true;
      }
    }
  }
  if (append) appendFileSync(auditPath, `${JSON.stringify(line)}\n`, "utf8");
  return stored;
}
