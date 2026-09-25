import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitDropInDocument, admitDropInFolder, type DropInPeerClass } from "../spine/drop-in.js";
import { DurableReceiptStore } from "../spine/durable-receipts.js";
import { sanitizeInstanceId } from "../spine/runtime-isolate.js";
import { mayWriteProBooks, refuseProBooksWrite, refuseProBooksWriteMethod } from "../spine/probooks-shadow.js";
import { mayWriteServiceTitan, refuseServiceTitanWrite, refuseServiceTitanWriteMethod } from "../spine/servicetitan-shadow.js";
import { mayWriteTradesApp, refuseTradesAppWrite, refuseTradesAppWriteMethod } from "../spine/trades-app-shadow.js";

export const DROP_IN_DEMO_INSTANCE_ID = "drop-in-demo";

const TRADES_APP_FIXTURES = [
  "jobber-export.json",
  "housecall-export.json",
  "service-fusion-export.json",
  "qbo-export.json",
  "qbd-export.json",
  "servicem8-export.json",
  "acculynx-export.json",
  "successware-export.json",
  "successware-calls.csv",
  "xero-export.json",
  "fieldedge-export.json",
  "servicetrade-export.json",
  "generic-jobs.json",
  "generic-jobs.csv"
] as const;

export interface DropInDemoOptions {
  fixtureDir?: string;
  workRoot?: string;
  instanceId?: string;
  receivedAt?: string;
}

export interface DropInDemoFile {
  file: string;
  peerClass: DropInPeerClass;
  profileId: string;
  vendorHint: string;
  records: number;
  hashes: string[];
  verificationStatus: "UNVERIFIED";
  live: false;
  write: false;
  synthetic: true;
}

export interface DropInDemoProof {
  synthetic: true;
  customerData: false;
  authoringNodeIsCustodian: false;
  live: false;
  write: false;
  wrapperIsVerification: false;
  verificationStatus: "UNVERIFIED";
  instanceId: string;
  inbound: { servicetitan: string; probooks: string; tradesApp: string };
  files: DropInDemoFile[];
  refused: { file: string; code: string }[];
  receiptTip: string;
  writesThrew: true;
  writeRefusals: string[];
  mayWriteServiceTitan: false;
  mayWriteProBooks: false;
  mayWriteTradesApp: false;
}

