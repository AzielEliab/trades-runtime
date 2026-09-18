import { join } from "node:path";
import { DurableReceiptStore, openDurableReceipts } from "./durable-receipts.js";
import { HOSTED_TENANT_LAYOUT, RUNTIME_ISOLATE_ROOT, isHostedTenantLayout, refuseHostedTenantLayout } from "./inbound-layout.js";

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

export function openIsolatedReceipts(instanceId: string): DurableReceiptStore {
  return openDurableReceipts(isolateReceiptPath(instanceId));
}

export function describeRuntimeIsolate(instanceId: string): RuntimeIsolate {
  const id = sanitizeInstanceId(instanceId);
  return {
    instanceId: id,
    receiptPath: isolateReceiptPath(id),
    ledgerPath: isolateLedgerPath(id),
    inboundRoot: "data/inbound"
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
