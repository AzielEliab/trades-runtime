#!/usr/bin/env npx tsx
/**
 * Operator-disk restart-replay for durable JSONL receipts.
 * write  — append Chain C receipts and exit (process death)
 * replay — open a new process on the same path; fail if receipts vanished
 */
import { existsSync, readFileSync } from "node:fs";
import { DurableReceiptStore } from "../src/spine/durable-receipts.js";
import { tipHash, verifyLedger } from "../src/inherited/receipt-ledger.js";

export const RECEIPT_PATH_PATTERN = "data/receipts.jsonl or {tmpdir}/tr-replay-*/receipts.jsonl";

export interface ReplayProof {
  filePath: string;
  genesis: string;
  receiptIds: string[];
  hashes: string[];
  tip: string;
  overrideHash: string;
}

function writeProof(filePath: string): ReplayProof {
  const store = new DurableReceiptStore(filePath);
  const recommendation = store.append({
    receiptId: "restart-replay:recommendation",
    kind: "recommendation",
    at: "2026-09-17T20:26:00Z",
    body: { chain: "C", action: "dispatch", vanId: "214" }
  });
  const override = store.append({
    receiptId: "restart-replay:override",
    kind: "override",
    at: "2026-09-17T20:27:00Z",
    body: {
      chain: "C",
      actorId: "mgr-1",
      role: "manager",
      reason: "customer request",
      originalAction: "dispatch-214",
      replacementAction: "dispatch-088"
    }
  });
  const outcome = store.append({
    receiptId: "restart-replay:outcome",
    kind: "outcome",
    at: "2026-09-17T20:28:00Z",
    body: { chain: "C", vanId: "088", freeze: true }
  });
  const ledger = store.load();
  const proof: ReplayProof = {
    filePath,
    genesis: ledger.genesis,
    receiptIds: ledger.receipts.map((receipt) => receipt.receiptId),
    hashes: [recommendation.hash, override.hash, outcome.hash],
    tip: store.tip(),
    overrideHash: override.hash
  };
  store.close();
  return proof;
}

function replayProof(filePath: string, expected?: ReplayProof): ReplayProof {
  if (!existsSync(filePath)) {
    throw new Error("receipts vanished after restart: file missing");
  }
  const text = readFileSync(filePath, "utf8").trim();
  if (!text) {
    throw new Error("receipts vanished after restart: empty file");
  }

  const store = new DurableReceiptStore(filePath);
  const ledger = store.load();
  if (ledger.receipts.length === 0) {
    throw new Error("receipts vanished after restart: ledger has no receipts");
  }
  if (!verifyLedger(ledger)) {
    throw new Error("restart-replay: hash-chain verification failed");
  }
  const override = ledger.receipts.find((receipt) => receipt.kind === "override");
  if (!override) {
    throw new Error("restart-replay: Chain C override receipt missing");
  }

  const proof: ReplayProof = {
    filePath,
    genesis: ledger.genesis,
    receiptIds: ledger.receipts.map((receipt) => receipt.receiptId),
    hashes: ledger.receipts.map((receipt) => receipt.hash),
    tip: tipHash(ledger),
    overrideHash: override.hash
  };

  if (expected) {
    if (proof.genesis !== expected.genesis) {
      throw new Error("restart-replay: genesis hash changed after restart");
    }
    if (proof.receiptIds.join(",") !== expected.receiptIds.join(",")) {
      throw new Error("receipts vanished after restart: receipt ids do not match");
    }
    if (proof.hashes.join(",") !== expected.hashes.join(",")) {
      throw new Error("restart-replay: receipt hashes do not match after restart");
    }
    if (proof.tip !== expected.tip) {
      throw new Error("restart-replay: tip hash lost continuity");
    }
    if (proof.overrideHash !== expected.overrideHash) {
      throw new Error("restart-replay: Chain C override hash lost continuity");
    }
  }

  store.close();
  return proof;
}

function main(argv: string[]): void {
  const mode = argv[2];
  const filePath = argv[3];
  if ((mode !== "write" && mode !== "replay") || !filePath) {
    process.stderr.write("usage: npx tsx scripts/restart-replay.ts write|replay <jsonl-path>\n");
    process.exit(2);
  }
  const expectedRaw = process.env.RESTART_REPLAY_EXPECTED;
  const expected = expectedRaw ? (JSON.parse(expectedRaw) as ReplayProof) : undefined;
  const proof = mode === "write" ? writeProof(filePath) : replayProof(filePath, expected);
  process.stdout.write(`${JSON.stringify(proof)}\n`);
}

const invoked = process.argv[1]?.endsWith("restart-replay.ts") ?? false;
if (invoked) {
  try {
    main(process.argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

export { writeProof, replayProof };
