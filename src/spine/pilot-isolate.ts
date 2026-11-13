import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseLocalInboundConfig } from "./local-inbound-config.js";
import { isolateRoot, sanitizeInstanceId } from "./runtime-isolate.js";

/**
 * Per-runtime isolate record for a shop's Field and Office 1.0 start.
 * The shipped catalog stays pilot_started false. Only pilot-start writes this file.
 * A successful record is shop-local Field Softwares 1.0 and Office Softwares 1.0.
 * A record that claims a company OS, a hosted field launch, public live backends, or writes is ignored.
 */

export type IsolateInboundKind = "empty" | "synthetic-only" | "operator-drop";

export interface IsolatePilotRecord {
  kind: "option-c-pilot-isolate";
  author: "Aziel Eliab";
  identity: "Aziel Eliab";
  version: string;
  product_label: "Local Softwares 1.0";
  track: "L";
  instanceId: string;
  branchId: string;
  at: string;
  pilot_started: true;
  live_backends: false;
  writes: false;
  pages: "off";
  mode: "SHADOW-SEALED";
  auto_promote: false;
  field_claim: false;
  field_launch: false;
  company_os_live: false;
  office_softwares_1_0: "shop-local";
  field_softwares_1_0: "shop-local";
  implementation: "shop-self-serve";
  central_operator_pilot: false;
  phone_home: false;
  central_dump: false;
  inbound: IsolateInboundKind;
  customer_data: false;
  wrapper_is_verification: false;
  claim: string;
}

export function isolatePilotPath(instanceId: string): string {
  return join(isolateRoot(instanceId), "pilot.json");
}

export function resolveInstanceId(cwd: string): string {
  const localPath = join(cwd, "data", "inbound", "local.json");
  if (!existsSync(localPath)) return "local";
  try {
    const parsed = parseLocalInboundConfig(JSON.parse(readFileSync(localPath, "utf8")) as unknown);
    return sanitizeInstanceId(parsed.instanceId);
  } catch {
    return "local";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isIsolatePilotRecord(value: unknown): value is IsolatePilotRecord {
  if (!isRecord(value)) return false;
  const inbound = value.inbound;
  return (
    value.kind === "option-c-pilot-isolate" &&
    value.author === "Aziel Eliab" &&
    value.identity === "Aziel Eliab" &&
    value.product_label === "Local Softwares 1.0" &&
    value.track === "L" &&
    typeof value.version === "string" &&
    typeof value.instanceId === "string" &&
    value.instanceId.trim().length > 0 &&
    typeof value.branchId === "string" &&
    value.branchId.trim().length > 0 &&
    typeof value.at === "string" &&
    value.at.trim().length > 0 &&
    value.pilot_started === true &&
    value.live_backends === false &&
    value.writes === false &&
    value.pages === "off" &&
    value.mode === "SHADOW-SEALED" &&
    value.auto_promote === false &&
    value.field_claim === false &&
    value.field_launch === false &&
    value.company_os_live === false &&
    value.office_softwares_1_0 === "shop-local" &&
    value.field_softwares_1_0 === "shop-local" &&
    value.implementation === "shop-self-serve" &&
    value.central_operator_pilot === false &&
    value.phone_home === false &&
    value.central_dump === false &&
    (inbound === "empty" || inbound === "synthetic-only" || inbound === "operator-drop") &&
    value.customer_data === false &&
    value.wrapper_is_verification === false &&
    typeof value.claim === "string" &&
    value.claim.trim().length > 0
  );
}

/** Read the isolate start record. Missing or dishonest files count as not started. */
export function readIsolatePilot(cwd: string, instanceId?: string): IsolatePilotRecord | null {
  let id = "local";
  try {
    id = instanceId ? sanitizeInstanceId(instanceId) : resolveInstanceId(cwd);
  } catch {
    return null;
  }
  const path = join(cwd, isolatePilotPath(id));
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isIsolatePilotRecord(parsed) || parsed.instanceId !== id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeIsolatePilot(cwd: string, record: IsolatePilotRecord): string {
  if (!isIsolatePilotRecord(record)) {
    throw new Error("isolate pilot record refused: shop-local Field and Office flags did not stay honest");
  }
  const rel = isolatePilotPath(record.instanceId);
  const path = join(cwd, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return rel;
}
