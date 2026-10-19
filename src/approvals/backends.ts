import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";
import { PLATFORM_KINDS } from "../spine/platforms/catalog.js";

/**
 * Operator-configured write-back backends.
 *
 * The committed repo ships no backend and no credential. A backend exists only
 * when the operator writes data/runtime/<instanceId>/write-backends.json on
 * their own machine AND the named environment variables hold credentials.
 * Credentials are read from the environment at call time and are never logged
 * or written to disk by this module.
 *
 * Without both, a write-back returns `no-backend-configured`. It never fakes success.
 */

export const WRITE_BACKEND_KINDS = ["servicetitan", "probooks", "tradesapp", ...PLATFORM_KINDS] as const;
export type WriteBackendKind = (typeof WRITE_BACKEND_KINDS)[number];

export const WRITE_BACK_METHODS = ["POST", "PUT", "PATCH"] as const;
export type WriteBackMethod = (typeof WRITE_BACK_METHODS)[number];

export interface WriteBackendConfig {
  /** https origin of the vendor API (http allowed only for loopback test doubles). */
  baseUrl: string;
  /** Name of the env var holding a bearer token. The value never goes in this file. */
  tokenEnv: string;
  /** Optional env var holding an app key header value (ServiceTitan: ST-App-Key). */
  appKeyEnv?: string;
  /** Header name for appKeyEnv. Defaults to ST-App-Key for servicetitan, X-App-Key otherwise. */
  appKeyHeader?: string;
  /** Authorization scheme. Bearer by default; Housecall Pro documents "Token". */
  authScheme?: "Bearer" | "Token";
  /** Static, non-secret headers the vendor requires (X-JOBBER-GRAPHQL-VERSION, Square-Version). */
  headers?: Record<string, string>;
}

export type WriteBackendsFile = Partial<Record<WriteBackendKind, WriteBackendConfig>>;

export interface WriteBackRequest {
  method: WriteBackMethod;
  /** Path under baseUrl, for example /jpm/v2/tenant/123/jobs/456. */
  path: string;
  body?: unknown;
}

export interface WriteBackResult {
  ok: boolean;
  outcome: "written" | "vendor-error" | "no-backend-configured" | "network-error";
  backend: WriteBackendKind;
  status?: number;
  detail: string;
  /** Short vendor response excerpt. Never includes request credentials. */
  response?: string;
}

export function defaultWriteBackendsPath(instanceId: string, root = "data/runtime"): string {
  return join(root, sanitizeInstanceId(instanceId), "write-backends.json");
}

const SECRET_KEYS = ["token", "secret", "password", "apiKey", "api_key", "clientSecret", "client_secret", "appKey"];

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

export function parseWriteBackends(raw: unknown): WriteBackendsFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("write-backends.json must be an object");
  const out: WriteBackendsFile = {};
  for (const [kind, value] of Object.entries(raw as Record<string, unknown>)) {
    if (kind === "note") continue;
    if (!(WRITE_BACKEND_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`unknown write backend: ${kind}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${kind} backend must be an object`);
    const record = value as Record<string, unknown>;
    for (const key of SECRET_KEYS) {
      if (key in record) {
        throw new Error(`${kind} backend refuses inline ${key}; put credentials in an environment variable and name it with tokenEnv`);
      }
    }
    const baseUrl = typeof record.baseUrl === "string" ? record.baseUrl.trim() : "";
    const tokenEnv = typeof record.tokenEnv === "string" ? record.tokenEnv.trim() : "";
    if (!baseUrl || !tokenEnv) throw new Error(`${kind} backend needs baseUrl and tokenEnv`);
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
      throw new Error(`${kind} backend baseUrl must be https (http only for loopback)`);
    }
    const authScheme = record.authScheme == null ? undefined : String(record.authScheme);
    if (authScheme !== undefined && authScheme !== "Bearer" && authScheme !== "Token") {
      throw new Error(`${kind} backend authScheme must be Bearer or Token`);
    }
    let headers: Record<string, string> | undefined;
    if (record.headers != null) {
      if (typeof record.headers !== "object" || Array.isArray(record.headers)) throw new Error(`${kind} backend headers must be an object`);
      headers = {};
      for (const [name, value] of Object.entries(record.headers as Record<string, unknown>)) {
        if (/^(authorization|cookie|.*token.*|.*secret.*|.*key.*)$/i.test(name)) {
          throw new Error(`${kind} backend refuses credential header ${name}; use tokenEnv / appKeyEnv`);
        }
        if (typeof value !== "string" || !value.trim()) throw new Error(`${kind} backend header ${name} must be a non-empty string`);
        headers[name] = value.trim();
      }
    }
    out[kind as WriteBackendKind] = {
      baseUrl: url.origin + url.pathname.replace(/\/$/, ""),
      tokenEnv,
      appKeyEnv: typeof record.appKeyEnv === "string" && record.appKeyEnv.trim() ? record.appKeyEnv.trim() : undefined,
      appKeyHeader:
        typeof record.appKeyHeader === "string" && record.appKeyHeader.trim() ? record.appKeyHeader.trim() : undefined,
      ...(authScheme ? { authScheme: authScheme as "Bearer" | "Token" } : {}),
      ...(headers ? { headers } : {})
    };
  }
  return out;
}

