import { mkdirSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  appendReceipt,
  createLedger,
  verifyLedger,
  tipHash,
  type LedgerReceipt,
  type ReceiptKind,
  type ReceiptLedger
} from "../inherited/receipt-ledger.js";
import type { EvidencePacket } from "../inherited/evidence-packet.js";
import type { HumanOverride, Recommendation } from "../core/human-authority.js";

export const DEFAULT_RECEIPT_PATH = "data/receipts.jsonl";

export interface PointInTimeFreeze {
  at: string;
  recommendation?: Recommendation;
  evidence?: EvidencePacket[];
  override?: HumanOverride;
  outcome?: Record<string, unknown>;
}

interface GenesisLine {
  type: "genesis";
  genesis: string;
}

interface ReceiptLine {
  type: "receipt";
  receipt: LedgerReceipt;
}

type StoreLine = GenesisLine | ReceiptLine;

function parseLine(line: string): StoreLine {
  const parsed = JSON.parse(line) as StoreLine;
  if (parsed.type !== "genesis" && parsed.type !== "receipt") {
    throw new Error("durable receipt store: unknown line type");
  }
  return parsed;
}

function writeLine(filePath: string, value: StoreLine): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

/**
 * Append-only JSONL persistence for ReceiptLedger.
 * Process exit must not erase Chain C: reload reconstructs and verifies the hash chain.
 */
export class DurableReceiptStore {
  readonly filePath: string;
  private closed = false;

  constructor(filePath = DEFAULT_RECEIPT_PATH) {
    this.filePath = filePath;
  }

  /** Drop this process handle. A new store must reopen the same path to continue. */
  close(): void {
    this.closed = true;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("durable receipt store: closed (process exit simulated)");
    }
  }

  load(): ReceiptLedger {
    this.assertOpen();
    if (!existsSync(this.filePath)) {
      const ledger = createLedger();
      writeLine(this.filePath, { type: "genesis", genesis: ledger.genesis });
      return ledger;
    }

    const text = readFileSync(this.filePath, "utf8");
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      const ledger = createLedger();
      writeLine(this.filePath, { type: "genesis", genesis: ledger.genesis });
      return ledger;
    }

    const first = parseLine(lines[0]!);
    if (first.type !== "genesis") {
      throw new Error("durable receipt store: first line must be genesis");
    }

    const receipts: LedgerReceipt[] = [];
    for (const line of lines.slice(1)) {
      const parsed = parseLine(line);
      if (parsed.type === "receipt") receipts.push(parsed.receipt);
    }

    const ledger: ReceiptLedger = { genesis: first.genesis, receipts };
    if (!verifyLedger(ledger)) {
      throw new Error("durable receipt store: hash-chain verification failed");
    }
    return ledger;
  }

  append(input: Omit<LedgerReceipt, "prevHash" | "hash">): LedgerReceipt {
    const ledger = this.load();
    const next = appendReceipt(ledger, input);
    const receipt = next.receipts.at(-1);
    if (!receipt) throw new Error("durable receipt store: append produced no receipt");
    writeLine(this.filePath, { type: "receipt", receipt });
    return receipt;
  }

  /** Point-in-time freeze of recommendation / evidence / override / outcome. */
  freeze(snapshot: PointInTimeFreeze, receiptId: string): LedgerReceipt {
    return this.append({
      receiptId,
      kind: "lifecycle",
      at: snapshot.at,
      body: {
        freeze: true,
        recommendation: snapshot.recommendation ?? null,
        evidence: snapshot.evidence ?? null,
        override: snapshot.override ?? null,
        outcome: snapshot.outcome ?? null
      }
    });
  }

  appendKind(
    kind: ReceiptKind,
    receiptId: string,
    at: string,
    body: Record<string, unknown>
  ): LedgerReceipt {
    return this.append({ receiptId, kind, at, body });
  }

  tip(): string {
    return tipHash(this.load());
  }

  verify(): boolean {
    return verifyLedger(this.load());
  }
}

export function openDurableReceipts(filePath = DEFAULT_RECEIPT_PATH): DurableReceiptStore {
  return new DurableReceiptStore(filePath);
}
