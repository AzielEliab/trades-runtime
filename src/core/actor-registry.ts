export const AUTHORITY_ROLES = [
  "operator",
  "manager",
  "dispatcher",
  "warehouse",
  "technician",
  "comfort-advisor",
  "it"
] as const;

export type AuthorityRole = (typeof AUTHORITY_ROLES)[number];

export const AUTHORITY_ACTIONS = ["ACCEPT", "OVERRIDE", "LOCK", "RELEASE"] as const;
export type AuthorityAction = (typeof AUTHORITY_ACTIONS)[number];

const ROLE_ACTIONS: Record<AuthorityRole, readonly AuthorityAction[]> = {
  operator: AUTHORITY_ACTIONS,
  manager: AUTHORITY_ACTIONS,
  dispatcher: ["OVERRIDE"],
  warehouse: ["ACCEPT", "OVERRIDE"],
  technician: [],
  "comfort-advisor": ["OVERRIDE"],
  it: ["RELEASE"]
};

export interface ActorRecord {
  actorId: string;
  displayName: string;
  role: AuthorityRole;
  branchIds: readonly string[];
  companyWide?: boolean;
}

export interface ActorRegistry {
  actors: Readonly<Record<string, ActorRecord>>;
}

export interface AuthorityGrant {
  actorId: string;
  role: AuthorityRole;
  branchId: string;
  lockHolderId: string;
  action: AuthorityAction;
  at: string;
}

export function createActorRegistry(actors: ActorRecord[]): ActorRegistry {
  const map: Record<string, ActorRecord> = {};
  for (const actor of actors) {
    if (!actor.actorId.trim()) throw new Error("actorId is required");
    map[actor.actorId] = actor;
  }
  return { actors: map };
}

export function registerActor(registry: ActorRegistry, actor: ActorRecord): ActorRegistry {
  return createActorRegistry([...Object.values(registry.actors), actor]);
}

export function normalizeAuthorityRole(role: string): AuthorityRole {
  if (role === "dispatch") return "dispatcher";
  if ((AUTHORITY_ROLES as readonly string[]).includes(role)) return role as AuthorityRole;
  throw new Error(`unknown authority role: ${role}`);
}

export function actorCoversBranch(actor: ActorRecord, branchId: string): boolean {
  return Boolean(actor.companyWide || actor.branchIds.includes(branchId));
}

export function roleMay(role: AuthorityRole, action: AuthorityAction): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

/**
 * Named role + branch scope + lock-holder id.
 * A bare `authorized: boolean` is not a grant.
 */
export function grantAuthority(
  registry: ActorRegistry,
  input: {
    actorId: string;
    action: AuthorityAction;
    branchId: string;
    lockHolderId: string;
    at: string;
  }
): AuthorityGrant {
  if (!input.branchId?.trim()) {
    throw new Error("authority grant requires branch scope");
  }
  if (!input.lockHolderId?.trim()) {
    throw new Error("ACCEPT / OVERRIDE / LOCK requires a lock-holder id");
  }
  const actor = registry.actors[input.actorId];
  if (!actor) {
    throw new Error(`unauthorized: actor ${input.actorId} is not in the registry`);
  }
  if (!actorCoversBranch(actor, input.branchId)) {
    throw new Error(`unauthorized: actor ${input.actorId} has no grant on ${input.branchId}`);
  }
  if (!roleMay(actor.role, input.action)) {
    throw new Error(`unauthorized: role ${actor.role} cannot ${input.action}`);
  }
  if (input.action === "RELEASE" && input.lockHolderId !== actor.actorId && actor.role !== "operator" && actor.role !== "manager") {
    throw new Error("unauthorized: only the lock-holder or a manager can RELEASE");
  }
  return {
    actorId: actor.actorId,
    role: actor.role,
    branchId: input.branchId,
    lockHolderId: input.lockHolderId,
    action: input.action,
    at: input.at
  };
}

/** Synthetic registry for demo / tests. Not a live company roster. */
export function exampleActorRegistry(): ActorRegistry {
  return createActorRegistry([
    {
      actorId: "mgr-1",
      displayName: "Manager One",
      role: "manager",
      branchIds: ["branch:midwest-3", "tr:branch:midwest-3", "b3"]
    },
    {
      actorId: "dispatcher-lee",
      displayName: "Lee",
      role: "dispatcher",
      branchIds: ["branch:midwest-3", "tr:branch:midwest-3"]
    },
    {
      actorId: "lee",
      displayName: "Lee",
      role: "dispatcher",
      branchIds: ["branch:midwest-3", "tr:branch:midwest-3"]
    },
    {
      actorId: "wh-1",
      displayName: "Warehouse",
      role: "warehouse",
      branchIds: ["branch:midwest-3", "tr:branch:midwest-3"]
    },
    {
      actorId: "operator-1",
      displayName: "Operator",
      role: "operator",
      companyWide: true,
      branchIds: []
    }
  ]);
}
