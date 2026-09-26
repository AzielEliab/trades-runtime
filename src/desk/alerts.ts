import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, dirname } from "node:path";
import type { BookingBlock } from "../domain/workforce-capacity.js";
import { isHostedTenantLayout, refuseHostedTenantLayout, RUNTIME_ISOLATE_ROOT } from "../spine/inbound-layout.js";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";

/** Same labels the desk already uses. Repeated here so this module does not import the snapshot. */
export type AlertDataLabel = "synthetic-demo" | "byo-admitted" | "byo-admitted-synthetic";

export type AlertSeverity = "info" | "watch" | "hold";

export type EvidenceTrustScore = "LOW" | "MEDIUM" | "HIGH" | "n/a";

export type VerificationScore = "UNVERIFIED" | "PARTIAL" | "VERIFIED" | "CONFLICTED";

export const ALERT_RULE_KINDS = [
  "capacity",
  "late-jobs",
  "trust-band",
  "booking-block",
  "verification-stall"
] as const;

export type AlertRuleKind = (typeof ALERT_RULE_KINDS)[number];

export interface AlertNotice {
  severity: AlertSeverity;
  title: string;
  detail: string;
}

export interface AlertRuleConfig {
  capacity: {
    enabled: boolean;
    /** Fire when a known open-slot count is at or below this. Blank open slots do not invent a lane. */
    openSlotsAtOrBelow: number;
  };
  lateJobs: {
    enabled: boolean;
    countAtOrAbove: number;
    /** Same-day unfinished jobs count only after this fraction of the mission day. Prior days always count. */
    sameDayElapsedFractionAtOrAbove: number;
  };
  trustBand: {
    enabled: boolean;
    /** Fire when the desk evidence-trust score is at or below this band. n/a does not fire. */
    atOrBelow: "LOW" | "MEDIUM" | "HIGH";
  };
  bookingBlock: {
    enabled: boolean;
    when: BookingBlock[];
  };
  verificationStall: {
    enabled: boolean;
    whenStatus: Array<"UNVERIFIED" | "PARTIAL" | "CONFLICTED">;
    stallMinutes: number;
  };
}

export interface AlertHooksConfig {
  /** Local JSONL path. Null leaves the hook off. */
  file: string | null;
  /** Loopback http(s) only. Null leaves the hook off. */
  webhook: string | null;
}

export interface AlertConfig {
  version: 1;
  rules: AlertRuleConfig;
  hooks: AlertHooksConfig;
}

export interface DeskRuleSignals {
  dataLabel: AlertDataLabel;
  now: string;
  evidenceTrust: EvidenceTrustScore;
  verification: VerificationScore;
  bookingBlock: BookingBlock;
  openSlots: number | null;
  booked: number;
  lane: number | null;
  lateJobs: number;
  lateBasis: string;
  oldestObservationAt: string | null;
  missionElapsedFraction: number;
  missionActual: number;
  missionExpectedPace: number;
}

export interface StoredAlert {
  id: string;
  rule: AlertRuleKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  dataLabel: AlertDataLabel;
  raisedAt: string;
  lastSeenAt: string;
  active: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  inventedAccuracy: false;
}

export interface AlertStateFile {
  version: 1;
  lastTrustBand: EvidenceTrustScore | null;
  alerts: StoredAlert[];
}

export interface ResolvedAlertConfig {
  config: AlertConfig;
  source: "option" | "file" | "local.json" | "default" | "invalid";
  path?: string;
  hold?: AlertNotice;
}

const TRUST_RANK: Record<Exclude<EvidenceTrustScore, "n/a">, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
};

const BOOKING_BLOCKS: readonly BookingBlock[] = [
  "OPEN",
  "HOLD",
  "BLOCK_NEW_BOOKING",
  "PROTECTED",
  "RESCHEDULE_CANDIDATE",
  "CLOSED"
];

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const FORBIDDEN_CONFIG_KEYS = [
  "cloudAccount",
  "cloud_account",
  "hostedUploader",
  "hosted_uploader",
  "phoneHome",
  "phone_home",
  "tenants",
  "tenantId",
  "tenant_id"
] as const;

