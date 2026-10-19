import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { isHostedTenantLayout } from "../inbound-layout.js";
import { isPlatformKind, PLATFORM_SPECS, type PlatformKind } from "./catalog.js";
import { getPath, isRecord, rowsOf } from "./map.js";
import { PULL_PLANS, type PullPlan } from "./pull-plans.js";

/**
 * Optional read-only live pull for platform peers.
 *
 * Off by default. It runs only when the operator names the platform in the
 * gitignored data/inbound/local.json under platforms.<kind>.pull and the named
 * environment variable holds a token on this machine. Inline credentials are
 * refused. The pull writes one JSON document into data/inbound/<kind>/ on this
 * machine; the desk admits it through FragGate like any file drop (MEDIUM,
 * UNVERIFIED). Nothing is sent anywhere except the vendor's documented API.
 * Never tested against a live tenant.
 */

export interface PlatformPullConfig {
  tokenEnv: string;
  baseUrl?: string;
  pageSize: number;
  graphqlVersion?: string;
  squareVersion?: string;
  locationId?: string;
  realmId?: string;
  realmIdEnv?: string;
  minorVersion?: string;
}

export type PullOutcome = "pulled" | "partial" | "no-pull-configured" | "file-drop-only" | "vendor-error";

export interface PlatformPullResult {
  ok: boolean;
  outcome: PullOutcome;
  kind: PlatformKind;
  detail: string;
  file?: string;
  counts: Record<string, number>;
  errors: Record<string, string>;
  readOnly: true;
  live_backends: false;
}

export type PullFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

const SECRET_KEYS = ["token", "accessToken", "access_token", "secret", "clientSecret", "client_secret", "password", "apiKey", "api_key", "key"];

function isLoopback(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

export function parsePlatformPullConfig(kind: PlatformKind, raw: unknown): PlatformPullConfig {
  if (!isRecord(raw)) throw new Error(`platforms.${kind}.pull must be an object`);
  for (const key of SECRET_KEYS) {
    if (key in raw) throw new Error(`platforms.${kind}.pull refuses inline ${key}; name an environment variable with tokenEnv`);
  }
  const str = (field: string): string | undefined => {
    const value = raw[field];
    if (value == null) return undefined;
    if (typeof value !== "string" && typeof value !== "number") throw new Error(`platforms.${kind}.pull.${field} must be a string`);
    const text = String(value).trim();
    return text || undefined;
  };
  const tokenEnv = str("tokenEnv");
  if (!tokenEnv || !/^[A-Z_][A-Z0-9_]*$/i.test(tokenEnv)) throw new Error(`platforms.${kind}.pull.tokenEnv must name an environment variable`);
  const baseUrl = str("baseUrl");
  if (baseUrl) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
      throw new Error(`platforms.${kind}.pull.baseUrl must be https (http only for loopback)`);
    }
  }
  const pageSizeRaw = raw.pageSize ?? 50;
  const pageSize = Number(pageSizeRaw);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error(`platforms.${kind}.pull.pageSize must be 1 to 100`);
  return {
    tokenEnv,
    baseUrl: baseUrl?.replace(/\/$/, ""),
    pageSize,
    graphqlVersion: str("graphqlVersion"),
    squareVersion: str("squareVersion"),
    locationId: str("locationId"),
    realmId: str("realmId"),
    realmIdEnv: str("realmIdEnv"),
    minorVersion: str("minorVersion")
  };
}

/** Reads platforms.<kind>.pull from data/inbound/local.json (gitignored). */
export function loadPlatformPullConfig(cwd: string, kind: PlatformKind): { config?: PlatformPullConfig; path?: string; error?: string } {
  const full = join(cwd, "data/inbound/local.json");
  if (!existsSync(full)) return {};
  try {
    const parsed = JSON.parse(readFileSync(full, "utf8")) as unknown;
    const platforms = isRecord(parsed) && isRecord(parsed.platforms) ? parsed.platforms : undefined;
    const entry = platforms && isRecord(platforms[kind]) ? (platforms[kind] as Record<string, unknown>) : undefined;
    const path = entry && typeof entry.path === "string" && entry.path.trim() ? entry.path.trim() : undefined;
    if (!entry || entry.pull == null) return { path };
    return { config: parsePlatformPullConfig(kind, entry.pull), path };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function fill(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (_match, name: string) => {
    const value = values[name];
    return value === undefined ? "" : name === "minorVersionParam" ? value : encodeURIComponent(value);
  });
}

function fillBody(body: Record<string, unknown> | undefined, values: Record<string, string | undefined>): Record<string, unknown> | undefined {
  if (!body) return undefined;
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) copy[key] = typeof value === "string" ? value.replace(/\{pageSize\}/g, values.pageSize ?? "50") : value;
  return copy;
}

function result(kind: PlatformKind, outcome: PullOutcome, detail: string, extra: Partial<PlatformPullResult> = {}): PlatformPullResult {
  return {
    ok: outcome === "pulled" || outcome === "partial",
    outcome,
    kind,
    detail,
    counts: {},
    errors: {},
    readOnly: true,
    live_backends: false,
    ...extra
  };
}