export function loadWriteBackends(cwd: string, instanceId: string): { backends: WriteBackendsFile; error?: string } {
  const path = defaultWriteBackendsPath(instanceId);
  const full = isAbsolute(path) ? path : join(cwd, path);
  if (!existsSync(full)) return { backends: {} };
  try {
    return { backends: parseWriteBackends(JSON.parse(readFileSync(full, "utf8"))) };
  } catch (error) {
    return { backends: {}, error: error instanceof Error ? error.message : String(error) };
  }
}

export function parseWriteBackRequest(raw: unknown): WriteBackRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("write-back needs { method, path, body }");
  const record = raw as Record<string, unknown>;
  const method = typeof record.method === "string" ? record.method.toUpperCase() : "";
  if (!(WRITE_BACK_METHODS as readonly string[]).includes(method)) {
    throw new Error(`write-back method must be one of ${WRITE_BACK_METHODS.join(", ")}`);
  }
  const path = typeof record.path === "string" ? record.path.trim() : "";
  if (!path.startsWith("/") || path.startsWith("//") || /\s/.test(path) || path.includes("..")) {
    throw new Error("write-back path must be a plain absolute path such as /jpm/v2/tenant/1/jobs/2");
  }
  return { method: method as WriteBackMethod, path, body: record.body };
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  status: number;
  ok: boolean;
  text(): Promise<string>;
}>;

export async function runWriteBack(args: {
  kind: WriteBackendKind;
  request: WriteBackRequest;
  cwd: string;
  instanceId: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}): Promise<WriteBackResult> {
  const env = args.env ?? process.env;
  const { backends, error } = loadWriteBackends(args.cwd, args.instanceId);
  const config = backends[args.kind];
  if (!config) {
    return {
      ok: false,
      outcome: "no-backend-configured",
      backend: args.kind,
      detail: error
        ? `no ${args.kind} backend configured: ${defaultWriteBackendsPath(args.instanceId)} was not applied (${error}). Nothing was written.`
        : `no ${args.kind} backend configured on this machine (${defaultWriteBackendsPath(args.instanceId)}). Nothing was written.`
    };
  }
  const token = env[config.tokenEnv];
  if (!token) {
    return {
      ok: false,
      outcome: "no-backend-configured",
      backend: args.kind,
      detail: `no ${args.kind} credential: environment variable ${config.tokenEnv} is empty on this machine. Nothing was written.`
    };
  }
  const headers: Record<string, string> = {
    ...(config.headers ?? {}),
    Authorization: `${config.authScheme ?? "Bearer"} ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (config.appKeyEnv) {
    const appKey = env[config.appKeyEnv];
    if (!appKey) {
      return {
        ok: false,
        outcome: "no-backend-configured",
        backend: args.kind,
        detail: `no ${args.kind} app key: environment variable ${config.appKeyEnv} is empty on this machine. Nothing was written.`
      };
    }
    headers[config.appKeyHeader ?? (args.kind === "servicetitan" ? "ST-App-Key" : "X-App-Key")] = appKey;
  }
  const fetchImpl: FetchLike = args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const url = `${config.baseUrl}${args.request.path}`;
  try {
    const res = await fetchImpl(url, {
      method: args.request.method,
      headers,
      body: args.request.body === undefined ? undefined : JSON.stringify(args.request.body)
    });
    const text = (await res.text().catch(() => "")).slice(0, 500);
    return {
      ok: res.ok,
      outcome: res.ok ? "written" : "vendor-error",
      backend: args.kind,
      status: res.status,
      detail: res.ok
        ? `${args.kind} accepted ${args.request.method} ${args.request.path} (HTTP ${res.status}).`
        : `${args.kind} refused ${args.request.method} ${args.request.path} (HTTP ${res.status}). Treat as not written.`,
      response: text
    };
  } catch (err) {
    return {
      ok: false,
      outcome: "network-error",
      backend: args.kind,
      detail: `${args.kind} call failed before a response: ${err instanceof Error ? err.message : String(err)}. Treat as not written.`
    };
  }
}