export function dataLabelWords(label: AlertDataLabel): string {
  if (label === "synthetic-demo") return "Synthetic demo";
  if (label === "byo-admitted-synthetic") return "BYO-admitted synthetic drill";
  return "BYO-admitted";
}

export function defaultAlertConfig(): AlertConfig {
  return {
    version: 1,
    rules: {
      capacity: { enabled: true, openSlotsAtOrBelow: 6 },
      lateJobs: { enabled: true, countAtOrAbove: 1, sameDayElapsedFractionAtOrAbove: 0.75 },
      trustBand: { enabled: true, atOrBelow: "LOW" },
      bookingBlock: { enabled: true, when: ["HOLD", "BLOCK_NEW_BOOKING", "CLOSED"] },
      verificationStall: {
        enabled: true,
        whenStatus: ["UNVERIFIED", "CONFLICTED"],
        stallMinutes: 720
      }
    },
    hooks: { file: null, webhook: null }
  };
}

export function defaultAlertConfigPath(cwd: string, instanceId: string): string {
  return join(cwd, RUNTIME_ISOLATE_ROOT, sanitizeInstanceId(instanceId), "alerts.json");
}

export function defaultAlertStatePath(cwd: string, instanceId: string): string {
  return join(cwd, RUNTIME_ISOLATE_ROOT, sanitizeInstanceId(instanceId), "alert-state.json");
}

export function emptyAlertState(): AlertStateFile {
  return { version: 1, lastTrustBand: null, alerts: [] };
}

function asRecord(raw: unknown, label: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function refuseForbidden(record: Record<string, unknown>, label: string): void {
  for (const key of FORBIDDEN_CONFIG_KEYS) {
    if (key in record && record[key] != null) {
      throw new Error(`${label} refuses ${key}; no phone-home and no tenant dump`);
    }
  }
}

function requireFinite(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be a number from ${min} to ${max}`);
  }
  return value;
}

function requireBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value == null) return fallback;
  if (typeof value !== "boolean") throw new Error(`${field} must be true or false`);
  return value;
}

export function assertLocalWebhook(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("alert webhook must be an http(s) URL on this machine");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("alert webhook must be http or https on this machine");
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`alert webhook refuses ${parsed.hostname}; loopback only, no phone-home`);
  }
  return parsed;
}

export function assertLocalHookFile(path: string): string {
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized) throw new Error("alert file hook path is empty");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    throw new Error("alert file hook must be a local path, not a URL");
  }
  if (normalized.split("/").includes("..")) {
    throw new Error("alert file hook refuses parent traversal");
  }
  if (isHostedTenantLayout(normalized) || /(^|\/)tenants(\/|$)/i.test(normalized)) {
    refuseHostedTenantLayout(normalized);
  }
  if (/workers\.dev|phone-home|phone_home/i.test(normalized)) {
    throw new Error("alert file hook refuses a public or phone-home path");
  }
  return path;
}

function parseNullableString(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a string or null`);
  }
  return value.trim();
}

function parseHooks(raw: unknown): AlertHooksConfig {
  if (raw == null) return { file: null, webhook: null };
  const record = asRecord(raw, "alert hooks");
  refuseForbidden(record, "alert hooks");
  const file = parseNullableString(record.file, "hooks.file");
  const webhook = parseNullableString(record.webhook, "hooks.webhook");
  if (file) assertLocalHookFile(file);
  if (webhook) assertLocalWebhook(webhook);
  return { file, webhook };
}

function parseWhenBlocks(raw: unknown): BookingBlock[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("bookingBlock.when must list at least one booking block");
  }
  const when: BookingBlock[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !BOOKING_BLOCKS.includes(item as BookingBlock)) {
      throw new Error(`bookingBlock.when has an unknown block: ${String(item)}`);
    }
    when.push(item as BookingBlock);
  }
  return when;
}