function defaultFixtureDir(): string {
  return join(process.cwd(), "test", "fixtures", "byo");
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

export function runDropInDemo(options: DropInDemoOptions = {}): DropInDemoProof {
  const fixtureDir = options.fixtureDir ?? defaultFixtureDir();
  const workRoot = options.workRoot ?? mkdtempSync(join(tmpdir(), "tr-drop-in-"));
  const instanceId = sanitizeInstanceId(options.instanceId ?? DROP_IN_DEMO_INSTANCE_ID);
  const receivedAt = options.receivedAt ?? "2026-09-25T00:00:00Z";
  const stInbound = join(workRoot, "data", "inbound", "servicetitan");
  const pbInbound = join(workRoot, "data", "inbound", "probooks");
  const taInbound = join(workRoot, "data", "inbound", "trades-app");
  const isolateRoot = join(workRoot, "data", "runtime", instanceId);
  const receiptPath = join(isolateRoot, "receipts.jsonl");
  const ledgerPath = join(isolateRoot, "ledger.jsonl");

  for (const dir of [stInbound, pbInbound, taInbound, isolateRoot]) mkdirSync(dir, { recursive: true });
  copyFileSync(join(fixtureDir, "servicetitan-export.json"), join(stInbound, "export.json"));
  copyFileSync(join(fixtureDir, "probooks-export.json"), join(pbInbound, "export.json"));
  for (const name of TRADES_APP_FIXTURES) copyFileSync(join(fixtureDir, name), join(taInbound, name));

  const folders = [
    admitDropInFolder(stInbound, { preferClass: "servicetitan", receivedAt }),
    admitDropInFolder(pbInbound, { preferClass: "probooks", receivedAt }),
    admitDropInFolder(taInbound, { preferClass: "trades-app", receivedAt })
  ];

  const files: DropInDemoFile[] = [];
  for (const folder of folders) {
    for (const file of folder.files) {
      if (!file.result.ok) {
        throw new Error(`${file.file} should admit in the drop-in demo (${file.result.code})`);
      }
      if (!file.result.synthetic || file.result.live || file.result.write || file.result.verificationStatus !== "UNVERIFIED") {
        throw new Error(`${file.file} must stay synthetic, unverified, and read-only`);
      }
      files.push({
        file: file.file,
        peerClass: file.result.peerClass,
        profileId: file.result.profileId,
        vendorHint: file.result.vendorHint,
        records: file.result.records.length,
        hashes: file.result.records.map((record) => record.packetHash),
        verificationStatus: "UNVERIFIED",
        live: false,
        write: false,
        synthetic: true
      });
    }
  }

  const scrape = admitDropInDocument(
    { synthetic: true, sourceKind: "scrape", jobs: [{ id: "nope" }] },
    { receivedAt }
  );
  const dump = admitDropInDocument(
    { synthetic: true, sourceKind: "central-dump", records: [{ job_id: "nope" }] },
    { receivedAt }
  );
  const upload = admitDropInDocument(
    { synthetic: true, sourceKind: "hosted-upload", records: [{ job_id: "nope" }] },
    { receivedAt }
  );
  if (scrape.ok || dump.ok || upload.ok) throw new Error("scrape, central-dump, and hosted-upload must refuse");
  if (!scrape.ok && scrape.code !== "FG-REFUSE-SCRAPE") throw new Error("scrape must refuse as FG-REFUSE-SCRAPE");
  if (!dump.ok && dump.code !== "FG-REFUSE-UNAUTHORIZED") throw new Error("central-dump must refuse");
  if (!upload.ok && upload.code !== "FG-REFUSE-UNAUTHORIZED") throw new Error("hosted-upload must refuse");

  const writeRefusals = [
    writeRefused(() => refuseServiceTitanWrite("job.update")),
    writeRefused(() => refuseServiceTitanWriteMethod("POST")),
    writeRefused(() => refuseProBooksWrite("item.update")),
    writeRefused(() => refuseProBooksWriteMethod("PATCH")),
    writeRefused(() => refuseTradesAppWrite("job.update")),
    writeRefused(() => refuseTradesAppWriteMethod("PUT"))
  ];
  if (mayWriteServiceTitan() || mayWriteProBooks() || mayWriteTradesApp()) {
    throw new Error("ServiceTitan, ProBooks, and trades-app writes must stay refused");
  }

  const store = new DurableReceiptStore(receiptPath);
  for (const file of files) {
    store.appendKind("evidence", `drop-in:${file.file}`, receivedAt, {
      ...file,
      synthetic: true,
      customerData: false
    });
  }
  const freeze = store.freeze(
    {
      at: receivedAt,
      outcome: {
        synthetic: true,
        customerData: false,
        wrapperIsVerification: false,
        verificationStatus: "UNVERIFIED",
        writesThrew: true
      }
    },
    "drop-in-demo"
  );
  writeFileSync(ledgerPath, readFileSync(receiptPath, "utf8"));

  return {
    synthetic: true,
    customerData: false,
    authoringNodeIsCustodian: false,
    live: false,
    write: false,
    wrapperIsVerification: false,
    verificationStatus: "UNVERIFIED",
    instanceId,
    inbound: { servicetitan: stInbound, probooks: pbInbound, tradesApp: taInbound },
    files,
    refused: [
      { file: "scrape.json", code: scrape.ok ? "UNEXPECTED" : scrape.code },
      { file: "central-dump.json", code: dump.ok ? "UNEXPECTED" : dump.code },
      { file: "hosted-upload.json", code: upload.ok ? "UNEXPECTED" : upload.code }
    ],
    receiptTip: freeze.hash,
    writesThrew: true,
    writeRefusals,
    mayWriteServiceTitan: false,
    mayWriteProBooks: false,
    mayWriteTradesApp: false
  };
}

export function printDropInDemo(proof = runDropInDemo()): DropInDemoProof {
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  return proof;
}
