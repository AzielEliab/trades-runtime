import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runByoAdmitDemo } from "../src/demo/byo-admit.js";
import { wrapperIsVerification } from "../src/spine/fraggate-inbound.js";
import { verifyLedger } from "../src/inherited/receipt-ledger.js";
import { DurableReceiptStore } from "../src/spine/durable-receipts.js";

describe("TR-AUDIT G3 synthetic BYO admit demo", () => {
  it("admits fixture ST + ProBooks into a temp isolate and proves wrapper ≠ VERIFIED", () => {
    const workRoot = mkdtempSync(join(tmpdir(), "tr-byo-admit-test-"));
    try {
      const proof = runByoAdmitDemo({ workRoot, instanceId: "byo-admit-demo" });

      expect(proof.synthetic).toBe(true);
      expect(proof.customerData).toBe(false);
      expect(proof.authoringNodeIsCustodian).toBe(false);
      expect(proof.instanceId).toBe("byo-admit-demo");
      expect(proof.inbound.servicetitan).toBe(join(workRoot, "data", "inbound", "servicetitan"));
      expect(proof.inbound.probooks).toBe(join(workRoot, "data", "inbound", "probooks"));
      expect(existsSync(join(proof.inbound.servicetitan, "export.json"))).toBe(true);
      expect(existsSync(join(proof.inbound.probooks, "export.json"))).toBe(true);
      expect(JSON.parse(readFileSync(join(proof.inbound.servicetitan, "export.json"), "utf8")).synthetic).toBe(
        true
      );

      expect(proof.isolate.root).toBe(join(workRoot, "data", "runtime", "byo-admit-demo"));
      expect(existsSync(proof.isolate.receiptPath)).toBe(true);
      expect(existsSync(proof.isolate.ledgerPath)).toBe(true);

      expect(proof.hashes.length).toBeGreaterThanOrEqual(8);
      expect(proof.hashes.some((row) => row.sourceKind === "servicetitan")).toBe(true);
      expect(proof.hashes.some((row) => row.sourceKind === "probooks")).toBe(true);
      for (const row of proof.hashes) {
        expect(row.packetHash).toHaveLength(64);
        expect(row.shadowHash).toHaveLength(64);
        expect(row.verificationStatus).toBe("UNVERIFIED");
        expect(row.wrapperIsVerification).toBe(false);
        expect(row.live).toBe(false);
        expect(row.write).toBe(false);
      }

      expect(proof.wrapperIsVerification).toBe(false);
      expect(proof.verificationStatus).toBe("UNVERIFIED");
      expect(wrapperIsVerification()).toBe(false);
      expect(proof.writesThrew).toBe(true);
      expect(proof.mayWriteServiceTitan).toBe(false);
      expect(proof.mayWriteProBooks).toBe(false);
      expect(proof.writeRefusals.some((line) => /ServiceTitan/.test(line))).toBe(true);
      expect(proof.writeRefusals.some((line) => /ProBooks/.test(line))).toBe(true);
      expect(proof.writeRefusals.some((line) => /POST/.test(line))).toBe(true);
      expect(proof.writeRefusals.some((line) => /PATCH/.test(line))).toBe(true);

      expect(proof.receiptHashes).toHaveLength(proof.hashes.length + 1);
      expect(proof.tip).toHaveLength(64);
      expect(proof.tip).toBe(proof.receiptHashes.at(-1));

      const store = new DurableReceiptStore(proof.isolate.receiptPath);
      const ledger = store.load();
      expect(verifyLedger(ledger)).toBe(true);
      expect(ledger.receipts.some((receipt) => receipt.kind === "evidence")).toBe(true);
      expect(readFileSync(proof.isolate.receiptPath, "utf8")).toMatch(/"wrapperIsVerification":false/);
    } finally {
      rmSync(workRoot, { recursive: true, force: true });
    }
  });
});
