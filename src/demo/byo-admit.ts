import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitInboundOrThrow, wrapperIsVerification } from "../spine/fraggate-inbound.js";
import type { EvidencePacket } from "../inherited/evidence-packet.js";
import { DurableReceiptStore } from "../spine/durable-receipts.js";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";
import {
  ingestServiceTitanJob,
  ingestServiceTitanPricebook,
  mayWriteServiceTitan,
  refuseServiceTitanWrite,
  refuseServiceTitanWriteMethod
} from "../spine/servicetitan-shadow.js";
import {
  ingestProBooksBook,
  ingestProBooksCost,
  ingestProBooksItem,
  ingestProBooksVendor,
  mayWriteProBooks,
  refuseProBooksWrite,
  refuseProBooksWriteMethod
} from "../spine/probooks-shadow.js";

export const BYO_ADMIT_INSTANCE_ID = "byo-admit-demo";

export interface ByoAdmitDemoOptions {
  fixtureDir?: string;
  workRoot?: string;
  instanceId?: string;
  receivedAt?: string;
}

export interface ByoAdmittedHash {
  sourceKind: "servicetitan" | "probooks";
  sourceId: string;
  packetHash: string;
  shadowHash: string;
  verificationStatus: "UNVERIFIED";
  wrapperIsVerification: false;
  live: false;
  write: false;
}

export interface ByoAdmitDemoProof {
  synthetic: true;
  customerData: false;
  authoringNodeIsCustodian: false;
  instanceId: string;
  inbound: {
    servicetitan: string;
    probooks: string;
  };
  isolate: {
    root: string;
    receiptPath: string;
    ledgerPath: string;
  };
  hashes: ByoAdmittedHash[];
  receiptHashes: string[];
  tip: string;
  wrapperIsVerification: false;
  verificationStatus: "UNVERIFIED";
  writesThrew: true;
  writeRefusals: string[];
  mayWriteServiceTitan: false;
  mayWriteProBooks: false;
}

function defaultFixtureDir(): string {
  return join(process.cwd(), "test", "fixtures", "byo");
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function asRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

function writeRefused(fn: () => never): string {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/refused/.test(message)) return message;
    throw error;
  }
  throw new Error("expected live write to throw");
}

function recordAdmit(
  sourceKind: "servicetitan" | "probooks",
  sourceId: string,
  packet: EvidencePacket,
  shadowHash: string,
  live: false,
  write: false,
  wrapper: false
): ByoAdmittedHash {
  return {
    sourceKind,
    sourceId,
    packetHash: packet.contentHash,
    shadowHash,
    verificationStatus: "UNVERIFIED",
    wrapperIsVerification: wrapper,
    live,
    write
  };
}

/**
 * Operator-software proof: copy synthetic ST + ProBooks fixtures into a temp inbound
 * layout, admit via FragGate, hash packets, write isolate receipts, and prove
 * wrapper ≠ VERIFIED while ST/ProBooks writes still throw.
 *
 * Not a customer dump. Authoring node is not a data custodian.
 */
