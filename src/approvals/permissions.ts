import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";
import { PLATFORM_WRITEBACK_PERMISSIONS } from "../spine/platforms/catalog.js";

/**
 * Write permissions for the local runtime.
 *
 * Each permission names one real write path in this repo. Nothing here is
 * enabled by default: the default is `selected` mode with an empty list,
 * which behaves exactly like the old read-only runtime.
 *
 * Writes require operator approval; default off.
 */
export const WRITE_PERMISSIONS = [
  /** Write-back to a ServiceTitan tenant through an operator-configured local backend. */
  "servicetitan.writeback",
  /** Write-back to ProBooks through an operator-configured local backend. */
  "probooks.writeback",
  /** Write-back to another trades app (Jobber, Housecall Pro, ...) through an operator-configured local backend. */
  "tradesapp.writeback",
  /**
   * One write-back permission per platform peer (jobber.writeback, housecallpro.writeback,
   * square.writeback, quickbooks.writeback, fieldedge.writeback, servicefusion.writeback).
   */
  ...PLATFORM_WRITEBACK_PERMISSIONS,
  /** Acknowledge a firing local alert (data/runtime/<instanceId>/alert-state.json). */
  "alerts.ack",
  /** Raise a local field flag (data/runtime/<instanceId>/field-flags/). */
  "field_flags.write",
  /** Record a clock / meal / drive event (data/runtime/<instanceId>/field-events.jsonl). */
  "field_events.write"
] as const;

export type WritePermission = (typeof WRITE_PERMISSIONS)[number];

export const PERMISSION_MODES = ["all", "selected"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const DEFAULT_APPROVAL_TTL_SECONDS = 900;
export const MIN_APPROVAL_TTL_SECONDS = 30;
export const MAX_APPROVAL_TTL_SECONDS = 86_400;

export interface PermissionSettings {
  /** `all` enables every write permission. `selected` enables only `selected`. */
  mode: PermissionMode;
  /** Used in `selected` mode. Ignored in `all` mode. */
  selected: WritePermission[];
  /**
   * Only honored in `all` mode. When true, an enabled write runs without a
   * per-call yes/no. Off by default. Every call is still logged.
   */
  autoApprove: boolean;
  /** Pending and approved-but-unrun requests expire after this many seconds. */
  approvalTtlSeconds: number;
}

export const PERMISSIONS_NOTE =
  "Writes require operator approval; default off. Default is selected mode with nothing enabled, the same as read-only. " +
  "All mode enables every write permission but each call still asks yes or no unless autoApprove is also on (off by default). " +
  "autoApprove is ignored in selected mode. Approvals come from the local operator only (loopback desk or npm run approve). " +
  "An MCP caller can never approve its own request. live_backends stays false in the catalog.";

export function defaultPermissionSettings(): PermissionSettings {
  return {
    mode: "selected",
    selected: [],
    autoApprove: false,
    approvalTtlSeconds: DEFAULT_APPROVAL_TTL_SECONDS
  };
}

export function isWritePermission(value: unknown): value is WritePermission {
  return typeof value === "string" && (WRITE_PERMISSIONS as readonly string[]).includes(value);
}

export function parsePermissionSettings(raw: unknown): PermissionSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("permission settings must be an object");
  }
  const record = raw as Record<string, unknown>;
  const defaults = defaultPermissionSettings();
  const mode = record.mode ?? defaults.mode;
  if (typeof mode !== "string" || !(PERMISSION_MODES as readonly string[]).includes(mode)) {
    throw new Error(`permission mode must be one of ${PERMISSION_MODES.join(", ")}`);
  }
  const selectedRaw = record.selected ?? [];
  if (!Array.isArray(selectedRaw)) throw new Error("permission settings selected must be a list");
  const selected: WritePermission[] = [];
  for (const item of selectedRaw) {
    if (!isWritePermission(item)) {
      throw new Error(`unknown write permission: ${String(item)} (known: ${WRITE_PERMISSIONS.join(", ")})`);
    }
    if (!selected.includes(item)) selected.push(item);
  }
  const autoApprove = record.autoApprove ?? false;
  if (typeof autoApprove !== "boolean") throw new Error("permission settings autoApprove must be true or false");
  const ttl = record.approvalTtlSeconds ?? defaults.approvalTtlSeconds;
  if (
    typeof ttl !== "number" ||
    !Number.isInteger(ttl) ||
    ttl < MIN_APPROVAL_TTL_SECONDS ||
    ttl > MAX_APPROVAL_TTL_SECONDS
  ) {
    throw new Error(
      `approvalTtlSeconds must be an integer from ${MIN_APPROVAL_TTL_SECONDS} to ${MAX_APPROVAL_TTL_SECONDS}`
    );
  }
  return {
    mode: mode as PermissionMode,
    selected: WRITE_PERMISSIONS.filter((permission) => selected.includes(permission)),
    autoApprove,
    approvalTtlSeconds: ttl
  };
}

export function defaultPermissionsPath(instanceId: string, root = "data/runtime"): string {
  const id = sanitizeInstanceId(instanceId);
  if (id === "shared" || id === "hosted" || id === "tenants") {
    throw new Error("permission settings require a local instance id (not shared/hosted/tenants)");
  }
  return join(root, id, "permissions.json");
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : join(cwd, path);
}

export interface LoadedPermissions {
  settings: PermissionSettings;
  path: string;
  source: "default" | "file";
  error?: string;
}

/** A missing or unreadable file falls back to the read-only default. It never widens access. */
export function loadPermissionSettings(cwd: string, instanceId: string): LoadedPermissions {
  const path = defaultPermissionsPath(instanceId);
  const full = resolvePath(cwd, path);
  if (!existsSync(full)) return { settings: defaultPermissionSettings(), path, source: "default" };
  try {
    return { settings: parsePermissionSettings(JSON.parse(readFileSync(full, "utf8"))), path, source: "file" };
  } catch (error) {
    return {
      settings: defaultPermissionSettings(),
      path,
      source: "default",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function savePermissionSettings(cwd: string, instanceId: string, raw: unknown): LoadedPermissions {
  const settings = parsePermissionSettings(raw);
  const path = defaultPermissionsPath(instanceId);
  const full = resolvePath(cwd, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify({ ...settings, note: PERMISSIONS_NOTE }, null, 2)}\n`, "utf8");
  return { settings, path, source: "file" };
}

export function enabledPermissions(settings: PermissionSettings): WritePermission[] {
  return settings.mode === "all" ? [...WRITE_PERMISSIONS] : [...settings.selected];
}

export function isPermissionEnabled(settings: PermissionSettings, permission: WritePermission): boolean {
  return enabledPermissions(settings).includes(permission);
}

/** True when an enabled write may skip the per-call yes/no. Only `all` mode + autoApprove. */
export function skipsPrompt(settings: PermissionSettings): boolean {
  return settings.mode === "all" && settings.autoApprove === true;
}
