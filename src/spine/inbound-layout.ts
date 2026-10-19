import { join } from "node:path";
import { PLATFORM_KINDS, PLATFORM_SPECS, type PlatformKind } from "./platforms/catalog.js";

/** Local BYO inbound on the user's machine. Not a hosted multi-tenant corpus. */
export const BYO_INBOUND_ROOT = "data/inbound";
export const SERVICE_TITAN_INBOUND_DIR = "data/inbound/servicetitan";
export const PROBOOKS_INBOUND_DIR = "data/inbound/probooks";
export const TRADES_APP_INBOUND_DIR = "data/inbound/trades-app";
export const RUNTIME_ISOLATE_ROOT = "data/runtime";
export const HOSTED_TENANT_LAYOUT = "data/tenants";

export type ByoInboundKind = "servicetitan" | "probooks" | "trades-app" | PlatformKind;

/** Every local drop folder class, named peers first. */
export const BYO_INBOUND_KINDS: readonly ByoInboundKind[] = ["servicetitan", "probooks", "trades-app", ...PLATFORM_KINDS];

export const TR_BYO_LAWS = [
  "byo-not-central-dump",
  "per-runtime-isolate",
  "both-sources-first-class",
  "fraggate-still-admits",
  "wrapper-not-verified",
  "writes-refused",
  "credentials-local",
  "no-tenant-data-on-pages"
] as const;

export type TrByoLaw = (typeof TR_BYO_LAWS)[number];

const INBOUND_DIRS: Record<ByoInboundKind, string> = {
  servicetitan: SERVICE_TITAN_INBOUND_DIR,
  probooks: PROBOOKS_INBOUND_DIR,
  "trades-app": TRADES_APP_INBOUND_DIR,
  ...(Object.fromEntries(PLATFORM_KINDS.map((kind) => [kind, PLATFORM_SPECS[kind].inboundDir])) as Record<PlatformKind, string>)
};

export function inboundDir(kind: ByoInboundKind): string {
  return INBOUND_DIRS[kind];
}

export function inboundPath(kind: ByoInboundKind, fileName?: string): string {
  if (!fileName) return inboundDir(kind);
  return join(inboundDir(kind), fileName);
}

export function isHostedTenantLayout(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return (
    normalized === HOSTED_TENANT_LAYOUT ||
    normalized.startsWith(`${HOSTED_TENANT_LAYOUT}/`) ||
    normalized.includes("/tenants/")
  );
}

export function refuseHostedTenantLayout(path = HOSTED_TENANT_LAYOUT): never {
  throw new Error(
    `hosted multi-tenant layout is refused (${path}); use ${SERVICE_TITAN_INBOUND_DIR}, ${PROBOOKS_INBOUND_DIR}, and ${TRADES_APP_INBOUND_DIR} on this machine`
  );
}

export function assertLocalInboundPath(path: string): string {
  if (isHostedTenantLayout(path)) refuseHostedTenantLayout(path);
  return path;
}