export async function runPlatformPull(args: {
  kind: string;
  cwd: string;
  config?: PlatformPullConfig;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: PullFetch;
  now?: () => Date;
}): Promise<PlatformPullResult> {
  if (!isPlatformKind(args.kind)) throw new Error(`unknown platform: ${args.kind}`);
  const kind = args.kind;
  const spec = PLATFORM_SPECS[kind];
  const plan: PullPlan | undefined = PULL_PLANS[kind];
  if (!spec.api.livePull || !plan) {
    return result(kind, "file-drop-only", `${spec.label} ships file drop only: ${spec.api.access} Drop exports into ${spec.inboundDir}/. Nothing was fetched.`);
  }
  const loaded = args.config ? { config: args.config } : loadPlatformPullConfig(args.cwd, kind);
  const config = loaded.config;
  if (!config) {
    return result(
      kind,
      "no-pull-configured",
      loaded.error
        ? `no ${spec.label} pull configured: data/inbound/local.json was not applied (${loaded.error}). Nothing was fetched.`
        : `no ${spec.label} pull configured in data/inbound/local.json (platforms.${kind}.pull). Nothing was fetched.`
    );
  }
  const env = args.env ?? process.env;
  const token = env[config.tokenEnv];
  if (!token) {
    return result(kind, "no-pull-configured", `no ${spec.label} credential: environment variable ${config.tokenEnv} is empty on this machine. Nothing was fetched.`);
  }
  const headers: Record<string, string> = {
    Authorization: `${plan.authScheme} ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  for (const [header, field] of Object.entries(plan.requiredHeaders ?? {})) {
    const value = (config as unknown as Record<string, string | undefined>)[field];
    if (!value) return result(kind, "no-pull-configured", `${spec.label} pull needs platforms.${kind}.pull.${field} (sent as ${header}). Nothing was fetched.`);
    headers[header] = value;
  }
  const realmId = config.realmId ?? (config.realmIdEnv ? env[config.realmIdEnv] : undefined);
  const values: Record<string, string | undefined> = {
    pageSize: String(config.pageSize),
    locationId: config.locationId,
    realmId,
    minorVersionParam: config.minorVersion ? `&minorversion=${encodeURIComponent(config.minorVersion)}` : ""
  };
  for (const field of plan.requiredFields ?? []) {
    if (!values[field]) return result(kind, "no-pull-configured", `${spec.label} pull needs platforms.${kind}.pull.${field} or ${field}Env. Nothing was fetched.`);
  }
  const baseUrl = config.baseUrl ?? spec.api.defaultBaseUrl;
  if (!baseUrl) return result(kind, "no-pull-configured", `${spec.label} pull has no base URL. Nothing was fetched.`);
  const fetchImpl: PullFetch = args.fetchImpl ?? (globalThis.fetch as unknown as PullFetch);
  const now = (args.now ?? (() => new Date()))();
  const doc: Record<string, unknown> = {
    sourceKind: kind,
    vendor: kind,
    livePull: true,
    readOnly: true,
    synthetic: false,
    pulledAt: now.toISOString(),
    note: `Read-only ${spec.label} pull on this machine. Admitted as MEDIUM, UNVERIFIED. Not a verified record.`
  };
  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};
  for (const request of plan.requests) {
    if (request.requires && !values[request.requires]) {
      errors[request.key] = `skipped: needs platforms.${kind}.pull.${request.requires}`;
      continue;
    }
    if (request.method !== "GET" && !request.readOnlyPost) throw new Error(`refusing non-read ${request.method} in ${kind} pull plan`);
    const body = fillBody(request.body, values);
    if (body && typeof body.query === "string" && /\bmutation\b/i.test(body.query)) {
      throw new Error(`refusing GraphQL mutation in ${kind} pull plan`);
    }
    const url = `${baseUrl}${fill(request.path, values)}`;
    try {
      const res = await fetchImpl(url, { method: request.method, headers, body: body ? JSON.stringify(body) : undefined });
      const text = await res.text();
      if (!res.ok) {
        errors[request.key] = `HTTP ${res.status}: ${text.slice(0, 200)}`;
        continue;
      }
      const parsed = JSON.parse(text) as unknown;
      if (isRecord(parsed) && Array.isArray(parsed.errors) && parsed.errors.length) {
        errors[request.key] = `GraphQL errors: ${JSON.stringify(parsed.errors).slice(0, 200)}`;
      }
      const rows = rowsOf(getPath(parsed, request.collect));
      doc[request.key] = rows;
      counts[request.key] = rows.length;
    } catch (error) {
      errors[request.key] = error instanceof Error ? error.message : String(error);
    }
  }
  const pulledAny = Object.keys(counts).length > 0;
  if (!pulledAny) {
    return result(kind, "vendor-error", `${spec.label} pull returned no readable collections. Nothing was written.`, { counts, errors });
  }
  doc.counts = counts;
  if (Object.keys(errors).length) doc.pullErrors = errors;
  const dir = loaded.path ?? spec.inboundDir;
  if (isHostedTenantLayout(dir)) throw new Error(`refusing hosted tenant layout ${dir}`);
  const fullDir = isAbsolute(dir) ? dir : join(args.cwd, dir);
  mkdirSync(fullDir, { recursive: true });
  const file = join(fullDir, `live-pull-${now.toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  const partial = Object.keys(errors).length > 0;
  return result(
    kind,
    partial ? "partial" : "pulled",
    `${spec.label} read-only pull wrote ${file} on this machine (${Object.entries(counts)
      .map(([key, count]) => `${key} ${count}`)
      .join(", ")}). First page only. Admitted as MEDIUM, UNVERIFIED by the desk.`,
    { file, counts, errors }
  );
}
