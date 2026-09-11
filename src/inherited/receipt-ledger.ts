import { sha256 } from "../core/hash.js";
import type { ConfidenceSeparation } from "../core/confidence.js";

export type ReceiptKind = "recommendation" | "override" | "outcome" | "counterfactual" | "evidence" | "lifecycle";

export interface LedgerReceipt {
  receiptId: string;
  kind: ReceiptKind;
  at: string;
  body: Record<string, unknown>;
  confidence?: ConfidenceSeparation;
  prevHash: string;
  hash: string;
}

export interface ReceiptLedger {
  genesis: string;
  receipts: LedgerReceipt[];
}

export function createLedger(): ReceiptLedger {
  return { genesis: sha256({ product: "trades-runtime", kind: "genesis" }), receipts: [] };
}

export function appendReceipt(
  ledger: ReceiptLedger,
  input: Omit<LedgerReceipt, "prevHash" | "hash">
): ReceiptLedger {
  const prevHash = ledger.receipts.at(-1)?.hash ?? ledger.genesis;
  const hash = sha256({ ...input, prevHash });
  const receipt: LedgerReceipt = { ...input, prevHash, hash };
  return { genesis: ledger.genesis, receipts: [...ledger.receipts, receipt] };
}

export function verifyLedger(ledger: ReceiptLedger): boolean {
  let prev = ledger.genesis;
  for (const receipt of ledger.receipts) {
    if (receipt.prevHash !== prev) return false;
    const expected = sha256({
      receiptId: receipt.receiptId,
      kind: receipt.kind,
      at: receipt.at,
      body: receipt.body,
      confidence: receipt.confidence,
      prevHash: receipt.prevHash
    });
    if (expected !== receipt.hash) return false;
    prev = receipt.hash;
  }
  return true;
}

export function tipHash(ledger: ReceiptLedger): string {
  return ledger.receipts.at(-1)?.hash ?? ledger.genesis;
}
