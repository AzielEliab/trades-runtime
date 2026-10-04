import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../core/hash.js";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";

/**
 * Local desk sign-in. Not a hosted identity provider.
 * The first user is already okayed and needs no approver.
 * Every later user is refused until a higher role on this machine approves them.
 * Roles are field, office, and management. A higher role is the one allowed to approve.
 */

export const DESK_LOGIN_ROLES = ["field", "office", "management"] as const;
export type DeskLoginRole = (typeof DESK_LOGIN_ROLES)[number];

export const LOCAL_SESSION_COOKIE = "trades-local-session";

const RANK: Record<DeskLoginRole, number> = { field: 1, office: 2, management: 3 };

export class LocalLoginRefused extends Error {
  readonly code = "refused-until-approved";
  constructor() {
    super("Refused until a higher role approves this local user.");
  }
}

export interface LocalLoginUser {
  userId: string;
  name: string;
  role: DeskLoginRole;
  approved: boolean;
  approvedByUserId: string | null;
  firstUser: boolean;
  createdAt: string;
}

interface StoredUser extends LocalLoginUser {
  salt: string;
  passwordHash: string;
}

interface StoredSession {
  tokenHash: string;
  userId: string;
  at: string;
}

export interface LocalLoginStore {
  version: 1;
  product: "trades-runtime";
  hostedIdentityProvider: false;
  localOnly: true;
  live_backends: false;
  pilot_started: false;
  field_claim: false;
  servicetitanWrite: false;
  jobberWrite: false;
  probooksWrite: false;
  ordersEnabled: false;
  users: StoredUser[];
  sessions: StoredSession[];
}

export interface LocalLoginView {
  product: "trades-runtime";
  hostedIdentityProvider: false;
  localOnly: true;
  live_backends: false;
  pilot_started: false;
  field_claim: false;
  servicetitanWrite: false;
  ordersEnabled: false;
  path: string;
  note: string;
  signedIn: LocalLoginUser | null;
  users: LocalLoginUser[];
}

export const LOCAL_LOGIN_NOTE =
  "Local sign-in on this machine. Not a hosted identity provider. The first user is already okayed and needs no approver. Every later user is refused until a higher role approves them. Roles are field, office, and management.";

function assertLocalPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized === "data/tenants" || normalized.startsWith("data/tenants/") || normalized.includes("/tenants/")) {
    throw new Error("hosted login layout is refused; local users stay on this machine");
  }
  return filePath;
}

export function defaultLocalLoginPath(instanceId: string, root = "data/runtime"): string {
  return assertLocalPath(join(root, sanitizeInstanceId(instanceId), "local-users.json"));
}

function resolvePath(cwd: string, filePath: string): string {
  if (filePath.startsWith("/")) return assertLocalPath(filePath);
  return assertLocalPath(join(cwd, filePath));
}

function emptyStore(): LocalLoginStore {
  return {
    version: 1,
    product: "trades-runtime",
    hostedIdentityProvider: false,
    localOnly: true,
    live_backends: false,
    pilot_started: false,
    field_claim: false,
    servicetitanWrite: false,
    jobberWrite: false,
    probooksWrite: false,
    ordersEnabled: false,
    users: [],
    sessions: []
  };
}

function isRole(value: string): value is DeskLoginRole {
  return (DESK_LOGIN_ROLES as readonly string[]).includes(value);
}

export function higherRole(actor: DeskLoginRole, target: DeskLoginRole): boolean {
  return RANK[actor] > RANK[target];
}

function cleanName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 80 || /[\\/\0]/.test(name)) throw new Error("local user name is missing or not a local name");
  return name;
}

function cleanPassword(value: string): string {
  if (!value || value.length > 200) throw new Error("local password is missing");
  return value;
}

function hashPassword(password: string, salt: string): Buffer {
  return scryptSync(password, salt, 32);
}

