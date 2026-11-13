import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadWriteBackends } from "../approvals/backends.js";
import { sanitizeInstanceId } from "./runtime-isolate.js";

/**
 * Field Softwares 1.0 and Office Softwares 1.0 are ready.
 * Each shop implements on its own machine. The public demo does not hold a shop.
 * TR-FIELD-OFFICE-SELF-SERVE-2026-11-13.
 */

export const FIELD_SOFTWARES_1_0_READY = "ready" as const;
export const OFFICE_SOFTWARES_1_0_READY = "ready" as const;
export const FIELD_OFFICE_SHOP_LOCAL = "shop-local" as const;
export const SHOP_IMPLEMENTATION = "shop-self-serve" as const;

export const FIELD_OFFICE_RELEASE = {
  field_softwares_1_0: FIELD_SOFTWARES_1_0_READY,
  office_softwares_1_0: OFFICE_SOFTWARES_1_0_READY,
  implementation: SHOP_IMPLEMENTATION,
  central_operator_pilot: false as const,
  company_os_live: false as const,
  public_pilot_started: false as const,
  public_live_backends: false as const,
  public_field_claim: false as const,
  public_tenant_data: false as const,
  writes: "approval-gated-off" as const,
  pages: "off" as const
} as const;

export const FIELD_OFFICE_HONESTY =
  "TR-FIELD-OFFICE-SELF-SERVE-2026-11-13: Field Softwares 1.0 and Office Softwares 1.0 are ready for shop self-implementation. Each shop runs its own local setup, exports, and credentials. There is no central operator pilot. npm run pilot:start -- --branch <branchId> starts that shop's Field and Office 1.0 on that isolate only. The public demo Worker stays pilot_started false and live_backends false unless that shop configured its own local backends, which the public Worker does not hold. No tenant data on public Workers or Pages. Writes require operator approval; default off. Not a live company OS.";

export type LiveBackendsScope = "public-demo" | "shop-local" | "none";

function instanceIdFor(cwd: string, instanceId?: string): string {
  if (instanceId) return sanitizeInstanceId(instanceId);
  const localPath = join(cwd, "data", "inbound", "local.json");
  if (!existsSync(localPath)) return "local";
  try {
    const parsed = JSON.parse(readFileSync(localPath, "utf8")) as { instanceId?: unknown };
    if (typeof parsed.instanceId === "string" && parsed.instanceId.trim()) return sanitizeInstanceId(parsed.instanceId);
  } catch {
    return "local";
  }
  return "local";
}

function localJsonHasBackend(cwd: string): boolean {
  const localPath = join(cwd, "data", "inbound", "local.json");
  if (!existsSync(localPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(localPath, "utf8")) as Record<string, unknown>;
    for (const key of ["servicetitanReadEndpoint", "probooksReadEndpoint", "tradesAppReadEndpoint"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * True only when this machine has a shop-configured local backend.
 * The public demo has no such file. A missing or unreadable file stays false.
 */
export function localBackendsConfigured(cwd: string, instanceId?: string): boolean {
  let id = "local";
  try {
    id = instanceIdFor(cwd, instanceId);
  } catch {
    return false;
  }
  const loaded = loadWriteBackends(cwd, id);
  if (!loaded.error && Object.keys(loaded.backends).length > 0) return true;
  return localJsonHasBackend(cwd);
}

export function liveBackendsScope(configured: boolean, surface: "public-demo" | "shop"): LiveBackendsScope {
  if (surface === "public-demo") return "public-demo";
  return configured ? "shop-local" : "none";
}

/** Public demo stays false. A shop machine may be true only when that shop configured local backends. */
export function liveBackendsStayHonest(card: { live_backends: boolean; live_backends_scope: LiveBackendsScope; company_os_live: boolean }): boolean {
  if (card.company_os_live) return false;
  if (card.live_backends_scope === "public-demo" || card.live_backends_scope === "none") return card.live_backends === false;
  return card.live_backends_scope === "shop-local" && card.live_backends === true;
}
