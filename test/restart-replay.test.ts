import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DurableReceiptStore, DEFAULT_RECEIPT_PATH } from "../src/spine/durable-receipts.js";
import { replayProof, writeProof } from "../scripts/restart-replay.js";
import { verifyLedger } from "../src/inherited/receipt-ledger.js";

function tempReceiptPath(): { dir: string; filePath: string } {
  const dir = mkdtempSync(join(tmpdir(), "tr-replay-"));
  return { dir, filePath: join(dir, "receipts.jsonl") };
}

describe("restart-replay durable receipts", () => {
  it("uses the documented JSONL path pattern", () => {
    expect(DEFAULT_RECEIPT_PATH).toBe("data/receipts.jsonl");
    expect(DEFAULT_RECEIPT_PATH).toMatch(/receipts\.jsonl$/);
  });

  it("keeps Chain C hashes after close() and reopen from the same path", () => {
    const { dir, filePath } = tempReceiptPath();
    try {
      const written = writeProof(filePath);
      expect(written.hashes).toHaveLength(3);
      expect(written.overrideHash).toHaveLength(64);

      const dead = new DurableReceiptStore(filePath);
      dead.close();
      expect(dead.isClosed).toBe(true);
      expect(() => dead.load()).toThrow(/closed/);
      expect(() => dead.append({ receiptId: "x", kind: "outcome", at: "t", body: {} })).toThrow(
        /closed/
      );

      const replayed = replayProof(filePath, written);
      expect(replayed.receiptIds).toEqual(written.receiptIds);
      expect(replayed.hashes).toEqual(written.hashes);
      expect(replayed.tip).toBe(written.tip);
      expect(replayed.overrideHash).toBe(written.overrideHash);

      const reopened = new DurableReceiptStore(filePath);
      const ledger = reopened.load();
      expect(ledger.receipts.length).toBeGreaterThan(0);
      expect(verifyLedger(ledger)).toBe(true);
      expect(ledger.receipts.some((receipt) => receipt.kind === "override")).toBe(true);
      expect(readFileSync(filePath, "utf8")).toMatch(/"type":"receipt"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails if receipts vanish from disk before reopen", () => {
    const { dir, filePath } = tempReceiptPath();
    try {
      const written = writeProof(filePath);
      unlinkSync(filePath);
      expect(() => replayProof(filePath, written)).toThrow(/receipts vanished after restart/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails if the JSONL is replaced with genesis-only after process exit", () => {
    const { dir, filePath } = tempReceiptPath();
    try {
      const written = writeProof(filePath);
      writeFileSync(filePath, `${JSON.stringify({ type: "genesis", genesis: written.genesis })}\n`);
      expect(() => replayProof(filePath, written)).toThrow(/receipts vanished after restart/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("survives a real child-process exit and a second process reload", () => {
    const { dir, filePath } = tempReceiptPath();
    try {
      const writer = spawnSync("npx", ["tsx", "scripts/restart-replay.ts", "write", filePath], {
        encoding: "utf8",
        cwd: process.cwd()
      });
      expect(writer.status, writer.stderr).toBe(0);
      const written = JSON.parse(writer.stdout) as {
        hashes: string[];
        tip: string;
        overrideHash: string;
        genesis: string;
        receiptIds: string[];
      };
      expect(written.hashes).toHaveLength(3);

      const replay = spawnSync("npx", ["tsx", "scripts/restart-replay.ts", "replay", filePath], {
        encoding: "utf8",
        cwd: process.cwd(),
        env: { ...process.env, RESTART_REPLAY_EXPECTED: JSON.stringify(written) }
      });
      expect(replay.status, replay.stderr).toBe(0);
      const replayed = JSON.parse(replay.stdout) as typeof written;
      expect(replayed.hashes).toEqual(written.hashes);
      expect(replayed.tip).toBe(written.tip);
      expect(replayed.overrideHash).toBe(written.overrideHash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