function parseVerificationStatuses(raw: unknown): AlertRuleConfig["verificationStall"]["whenStatus"] {
  const allowed = new Set(["UNVERIFIED", "PARTIAL", "CONFLICTED"]);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("verificationStall.whenStatus must list statuses");
  }
  const statuses: AlertRuleConfig["verificationStall"]["whenStatus"] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !allowed.has(item)) {
      throw new Error(`verificationStall.whenStatus refuses ${String(item)}`);
    }
    if (item === "VERIFIED") {
      throw new Error("verification stall does not treat VERIFIED as a stall");
    }
    statuses.push(item as AlertRuleConfig["verificationStall"]["whenStatus"][number]);
  }
  return statuses;
}

export function parseAlertConfig(raw: unknown): AlertConfig {
  const record = asRecord(raw, "alert config");
  refuseForbidden(record, "alert config");
  const defaults = defaultAlertConfig();
  const rulesRaw = record.rules == null ? {} : asRecord(record.rules, "alert rules");
  refuseForbidden(rulesRaw, "alert rules");
  const capacityRaw = asRecord(rulesRaw.capacity ?? {}, "capacity rule");
  const lateRaw = asRecord(rulesRaw.lateJobs ?? {}, "late-jobs rule");
  const trustRaw = asRecord(rulesRaw.trustBand ?? {}, "trust-band rule");
  const bookingRaw = asRecord(rulesRaw.bookingBlock ?? {}, "booking-block rule");
  const stallRaw = asRecord(rulesRaw.verificationStall ?? {}, "verification-stall rule");
  const floor = trustRaw.atOrBelow ?? defaults.rules.trustBand.atOrBelow;
  if (floor !== "LOW" && floor !== "MEDIUM" && floor !== "HIGH") {
    throw new Error("trustBand.atOrBelow must be LOW, MEDIUM, or HIGH");
  }
  return {
    version: 1,
    rules: {
      capacity: {
        enabled: requireBoolean(capacityRaw.enabled, "capacity.enabled", defaults.rules.capacity.enabled),
        openSlotsAtOrBelow: requireFinite(
          capacityRaw.openSlotsAtOrBelow ?? defaults.rules.capacity.openSlotsAtOrBelow,
          "capacity.openSlotsAtOrBelow",
          0,
          100000
        )
      },
      lateJobs: {
        enabled: requireBoolean(lateRaw.enabled, "lateJobs.enabled", defaults.rules.lateJobs.enabled),
        countAtOrAbove: requireFinite(
          lateRaw.countAtOrAbove ?? defaults.rules.lateJobs.countAtOrAbove,
          "lateJobs.countAtOrAbove",
          1,
          100000
        ),
        sameDayElapsedFractionAtOrAbove: requireFinite(
          lateRaw.sameDayElapsedFractionAtOrAbove ?? defaults.rules.lateJobs.sameDayElapsedFractionAtOrAbove,
          "lateJobs.sameDayElapsedFractionAtOrAbove",
          0,
          1
        )
      },
      trustBand: {
        enabled: requireBoolean(trustRaw.enabled, "trustBand.enabled", defaults.rules.trustBand.enabled),
        atOrBelow: floor
      },
      bookingBlock: {
        enabled: requireBoolean(bookingRaw.enabled, "bookingBlock.enabled", defaults.rules.bookingBlock.enabled),
        when: bookingRaw.when == null ? defaults.rules.bookingBlock.when : parseWhenBlocks(bookingRaw.when)
      },
      verificationStall: {
        enabled: requireBoolean(
          stallRaw.enabled,
          "verificationStall.enabled",
          defaults.rules.verificationStall.enabled
        ),
        whenStatus:
          stallRaw.whenStatus == null
            ? defaults.rules.verificationStall.whenStatus
            : parseVerificationStatuses(stallRaw.whenStatus),
        stallMinutes: requireFinite(
          stallRaw.stallMinutes ?? defaults.rules.verificationStall.stallMinutes,
          "verificationStall.stallMinutes",
          1,
          525600
        )
      }
    },
    hooks: parseHooks(record.hooks)
  };
}