function passwordMatches(password: string, user: StoredUser): boolean {
  const got = hashPassword(password, user.salt);
  const expected = Buffer.from(user.passwordHash, "hex");
  return expected.length === got.length && timingSafeEqual(got, expected);
}

function publicUser(user: StoredUser): LocalLoginUser {
  return {
    userId: user.userId,
    name: user.name,
    role: user.role,
    approved: user.approved,
    approvedByUserId: user.approvedByUserId,
    firstUser: user.firstUser,
    createdAt: user.createdAt
  };
}

function findByName(store: LocalLoginStore, name: string): StoredUser | undefined {
  const key = name.toLowerCase();
  return store.users.find((user) => user.name.toLowerCase() === key);
}

function tokenHash(token: string): string {
  return sha256(token);
}

function userFromToken(store: LocalLoginStore, token: string | null): StoredUser | null {
  if (!token) return null;
  const hash = tokenHash(token);
  const session = store.sessions.find((row) => row.tokenHash === hash);
  if (!session) return null;
  return store.users.find((user) => user.userId === session.userId) ?? null;
}

function addSession(store: LocalLoginStore, userId: string, at: string): { store: LocalLoginStore; sessionToken: string } {
  const sessionToken = randomBytes(32).toString("hex");
  const sessions = [...store.sessions, { tokenHash: tokenHash(sessionToken), userId, at }].slice(-20);
  return { store: { ...emptyStore(), users: store.users, sessions }, sessionToken };
}

export function readLocalLogin(filePath: string): LocalLoginStore {
  assertLocalPath(filePath);
  if (!existsSync(filePath)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as LocalLoginStore;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.users) || !Array.isArray(parsed.sessions)) return emptyStore();
    return { ...emptyStore(), users: parsed.users, sessions: parsed.sessions };
  } catch {
    return emptyStore();
  }
}

export function writeLocalLogin(filePath: string, store: LocalLoginStore): void {
  assertLocalPath(filePath);
  mkdirSync(join(filePath, ".."), { recursive: true });
  const stored: LocalLoginStore = { ...emptyStore(), users: store.users, sessions: store.sessions };
  writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
}

export function presentLocalLogin(store: LocalLoginStore, sessionToken: string | null, path: string): LocalLoginView {
  const signed = userFromToken(store, sessionToken);
  return {
    product: "trades-runtime",
    hostedIdentityProvider: false,
    localOnly: true,
    live_backends: false,
    pilot_started: false,
    field_claim: false,
    servicetitanWrite: false,
    ordersEnabled: false,
    path,
    note: LOCAL_LOGIN_NOTE,
    signedIn: signed && signed.approved ? publicUser(signed) : null,
    users: store.users.map(publicUser)
  };
}

export function loadLocalLogin(args: { cwd: string; instanceId: string; sessionToken: string | null }): LocalLoginView {
  const path = defaultLocalLoginPath(args.instanceId);
  const store = readLocalLogin(resolvePath(args.cwd, path));
  return presentLocalLogin(store, args.sessionToken, path);
}

export function createFirstUser(
  store: LocalLoginStore,
  input: { name: string; password: string; role: string; at: string }
): { store: LocalLoginStore; sessionToken: string; user: LocalLoginUser; note: string } {
  if (store.users.length) throw new Error("The first local user is already on this machine.");
  if (!isRole(input.role)) throw new Error("role must be field, office, or management");
  const name = cleanName(input.name);
  const password = cleanPassword(input.password);
  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    userId: sha256({ name, at: input.at, first: true }).slice(0, 12),
    name,
    role: input.role,
    approved: true,
    approvedByUserId: null,
    firstUser: true,
    createdAt: input.at,
    salt,
    passwordHash: hashPassword(password, salt).toString("hex")
  };
  const next = addSession({ ...emptyStore(), users: [user], sessions: [] }, user.userId, input.at);
  return {
    store: next.store,
    sessionToken: next.sessionToken,
    user: publicUser(user),
    note: "First local user can enter. No approver. This sign-in stays on this machine."
  };
}

