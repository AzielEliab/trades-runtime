import { inboundDir, isHostedTenantLayout, refuseHostedTenantLayout } from "./inbound-layout.js";
import { isolateLedgerPath, isolateReceiptPath, sanitizeInstanceId } from "./runtime-isolate.js";

const FORBIDDEN_CLOUD_KEYS = [
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

export interface LocalInboundConfig {
  instanceId: string;
  servicetitanPath: string;
  probooksPath: string;
  servicetitanReadEndpoint?: string;
  probooksReadEndpoint?: string;
  receiptPath: string;
  ledgerPath: string;
  cloudAccount?: never;
  hostedUploader?: never;
  tenants?: never;
}

export function defaultLocalInboundConfig(instanceId = "local"): LocalInboundConfig {
  const id = sanitizeInstanceId(instanceId);
  return {
    instanceId: id,
    servicetitanPath: inboundDir("servicetitan"),
    probooksPath: inboundDir("probooks"),
    receiptPath: isolateReceiptPath(id),
    ledgerPath: isolateLedgerPath(id)
  };
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("local inbound config must be an object");
  }
  return raw as Record<string, unknown>;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`local inbound config ${field} must be a non-empty string`);
  }
  return value.trim();
}

export function parseLocalInboundConfig(raw: unknown): LocalInboundConfig {
  const record = asRecord(raw);
  for (const key of FORBIDDEN_CLOUD_KEYS) {
    if (key in record && record[key] != null) {
      throw new Error(`local inbound config refuses ${key}; credentials and dumps stay on this machine`);
    }
  }
  if (Array.isArray(record.instanceIds) && record.instanceIds.length > 1) {
    throw new Error("one process config cannot mix tenant packets as a shared hosted corpus");
  }

  const instanceId = sanitizeInstanceId(optionalString(record.instanceId, "instanceId") ?? "local");
  const defaults = defaultLocalInboundConfig(instanceId);
  const servicetitanPath = optionalString(record.servicetitanPath, "servicetitanPath") ?? defaults.servicetitanPath;
  const probooksPath = optionalString(record.probooksPath, "probooksPath") ?? defaults.probooksPath;
  const receiptPath = optionalString(record.receiptPath, "receiptPath") ?? defaults.receiptPath;
  const ledgerPath = optionalString(record.ledgerPath, "ledgerPath") ?? defaults.ledgerPath;

  for (const path of [servicetitanPath, probooksPath, receiptPath, ledgerPath]) {
    if (isHostedTenantLayout(path)) refuseHostedTenantLayout(path);
  }

  return {
    instanceId,
    servicetitanPath,
    probooksPath,
    servicetitanReadEndpoint: optionalString(record.servicetitanReadEndpoint, "servicetitanReadEndpoint"),
    probooksReadEndpoint: optionalString(record.probooksReadEndpoint, "probooksReadEndpoint"),
    receiptPath,
    ledgerPath
  };
}
