import { join } from "node:path";
import { DurableReceiptStore, openDurableReceipts } from "./durable-receipts.js";
import {
  HOSTED_TENANT_LAYOUT,
  PROBOOKS_INBOUND_DIR,
  RUNTIME_ISOLATE_ROOT,
  SERVICE_TITAN_INBOUND_DIR,
  TRADES_APP_INBOUND_DIR,
  isHostedTenantLayout,
  refuseHostedTenantLayout
} from "./inbound-layout.js";

/** Committed example. The operator copy is gitignored under the isolate. */
export const ALERTS_EXAMPLE_PATH = "data/runtime/alerts.json.example";

export function sanitizeInstanceId(instanceId: string): string {
  const id = instanceId.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  if (!id || id === "shared" || id === "hosted" || id === "tenants") {
    throw new Error("runtime isolate requires a local instance id (not shared/hosted/tenants)");
  }
  return id;
}

export interface RuntimeIsolate {
  instanceId: string;
  receiptPath: string;
  ledgerPath: string;
  inboundRoot: string;
  inbound: {
    servicetitan: string;
    probooks: string;
    "trades-app": string;
  };
  alertsExample: string;
  alertsPath: string;
  hostedTenantLayout: typeof HOSTED_TENANT_LAYOUT;
  hostedTenantRefused: true;
}

export function isolateRoot(instanceId: string): string {
  return join(RUNTIME_ISOLATE_ROOT, sanitizeInstanceId(instanceId));
}

export function isolateReceiptPath(instanceId: string): string {
  return join(isolateRoot(instanceId), "receipts.jsonl");
}

export function isolateLedgerPath(instanceId: string): string {
  return join(isolateRoot(instanceId), "ledger.jsonl");
}

export function isolateAlertsPath(instanceId: string): string {
  return join(isolateRoot(instanceId), "alerts.json");
}

export function openIsolatedReceipts(instanceId: string): DurableReceiptStore {
  return openDurableReceipts(isolateReceiptPath(instanceId));
}

export function describeRuntimeIsolate(instanceId: string): RuntimeIsolate {
  const id = sanitizeInstanceId(instanceId);
  return {
    instanceId: id,
    receiptPath: isolateReceiptPath(id),
    ledgerPath: isolateLedgerPath(id),
    inboundRoot: "data/inbound",
    inbound: {
      servicetitan: SERVICE_TITAN_INBOUND_DIR,
      probooks: PROBOOKS_INBOUND_DIR,
      "trades-app": TRADES_APP_INBOUND_DIR
    },
    alertsExample: ALERTS_EXAMPLE_PATH,
    alertsPath: isolateAlertsPath(id),
    hostedTenantLayout: HOSTED_TENANT_LAYOUT,
    hostedTenantRefused: true
  };
}

export function isolatesDoNotMix(a: string, b: string): boolean {
  return isolateReceiptPath(a) !== isolateReceiptPath(b) && isolateLedgerPath(a) !== isolateLedgerPath(b);
}

export function assertIsolatesDoNotMix(a: string, b: string): void {
  if (!isolatesDoNotMix(a, b)) {
    throw new Error("runtime isolates must not share receipt or ledger files");
  }
}

export function refuseSharedHostedCorpus(path = HOSTED_TENANT_LAYOUT): never {
  refuseHostedTenantLayout(path);
}

export function assertIsolatePath(path: string): string {
  if (isHostedTenantLayout(path)) refuseSharedHostedCorpus(path);
  return path;
}
