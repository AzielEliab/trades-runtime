/**
 * @deprecated TR-AUDIT-2026-09-17 F10.
 * Canonical path: `src/domain/communications.ts`.
 * Recognition: `src/domain/recognition.ts`. Mission board: `src/domain/mission-board.ts`.
 * Do not add new imports here.
 */
export const DEPRECATED_COMMS_BARREL =
  "use src/domain/communications.ts (recognition.ts / mission-board.ts)" as const;

export {
  CHANNEL_KINDS,
  archiveChannel,
  attachEvent,
  bindWarehouseDemand,
  createChannel,
  createManagedChannel,
  emitChannelEvent,
  mayActOnChannel,
  type Channel,
  type ChannelAction,
  type ChannelActor,
  type ChannelKind,
  type ChannelState
} from "./communications.js";