export function requestAccess(
  store: LocalLoginStore,
  input: { name: string; password: string; role: string; at: string }
): { store: LocalLoginStore; user: LocalLoginUser; note: string } {
  if (!store.users.length) throw new Error("The first local user enters without an approver. Create that user first.");
  if (!isRole(input.role)) throw new Error("role must be field, office, or management");
  const name = cleanName(input.name);
  if (findByName(store, name)) throw new Error("That local name is already on this machine.");
  const password = cleanPassword(input.password);
  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    userId: sha256({ name, at: input.at, first: false }).slice(0, 12),
    name,
    role: input.role,
    approved: false,
    approvedByUserId: null,
    firstUser: false,
    createdAt: input.at,
    salt,
    passwordHash: hashPassword(password, salt).toString("hex")
  };
  return {
    store: { ...emptyStore(), users: [...store.users, user], sessions: store.sessions },
    user: publicUser(user),
    note: "Request recorded on this machine. Sign-in is refused until a higher role approves this local user."
  };
}

export function signIn(
  store: LocalLoginStore,
  input: { name: string; password: string; at: string }
): { store: LocalLoginStore; sessionToken: string; user: LocalLoginUser; note: string } {
  const name = cleanName(input.name);
  const password = cleanPassword(input.password);
  const found = findByName(store, name);
  if (!found || !passwordMatches(password, found)) throw new Error("Unknown local user or password.");
  if (!found.approved) throw new LocalLoginRefused();
  const next = addSession(store, found.userId, input.at);
  return {
    store: next.store,
    sessionToken: next.sessionToken,
    user: publicUser(found),
    note: "Local sign-in accepted on this machine."
  };
}

export function approveUser(
  store: LocalLoginStore,
  input: { sessionToken: string | null; userId: string; at: string }
): { store: LocalLoginStore; user: LocalLoginUser; note: string } {
  const actor = userFromToken(store, input.sessionToken);
  if (!actor || !actor.approved) throw new Error("Sign in on this machine before approving a local user.");
  const target = store.users.find((user) => user.userId === input.userId);
  if (!target) throw new Error("That local user is not on this machine.");
  if (target.userId === actor.userId) throw new Error("A local user cannot approve themself.");
  if (target.approved) {
    return { store, user: publicUser(target), note: "This local user is already approved." };
  }
  if (!higherRole(actor.role, target.role)) throw new Error("A higher role is required to approve this local user.");
  const users = store.users.map((user) =>
    user.userId === target.userId ? { ...user, approved: true, approvedByUserId: actor.userId } : user
  );
  const approved = users.find((user) => user.userId === target.userId);
  if (!approved) throw new Error("That local user is not on this machine.");
  return {
    store: { ...emptyStore(), users, sessions: store.sessions },
    user: publicUser(approved),
    note: `Approved on this machine by ${actor.role}. No hosted identity provider. No provider write.`
  };
}

export function signOut(store: LocalLoginStore, sessionToken: string | null): LocalLoginStore {
  if (!sessionToken) return store;
  const hash = tokenHash(sessionToken);
  return { ...emptyStore(), users: store.users, sessions: store.sessions.filter((row) => row.tokenHash !== hash) };
}

export function readLocalSessionCookie(req: { headers: { cookie?: string | string[] } } | undefined): string | null {
  if (!req) return null;
  const raw = req.headers.cookie;
  const header = Array.isArray(raw) ? raw.join(";") : (raw ?? "");
  const prefix = `${LOCAL_SESSION_COOKIE}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    try {
      const value = decodeURIComponent(trimmed.slice(prefix.length));
      if (value && value.length < 200) return value;
    } catch {
      return null;
    }
  }
  return null;
}

export function localSessionSetCookie(token: string): string {
  return `${LOCAL_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/`;
}

export function localSessionClearCookie(): string {
  return `${LOCAL_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