export function resolveAlertConfig(options: {
  cwd: string;
  instanceId: string;
  alertsPath?: string;
  inline?: unknown;
  override?: AlertConfig;
}): ResolvedAlertConfig {
  if (options.override) {
    return { config: options.override, source: "option" };
  }
  const path = options.alertsPath
    ? isAbsolute(options.alertsPath)
      ? options.alertsPath
      : join(options.cwd, options.alertsPath)
    : defaultAlertConfigPath(options.cwd, options.instanceId);
  if (options.alertsPath) {
    try {
      assertLocalHookFile(options.alertsPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        config: defaultAlertConfig(),
        source: "invalid",
        path,
        hold: { severity: "hold", title: "Alert config was not applied", detail: message }
      };
    }
  }
  if (existsSync(path)) {
    try {
      return { config: parseAlertConfig(JSON.parse(readFileSync(path, "utf8")) as unknown), source: "file", path };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        config: defaultAlertConfig(),
        source: "invalid",
        path,
        hold: {
          severity: "hold",
          title: "Alert config was not applied",
          detail: `${path} was not applied. ${message} Defaults stay local and hooks stay off.`
        }
      };
    }
  }
  if (options.inline != null) {
    try {
      return { config: parseAlertConfig(options.inline), source: "local.json" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        config: defaultAlertConfig(),
        source: "invalid",
        hold: {
          severity: "hold",
          title: "Alert config was not applied",
          detail: `local.json alerts were not applied. ${message} Defaults stay local and hooks stay off.`
        }
      };
    }
  }
  return { config: defaultAlertConfig(), source: "default", path };
}

export function readAlertState(path: string): AlertStateFile {
  if (!existsSync(path)) return emptyAlertState();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const record = asRecord(raw, "alert state");
    const alerts = Array.isArray(record.alerts) ? record.alerts.filter(isStoredAlert) : [];
    const last = record.lastTrustBand;
    const lastTrustBand =
      last === "LOW" || last === "MEDIUM" || last === "HIGH" || last === "n/a" ? last : null;
    return { version: 1, lastTrustBand, alerts };
  } catch {
    return emptyAlertState();
  }
}

