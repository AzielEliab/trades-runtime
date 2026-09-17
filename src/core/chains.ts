export type ChainId = "A" | "B" | "C" | "D";

export interface ChainRecordBase {
  chain: ChainId;
  recordId: string;
  at: string;
  prevRecordId?: string;
}

export interface FullDayTrajectoryRecord extends ChainRecordBase {
  chain: "A";
  kind: "morning-plan" | "state-change" | "rebase" | "displacement" | "close";
  plannedState: Record<string, unknown>;
  actualState?: Record<string, unknown>;
  note?: string;
}

export interface CallLedgerRecord extends ChainRecordBase {
  chain: "B";
  callId: string;
  kind: "assignment" | "travel" | "arrival" | "media" | "diagnosis" | "parts" | "quote" | "repair" | "outcome";
  body: Record<string, unknown>;
}

export interface OverrideRecord extends ChainRecordBase {
  chain: "C";
  recommendationId: string;
  actorId: string;
  role: string;
  reason: string;
  originalAction: string;
  replacementAction: string;
  downstream?: Record<string, unknown>;
}

export interface CoordinationRecord extends ChainRecordBase {
  chain: "D";
  fromRole: string;
  toRole: string;
  expectedAction: string;
  actualAction?: string;
  acknowledged: boolean;
  failureType?: string;
  knowledgeAtOrigin: Record<string, unknown>;
  knowledgeAtRecipient?: Record<string, unknown>;
}

export type ChainRecord =
  | FullDayTrajectoryRecord
  | CallLedgerRecord
  | OverrideRecord
  | CoordinationRecord;

export interface AppendOnlyChain<T extends ChainRecord> {
  chain: T["chain"];
  records: T[];
}

export function emptyChain<T extends ChainRecord>(chain: T["chain"]): AppendOnlyChain<T> {
  return { chain, records: [] };
}

export function appendRecord<T extends ChainRecord>(chain: AppendOnlyChain<T>, record: T): AppendOnlyChain<T> {
  if (record.chain !== chain.chain) {
    throw new Error(`cannot append chain ${record.chain} onto ${chain.chain}`);
  }
  const last = chain.records.at(-1);
  if (last && record.prevRecordId && record.prevRecordId !== last.recordId) {
    throw new Error("chain append must reference the current tip");
  }
  if (last && !record.prevRecordId) {
    record = { ...record, prevRecordId: last.recordId };
  }
  return { chain: chain.chain, records: [...chain.records, record] };
}

export function overwriteForbidden(previous: ChainRecord, next: ChainRecord): never | void {
  if (previous.recordId === next.recordId) {
    throw new Error("never overwrite history: mutate by append only");
  }
}
