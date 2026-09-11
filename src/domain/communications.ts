import { entityId } from "../core/ids.js";
import { makeEvent, type CanonicalEvent } from "../core/events.js";

export const CHANNEL_KINDS = [
  "company",
  "branch",
  "department",
  "trade",
  "dispatch",
  "sales",
  "field",
  "warehouse",
  "project",
  "incident"
] as const;

export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export type ChannelState = "active" | "archived";
export type ChannelAction = "create" | "moderate" | "archive" | "post";

export interface ChannelActor {
  actorId: string;
  role: string;
  authorized: boolean;
}

export interface Channel {
  channelId: string;
  kind: ChannelKind;
  title: string;
  state: ChannelState;
  createdBy: string;
  moderators: string[];
  /** Same canonical event stream as booking, dispatch, field, warehouse, and I.T. */
  eventIds: string[];
}

export function mayActOnChannel(
  actor: ChannelActor,
  channel: Channel | null,
  action: ChannelAction
): boolean {
  if (action === "create") {
    return actor.authorized && (actor.role === "manager" || actor.role === "it");
  }
  if (!channel) return false;
  if (action === "archive" || action === "moderate") {
    return channel.moderators.includes(actor.actorId);
  }
  if (action === "post") {
    return channel.state === "active";
  }
  return false;
}

export function createChannel(input: Omit<Channel, "state" | "eventIds"> & {
  state?: ChannelState;
  eventIds?: string[];
}): Channel {
  return { ...input, state: input.state ?? "active", eventIds: input.eventIds ?? [] };
}

export function createManagedChannel(
  input: Omit<Channel, "state" | "eventIds" | "createdBy"> & { state?: ChannelState },
  actor: ChannelActor
): Channel {
  if (!mayActOnChannel(actor, null, "create")) {
    throw new Error("only an authorized manager can create a channel");
  }
  return createChannel({ ...input, createdBy: actor.actorId, moderators: input.moderators });
}

export function archiveChannel(channel: Channel, actorId: string): Channel {
  if (!channel.moderators.includes(actorId)) {
    throw new Error("only a moderator can archive a channel");
  }
  return { ...channel, state: "archived" };
}

export function emitChannelEvent(
  channel: Channel,
  kind: "channel-created" | "channel-archived" | "channel-message" | "warehouse-demand",
  payload: Record<string, unknown>,
  at: string
): CanonicalEvent {
  return makeEvent({
    eventId: entityId("event", `${channel.channelId}:${kind}:${at}`),
    source: "trades-runtime:comms",
    occurredAt: at,
    receivedAt: at,
    kind,
    payload: {
      channelId: channel.channelId,
      channelKind: channel.kind,
      ...payload
    }
  });
}

/** Communications rides the same canonical event stream — not a side chat bus. */
export function attachEvent(channel: Channel, event: CanonicalEvent): Channel {
  if (channel.eventIds.includes(event.eventId)) return channel;
  return { ...channel, eventIds: [...channel.eventIds, event.eventId] };
}

export function bindWarehouseDemand(
  channel: Channel,
  requestIds: string[],
  at: string
): { channel: Channel; event: CanonicalEvent } {
  if (channel.kind !== "warehouse") {
    throw new Error("warehouse demand binds only to a warehouse channel");
  }
  if (channel.state === "archived") {
    throw new Error("cannot post demand to an archived channel");
  }
  const event = emitChannelEvent(channel, "warehouse-demand", { requestIds }, at);
  return { channel: attachEvent(channel, event), event };
}