export function writeAlertState(path: string, state: AlertStateFile): void {
  assertLocalHookFile(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8");
}

function isStoredAlert(value: unknown): value is StoredAlert {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<StoredAlert>;
  return (
    typeof row.id === "string" &&
    typeof row.rule === "string" &&
    typeof row.title === "string" &&
    typeof row.detail === "string" &&
    typeof row.raisedAt === "string" &&
    row.inventedAccuracy === false
  );
}

function ruleId(rule: AlertRuleKind, label: AlertDataLabel): string {
  return `${rule}:${label}`;
}

function labelSentence(signals: DeskRuleSignals): string {
  return `${dataLabelWords(signals.dataLabel)}.`;
}

interface DraftAlert {
  id: string;
  rule: AlertRuleKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
}

function evaluateRules(
  signals: DeskRuleSignals,
  config: AlertConfig,
  previousTrust: EvidenceTrustScore | null
): { firing: DraftAlert[]; notices: AlertNotice[] } {
  const firing: DraftAlert[] = [];
  const notices: AlertNotice[] = [];
  const label = labelSentence(signals);
  const { rules } = config;

  if (rules.capacity.enabled) {
    if (signals.openSlots == null) {
      notices.push({
        severity: "info",
        title: "Capacity rule waiting",
        detail: `${label} Open slots are blank, so the capacity rule does not invent a lane or a utilization percent. Booked rows on the desk: ${signals.booked}.`
      });
    } else if (signals.openSlots <= rules.capacity.openSlotsAtOrBelow) {
      const lane =
        signals.lane == null
          ? "No separate lane size is stored."
          : `The series lane is ${signals.lane}, booked ${signals.booked}.`;
      firing.push({
        id: ruleId("capacity", signals.dataLabel),
        rule: "capacity",
        severity: signals.openSlots === 0 ? "hold" : "watch",
        title: "Open slots at or below the local threshold",
        detail: `${label} Open slots are ${signals.openSlots}. Threshold is ${rules.capacity.openSlotsAtOrBelow}. ${lane} Driven by the desk capacity series. Not an accuracy percent.`
      });
    }
  }

  if (rules.lateJobs.enabled && signals.lateJobs >= rules.lateJobs.countAtOrAbove) {
    firing.push({
      id: ruleId("late-jobs", signals.dataLabel),
      rule: "late-jobs",
      severity: signals.lateJobs >= 5 ? "hold" : "watch",
      title: "Late jobs at or above the local threshold",
      detail: `${label} Late jobs are ${signals.lateJobs}. Threshold is ${rules.lateJobs.countAtOrAbove}. ${signals.lateBasis} Driven by unfinished job rows and the mission clock. Not an on-time percent.`
    });
  }

  if (rules.trustBand.enabled) {
    const current = signals.evidenceTrust;
    if (current === "n/a") {
      notices.push({
        severity: "info",
        title: "Trust-band rule waiting",
        detail: `${label} Evidence trust score is n/a. The trust-band rule does not treat a missing packet as a company trust drop.`
      });
    } else {
      const floorHit = TRUST_RANK[current] <= TRUST_RANK[rules.trustBand.atOrBelow];
      const dropped =
        previousTrust != null &&
        previousTrust !== "n/a" &&
        TRUST_RANK[current] < TRUST_RANK[previousTrust];
      if (floorHit || dropped) {
        const movement = dropped
          ? `The local alert state last saw ${previousTrust} and the desk score is now ${current}.`
          : `Desk evidence-trust score is ${current}, at or below the floor ${rules.trustBand.atOrBelow}.`;
        firing.push({
          id: ruleId("trust-band", signals.dataLabel),
          rule: "trust-band",
          severity: current === "LOW" ? "hold" : "watch",
          title: dropped ? "Evidence trust band dropped" : "Evidence trust band at or below the floor",
          detail: `${label} ${movement} Driven by the evidence-trust score. Trust is not truth. Not an accuracy percent.`
        });
      }
    }
  }

  if (rules.bookingBlock.enabled && rules.bookingBlock.when.includes(signals.bookingBlock)) {
    const pace = `Mission pace actual ${signals.missionActual}, expected ${signals.missionExpectedPace.toFixed(2)}, day fraction ${signals.missionElapsedFraction.toFixed(2)}.`;
    firing.push({
      id: ruleId("booking-block", signals.dataLabel),
      rule: "booking-block",
      severity: signals.bookingBlock === "HOLD" ? "watch" : "hold",
      title: `Booking block is ${signals.bookingBlock}`,
      detail: `${label} recommendBlock is ${signals.bookingBlock}. ${pace} Driven by the booking-block score. A booking recommendation, not a prediction percent.`
    });
  }

  if (rules.verificationStall.enabled && rules.verificationStall.whenStatus.includes(signals.verification as "UNVERIFIED" | "PARTIAL" | "CONFLICTED")) {
    if (!signals.oldestObservationAt) {
      notices.push({
        severity: "info",
        title: "Verification stall rule waiting",
        detail: `${label} Verification score is ${signals.verification}. No observation clock is on the rows, so stall minutes are not invented. Wrapper admission is not verification.`
      });
    } else {
      const minutes = (Date.parse(signals.now) - Date.parse(signals.oldestObservationAt)) / 60000;
      if (Number.isFinite(minutes) && minutes >= rules.verificationStall.stallMinutes) {
        firing.push({
          id: ruleId("verification-stall", signals.dataLabel),
          rule: "verification-stall",
          severity: signals.verification === "CONFLICTED" ? "hold" : "watch",
          title: "Verification still stalled",
          detail: `${label} Verification score is ${signals.verification}. Oldest observation ${signals.oldestObservationAt} is ${Math.floor(minutes)} minutes before the desk clock. Threshold is ${rules.verificationStall.stallMinutes} minutes. Driven by the verification score. Wrapper admission is not verification. Not an accuracy percent.`
        });
      }
    }
  } else if (rules.verificationStall.enabled && signals.verification === "PARTIAL") {
    notices.push({
      severity: "info",
      title: "Verification stall rule quiet",
      detail: `${label} Verification score is PARTIAL, which this config does not treat as a stall. Not an accuracy percent.`
    });
  }

  return { firing, notices };
}

export function applyDeskAlerts(input: {
  signals: DeskRuleSignals;
  config: AlertConfig;
  state: AlertStateFile | null;
  now: string;
}): { active: StoredAlert[]; history: StoredAlert[]; state: AlertStateFile; notices: AlertNotice[]; raised: StoredAlert[] } {
  const prior = input.state ?? emptyAlertState();
  const evaluated = evaluateRules(input.signals, input.config, prior.lastTrustBand);
  const byId = new Map(prior.alerts.map((alert) => [alert.id, { ...alert }]));
  const firingIds = new Set(evaluated.firing.map((alert) => alert.id));
  const raised: StoredAlert[] = [];

  for (const draft of evaluated.firing) {
    const existing = byId.get(draft.id);
    if (!existing || !existing.active) {
      const row: StoredAlert = {
        id: draft.id,
        rule: draft.rule,
        severity: draft.severity,
        title: draft.title,
        detail: draft.detail,
        dataLabel: input.signals.dataLabel,
        raisedAt: input.now,
        lastSeenAt: input.now,
        active: true,
        acknowledgedAt: null,
        acknowledgedBy: null,
        inventedAccuracy: false
      };
      byId.set(draft.id, row);
      raised.push(row);
    } else {
      existing.severity = draft.severity;
      existing.title = draft.title;
      existing.detail = draft.detail;
      existing.lastSeenAt = input.now;
      existing.dataLabel = input.signals.dataLabel;
      byId.set(draft.id, existing);
    }
  }

  for (const [id, row] of byId) {
    if (row.active && !firingIds.has(id)) {
      row.active = false;
      row.lastSeenAt = input.now;
      byId.set(id, row);
    }
  }

  const history = [...byId.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.id.localeCompare(b.id)).slice(0, 80);
  const state: AlertStateFile = {
    version: 1,
    lastTrustBand: input.signals.evidenceTrust,
    alerts: history
  };
  return {
    active: history.filter((alert) => alert.active),
    history,
    state,
    notices: evaluated.notices,
    raised
  };
}

export function acknowledgeAlert(state: AlertStateFile, id: string, by: string, at: string): { state: AlertStateFile; found: boolean } {
  const name = by.trim().slice(0, 80);
  if (!name) throw new Error("acknowledge requires a local operator name");
  let found = false;
  const alerts = state.alerts.map((alert) => {
    if (alert.id !== id || !alert.active) return alert;
    found = true;
    return { ...alert, acknowledgedAt: at, acknowledgedBy: name, lastSeenAt: at };
  });
  return { state: { ...state, alerts }, found };
}

export function acknowledgeStoredAlert(path: string, id: string, by: string, at: string): { found: boolean; acknowledgedAt?: string } {
  const current = readAlertState(path);
  const result = acknowledgeAlert(current, id, by, at);
  if (!result.found) return { found: false };
  writeAlertState(path, result.state);
  const row = result.state.alerts.find((alert) => alert.id === id);
  return { found: true, acknowledgedAt: row?.acknowledgedAt ?? at };
}

export interface AlertHookBody {
  at: string;
  id: string;
  rule: AlertRuleKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  dataLabel: AlertDataLabel;
  live_backends: false;
  phoneHome: false;
  writes: false;
}

export function alertHookBody(alert: StoredAlert, at: string): AlertHookBody {
  return {
    at,
    id: alert.id,
    rule: alert.rule,
    severity: alert.severity,
    title: alert.title,
    detail: alert.detail,
    dataLabel: alert.dataLabel,
    live_backends: false,
    phoneHome: false,
    writes: false
  };
}

export function dispatchLocalHooks(options: {
  cwd: string;
  config: AlertConfig;
  raised: StoredAlert[];
  now: string;
  fetchImpl?: typeof fetch;
}): { fileAppended: number; webhookCalled: number } {
  if (!options.raised.length) return { fileAppended: 0, webhookCalled: 0 };
  let fileAppended = 0;
  let webhookCalled = 0;
  const file = options.config.hooks.file;
  const webhook = options.config.hooks.webhook;
  for (const alert of options.raised) {
    const body = alertHookBody(alert, options.now);
    if (file) {
      const path = isAbsolute(file) ? file : join(options.cwd, file);
      assertLocalHookFile(path);
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${JSON.stringify(body)}\n`, "utf8");
      fileAppended += 1;
    }
    if (webhook) {
      const url = assertLocalWebhook(webhook);
      const fetchImpl = options.fetchImpl ?? fetch;
      webhookCalled += 1;
      try {
        void Promise.resolve(
          fetchImpl(url.toString(), {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "user-agent": "trades-runtime-local-desk"
            },
            body: JSON.stringify(body)
          })
        ).catch(() => {
          /* A failed local hook does not phone home and does not blank the desk. */
        });
      } catch {
        /* Sync failures from a test double stay on this machine. */
      }
    }
  }
  return { fileAppended, webhookCalled };
}

export interface AlertDigestHit {
  id: string;
  rule: AlertRuleKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  dataLabel: AlertDataLabel;
  raisedAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  active: true;
  inventedAccuracy: false;
}

export interface AlertDigest {
  product: "trades-runtime";
  version: string;
  generatedAt: string;
  dataLabel: AlertDataLabel;
  live_backends: false;
  writes: false;
  phoneHome: false;
  vendorWrite: false;
  surface: "local-operator-desk";
  hitCount: number;
  hits: AlertDigestHit[];
}

/** Current firing rule hits. Loopback export only. Desk notes are not hits. */
export function buildAlertDigest(input: {
  version: string;
  generatedAt: string;
  dataLabel: AlertDataLabel;
  hits: StoredAlert[];
}): AlertDigest {
  const hits: AlertDigestHit[] = input.hits
    .filter((hit) => hit.active)
    .map((hit) => ({
      id: hit.id,
      rule: hit.rule,
      severity: hit.severity,
      title: hit.title,
      detail: hit.detail,
      dataLabel: hit.dataLabel,
      raisedAt: hit.raisedAt,
      lastSeenAt: hit.lastSeenAt,
      acknowledgedAt: hit.acknowledgedAt,
      acknowledgedBy: hit.acknowledgedBy,
      active: true as const,
      inventedAccuracy: false as const
    }));
  return {
    product: "trades-runtime",
    version: input.version,
    generatedAt: input.generatedAt,
    dataLabel: input.dataLabel,
    live_backends: false,
    writes: false,
    phoneHome: false,
    vendorWrite: false,
    surface: "local-operator-desk",
    hitCount: hits.length,
    hits
  };
}

function csvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replaceAll('"', '""')}"`;
  return guarded;
}

export function alertDigestCsv(digest: AlertDigest): string {
  const header = [
    "id",
    "rule",
    "severity",
    "title",
    "detail",
    "dataLabel",
    "raisedAt",
    "lastSeenAt",
    "acknowledgedAt",
    "acknowledgedBy",
    "active"
  ];
  const lines = [header.join(",")];
  for (const hit of digest.hits) {
    lines.push(
      [
        hit.id,
        hit.rule,
        hit.severity,
        hit.title,
        hit.detail,
        hit.dataLabel,
        hit.raisedAt,
        hit.lastSeenAt,
        hit.acknowledgedAt ?? "",
        hit.acknowledgedBy ?? "",
        "true"
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function enabledRuleList(config: AlertConfig): AlertRuleKind[] {
  const enabled: AlertRuleKind[] = [];
  if (config.rules.capacity.enabled) enabled.push("capacity");
  if (config.rules.lateJobs.enabled) enabled.push("late-jobs");
  if (config.rules.trustBand.enabled) enabled.push("trust-band");
  if (config.rules.bookingBlock.enabled) enabled.push("booking-block");
  if (config.rules.verificationStall.enabled) enabled.push("verification-stall");
  return enabled;
}
