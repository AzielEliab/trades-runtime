export const ENTITY_KINDS = [
  "branch",
  "customer",
  "property",
  "equipment",
  "call",
  "van",
  "job",
  "part",
  "event",
  "receipt",
  "handoff",
  "technician-era"
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export function entityId(kind: EntityKind, local: string): string {
  if (!local.trim()) {
    throw new Error("entity local id is required");
  }
  return `tr:${kind}:${local.trim()}`;
}

export function parseEntityId(id: string): { kind: EntityKind; local: string } {
  const match = /^tr:([a-z-]+):(.+)$/.exec(id);
  if (!match) {
    throw new Error(`invalid entity id: ${id}`);
  }
  const kind = match[1] as EntityKind;
  if (!ENTITY_KINDS.includes(kind)) {
    throw new Error(`unknown entity kind: ${kind}`);
  }
  return { kind, local: match[2] };
}