export function runByoAdmitDemo(options: ByoAdmitDemoOptions = {}): ByoAdmitDemoProof {
  const fixtureDir = options.fixtureDir ?? defaultFixtureDir();
  const workRoot = options.workRoot ?? mkdtempSync(join(tmpdir(), "tr-byo-admit-"));
  const instanceId = sanitizeInstanceId(options.instanceId ?? BYO_ADMIT_INSTANCE_ID);
  const receivedAt = options.receivedAt ?? "2026-09-18T00:00:00Z";

  const stInbound = join(workRoot, "data", "inbound", "servicetitan");
  const pbInbound = join(workRoot, "data", "inbound", "probooks");
  const isolateRoot = join(workRoot, "data", "runtime", instanceId);
  const receiptPath = join(isolateRoot, "receipts.jsonl");
  const ledgerPath = join(isolateRoot, "ledger.jsonl");

  mkdirSync(stInbound, { recursive: true });
  mkdirSync(pbInbound, { recursive: true });
  mkdirSync(isolateRoot, { recursive: true });

  const stInboundFile = join(stInbound, "export.json");
  const pbInboundFile = join(pbInbound, "export.json");
  copyFileSync(join(fixtureDir, "servicetitan-export.json"), stInboundFile);
  copyFileSync(join(fixtureDir, "probooks-export.json"), pbInboundFile);

  const stExport = readJson(stInboundFile);
  const pbExport = readJson(pbInboundFile);
  if (stExport.synthetic !== true || pbExport.synthetic !== true) {
    throw new Error("BYO admit demo fixtures must be synthetic (not customer data)");
  }

  const hashes: ByoAdmittedHash[] = [];
  const packets: EvidencePacket[] = [];

  const stWrap = admitInboundOrThrow({
    sourceKind: "servicetitan",
    sourceId: "st:export:synthetic",
    receivedAt,
    body: stExport,
    treatAsVerified: true,
    verificationStatus: "VERIFIED"
  });
  packets.push(stWrap.packet);
  hashes.push(
    recordAdmit(
      "servicetitan",
      stWrap.packet.sourceId,
      stWrap.packet,
      stWrap.packet.contentHash,
      stWrap.live,
      stWrap.write,
      stWrap.wrapperIsVerification
    )
  );

  for (const job of asRecords(stExport.jobs)) {
    const ingested = ingestServiceTitanJob(String(job.id ?? ""), receivedAt, job);
    packets.push(ingested.packet);
    hashes.push(
      recordAdmit(
        "servicetitan",
        ingested.inbound.packet.sourceId,
        ingested.packet,
        ingested.hash,
        ingested.live,
        ingested.write,
        ingested.inbound.wrapperIsVerification
      )
    );
  }

  for (const item of asRecords(stExport.pricebook)) {
    const ingested = ingestServiceTitanPricebook(String(item.id ?? ""), receivedAt, item);
    packets.push(ingested.packet);
    hashes.push(
      recordAdmit(
        "servicetitan",
        ingested.inbound.packet.sourceId,
        ingested.packet,
        ingested.hash,
        ingested.live,
        ingested.write,
        ingested.inbound.wrapperIsVerification
      )
    );
  }

  const pbWrap = admitInboundOrThrow({
    sourceKind: "probooks",
    sourceId: "pb:export:synthetic",
    receivedAt,
    body: pbExport,
    treatAsVerified: true,
    verificationStatus: "VERIFIED"
  });
  packets.push(pbWrap.packet);
  hashes.push(
    recordAdmit(
      "probooks",
      pbWrap.packet.sourceId,
      pbWrap.packet,
      pbWrap.packet.contentHash,
      pbWrap.live,
      pbWrap.write,
      pbWrap.wrapperIsVerification
    )
  );

  for (const book of asRecords(pbExport.books)) {
    const ingested = ingestProBooksBook(String(book.id ?? ""), receivedAt, book);
    packets.push(ingested.packet);
    hashes.push(
      recordAdmit(
        "probooks",
        ingested.inbound.packet.sourceId,
        ingested.packet,
        ingested.hash,
        ingested.live,
        ingested.write,
        ingested.inbound.wrapperIsVerification
      )
    );
  }

  for (const item of asRecords(pbExport.items)) {
    const ingested = ingestProBooksItem(String(item.id ?? ""), receivedAt, item);
    packets.push(ingested.packet);
    hashes.push(
      recordAdmit(
        "probooks",
        ingested.inbound.packet.sourceId,
        ingested.packet,
        ingested.hash,
        ingested.live,
        ingested.write,
        ingested.inbound.wrapperIsVerification
      )
    );
  }

  for (const cost of asRecords(pbExport.costs)) {
    const ingested = ingestProBooksCost(String(cost.id ?? ""), receivedAt, cost);
    packets.push(ingested.packet);
    hashes.push(
      recordAdmit(
        "probooks",
        ingested.inbound.packet.sourceId,
        ingested.packet,
        ingested.hash,
        ingested.live,
        ingested.write,
        ingested.inbound.wrapperIsVerification
      )
    );
  }

  for (const vendor of asRecords(pbExport.vendors)) {
    const ingested = ingestProBooksVendor(String(vendor.id ?? ""), receivedAt, vendor);
    packets.push(ingested.packet);
    hashes.push(
      recordAdmit(
        "probooks",
        ingested.inbound.packet.sourceId,
        ingested.packet,
        ingested.hash,
        ingested.live,
        ingested.write,
        ingested.inbound.wrapperIsVerification
      )
    );
  }

  if (
    stWrap.verificationStatus !== "UNVERIFIED" ||
    pbWrap.verificationStatus !== "UNVERIFIED" ||
    wrapperIsVerification(stWrap.packet) !== false ||
    wrapperIsVerification(pbWrap.packet) !== false ||
    hashes.some((row) => row.verificationStatus !== "UNVERIFIED" || row.wrapperIsVerification)
  ) {
    throw new Error("wrapper admission must stay UNVERIFIED (wrapper ≠ VERIFIED)");
  }

  const writeRefusals = [
    writeRefused(() => refuseServiceTitanWrite("job.update")),
    writeRefused(() => refuseServiceTitanWriteMethod("POST")),
    writeRefused(() => refuseProBooksWrite("item.update")),
    writeRefused(() => refuseProBooksWriteMethod("PATCH"))
  ];

  if (mayWriteServiceTitan() || mayWriteProBooks()) {
    throw new Error("ServiceTitan and ProBooks writes must stay refused");
  }

  const store = new DurableReceiptStore(receiptPath);
  const receiptHashes: string[] = [];
  for (const admitted of hashes) {
    const receipt = store.appendKind("evidence", `byo:${admitted.sourceId}`, receivedAt, {
      ...admitted,
      synthetic: true,
      customerData: false
    });
    receiptHashes.push(receipt.hash);
  }
  const freeze = store.freeze(
    {
      at: receivedAt,
      evidence: packets,
      outcome: {
        wrapperIsVerification: false,
        verificationStatus: "UNVERIFIED",
        writesThrew: true,
        synthetic: true,
        customerData: false
      }
    },
    "byo-admit-demo"
  );
  receiptHashes.push(freeze.hash);
  writeFileSync(ledgerPath, readFileSync(receiptPath, "utf8"));

  return {
    synthetic: true,
    customerData: false,
    authoringNodeIsCustodian: false,
    instanceId,
    inbound: { servicetitan: stInbound, probooks: pbInbound },
    isolate: { root: isolateRoot, receiptPath, ledgerPath },
    hashes,
    receiptHashes,
    tip: store.tip(),
    wrapperIsVerification: false,
    verificationStatus: "UNVERIFIED",
    writesThrew: true,
    writeRefusals,
    mayWriteServiceTitan: false,
    mayWriteProBooks: false
  };
}

export function printByoAdmitDemo(proof = runByoAdmitDemo()): ByoAdmitDemoProof {
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  return proof;
}
