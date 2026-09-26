import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { admitInboundOrThrow } from "../src/spine/fraggate-inbound.js";
import { TRADES_APP_INBOUND_DIR, inboundDir } from "../src/spine/inbound-layout.js";
import { defaultLocalInboundConfig, parseLocalInboundConfig } from "../src/spine/local-inbound-config.js";
import {
  admitDropInDocument,
  admitDropInFile,
  admitDropInFolder,
  admitDropInText,
  detectDropIn
} from "../src/spine/drop-in.js";
import {
  mayWriteTradesApp,
  openTradesAppShadowClient,
  refuseTradesAppWrite,
  refuseTradesAppWriteMethod,
  type NoCompiledTradesAppWrite
} from "../src/spine/trades-app-shadow.js";
import { runDropInDemo } from "../src/demo/drop-in.js";

const RECEIVED = "2026-09-25T00:00:00Z";
const FIXTURES = join(process.cwd(), "test", "fixtures", "byo");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as unknown;
}

describe("universal trades-app drop-in", () => {
  it("keeps ServiceTitan and ProBooks as named peers and sniffs trades-app shapes", () => {
    const st = detectDropIn(fixture("servicetitan-export.json"));
    const pb = detectDropIn(fixture("probooks-export.json"));
    const jobber = detectDropIn(fixture("jobber-export.json"));
    const housecall = detectDropIn(fixture("housecall-export.json"));
    const fusion = detectDropIn(fixture("service-fusion-export.json"));
    const qbo = detectDropIn(fixture("qbo-export.json"));
    const qbd = detectDropIn(fixture("qbd-export.json"));
    const generic = detectDropIn(fixture("generic-jobs.json"));
    expect(st.ok && st.peerClass).toBe("servicetitan");
    expect(pb.ok && pb.peerClass).toBe("probooks");
    expect(jobber.ok && jobber.profileId).toBe("jobber");
    expect(jobber.ok && jobber.peerClass).toBe("trades-app");
    expect(housecall.ok && housecall.profileId).toBe("housecall-pro");
    expect(fusion.ok && fusion.profileId).toBe("service-fusion");
    expect(qbo.ok && qbo.profileId).toBe("quickbooks-online");
    expect(qbd.ok && qbd.profileId).toBe("quickbooks-desktop");
    expect(generic.ok && generic.profileId).toBe("generic-json");
    expect(generic.ok && generic.peerClass).toBe("trades-app");
  });

  it("prefers named vendor profiles from keys, then falls back to generic sniff", () => {
    const expected = [
      ["servicem8-export.json", "servicem8", ["job", "customer"]],
      ["acculynx-export.json", "acculynx", ["job", "customer", "appointment"]],
      ["successware-export.json", "successware", ["job", "technician", "appointment"]],
      ["xero-export.json", "xero", ["invoice", "customer", "pricebook"]],
      ["fieldedge-export.json", "fieldedge", ["job", "customer", "technician", "appointment"]],
      ["servicetrade-export.json", "servicetrade", ["job", "appointment"]]
    ] as const;

    for (const [file, profileId, entities] of expected) {
      const doc = fixture(file) as Record<string, unknown>;
      delete doc.vendor;
      delete doc.app;
      delete doc.source;
      const detected = detectDropIn(doc);
      expect(detected.ok && detected.profileId, file).toBe(profileId);
      expect(detected.ok && detected.peerClass, file).toBe("trades-app");
      const admitted = admitDropInDocument(doc, { receivedAt: RECEIVED });
      expect(admitted.ok, file).toBe(true);
      if (!admitted.ok) continue;
      expect(admitted.profileId).toBe(profileId);
      expect(admitted.vendorHint).toBe(profileId);
      expect(admitted.trust).toBe("MEDIUM");
      expect(admitted.live).toBe(false);
      expect(admitted.write).toBe(false);
      expect(admitted.verificationStatus).toBe("UNVERIFIED");
      expect(admitted.wrapperIsVerification).toBe(false);
      expect(admitted.records.map((record) => record.entity)).toEqual([...entities]);
      for (const record of admitted.records) {
        expect(record.packetHash).toHaveLength(64);
        expect(record.shadowHash).toHaveLength(64);
        expect(record.trust).toBe("MEDIUM");
        expect(record.verificationStatus).toBe("UNVERIFIED");
        expect(record.live).toBe(false);
        expect(record.write).toBe(false);
        expect(record.sourceId.startsWith("ta:")).toBe(true);
      }
    }

    const headerOnly = admitDropInText(
      "# synthetic: true\nCall ID,Agreement Number,Job Class,Status\nSYN-SW-HDR,AGR-H,Service,Completed\n",
      { receivedAt: RECEIVED, fileName: "calls.csv" }
    );
    expect(headerOnly.ok && headerOnly.profileId).toBe("successware");
    expect(headerOnly.ok && headerOnly.records[0]?.externalId).toBe("SYN-SW-HDR");

    const byName = admitDropInText(
      "# synthetic: true\njob_id,customer,status\nSYN-AL-FILE,Synthetic Annex,scheduled\n",
      { receivedAt: RECEIVED, fileName: "acculynx-board.csv" }
    );
    expect(byName.ok && byName.profileId).toBe("acculynx");
    expect(byName.ok && byName.peerClass).toBe("trades-app");
    expect(byName.ok && byName.records[0]?.externalId).toBe("SYN-AL-FILE");

    const stillGeneric = admitDropInText(
      "# synthetic: true\njob_id,customer,status\nSYN-PLAIN,Synthetic Annex,scheduled\n",
      { receivedAt: RECEIVED, fileName: "board.csv" }
    );
    expect(stillGeneric.ok && stillGeneric.profileId).toBe("generic-csv");

    const stNamedLikeXero = detectDropIn(fixture("servicetitan-export.json"), { fileName: "xero-invoices.json" });
    expect(stNamedLikeXero.ok && stNamedLikeXero.profileId).toBe("servicetitan");
    expect(stNamedLikeXero.ok && stNamedLikeXero.peerClass).toBe("servicetitan");

    const tradeNotTitan = detectDropIn(fixture("servicetrade-export.json"), { fileName: "servicetitan-export.json" });
    expect(tradeNotTitan.ok && tradeNotTitan.profileId).toBe("servicetrade");
    expect(tradeNotTitan.ok && tradeNotTitan.peerClass).toBe("trades-app");
  });

  it("admits a trades-app drop as MEDIUM, hashed, live:false, write:false, unverified", () => {
    const admitted = admitDropInDocument(fixture("jobber-export.json"), { receivedAt: RECEIVED });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    expect(admitted.trust).toBe("MEDIUM");
    expect(admitted.live).toBe(false);
    expect(admitted.write).toBe(false);
    expect(admitted.verificationStatus).toBe("UNVERIFIED");
    expect(admitted.wrapperIsVerification).toBe(false);
    expect(admitted.records.length).toBeGreaterThan(0);
    for (const record of admitted.records) {
      expect(record.packetHash).toHaveLength(64);
      expect(record.shadowHash).toHaveLength(64);
      expect(record.verificationStatus).toBe("UNVERIFIED");
      expect(record.trust).toBe("MEDIUM");
      expect(record.sourceId.startsWith("ta:")).toBe(true);
    }
  });

  it("honors an explicit trades-app class without collapsing named peers", () => {
    const forced = admitDropInDocument(
      { sourceKind: "trades-app", synthetic: true, jobs: [{ id: "SYN-FORCE-1", status: "Completed", customerId: "C" }] },
      { receivedAt: RECEIVED }
    );
    expect(forced.ok && forced.peerClass).toBe("trades-app");
    if (!forced.ok) return;
    expect(forced.records[0]?.sourceId.startsWith("ta:")).toBe(true);
  });

  it("tags operator-file origin trades-app as MEDIUM and still unverified", () => {
    const tagged = admitInboundOrThrow({
      sourceKind: "operator-file",
      sourceId: "file:trades.json",
      receivedAt: RECEIVED,
      originKind: "trades-app",
      body: { rows: 1 }
    });
    expect(tagged.originTagged).toBe(true);
    expect(tagged.packet.trust).toBe("MEDIUM");
    expect(tagged.verificationStatus).toBe("UNVERIFIED");
    expect(tagged.packet.sourceType).toBe("operator-file");
  });

  it("refuses scrape, central-dump, hosted-upload, and unknown shapes", () => {
    const scrape = admitDropInDocument({ sourceKind: "scrape", jobs: [{ id: "x" }] }, { receivedAt: RECEIVED });
    const dump = admitDropInDocument({ sourceKind: "central-dump", records: [{ job_id: "x" }] }, { receivedAt: RECEIVED });
    const upload = admitDropInDocument({ kind: "hosted-upload", records: [{ job_id: "x" }] }, { receivedAt: RECEIVED });
    const unknown = admitDropInDocument({ note: "hello" }, { receivedAt: RECEIVED });
    expect(scrape.ok).toBe(false);
    expect(!scrape.ok && scrape.code).toBe("FG-REFUSE-SCRAPE");
    expect(!dump.ok && dump.code).toBe("FG-REFUSE-UNAUTHORIZED");
    expect(!upload.ok && upload.code).toBe("FG-REFUSE-UNAUTHORIZED");
    expect(!unknown.ok && unknown.code).toBe("FG-REFUSE-UNKNOWN");
  });

  it("reads a generic CSV and a local trades-app path without calling the network", () => {
    const csv = admitDropInFile(join(FIXTURES, "generic-jobs.csv"), { receivedAt: RECEIVED });
    expect(csv.result.ok).toBe(true);
    if (!csv.result.ok) return;
    expect(csv.result.profileId).toBe("generic-csv");
    expect(csv.result.peerClass).toBe("trades-app");
    expect(csv.result.synthetic).toBe(true);
    expect(csv.result.records[0]?.externalId).toBe("SYN-CSV-1");
    expect(csv.result.records[0]?.callClass).toMatchObject({ callback: "yes", warranty: "no" });
    expect(inboundDir("trades-app")).toBe(TRADES_APP_INBOUND_DIR);
    const config = parseLocalInboundConfig({
      instanceId: "desk-1",
      tradesAppReadEndpoint: "http://127.0.0.1:9/trades-app"
    });
    expect(config.tradesAppPath).toBe(TRADES_APP_INBOUND_DIR);
    expect(config.tradesAppReadEndpoint).toBe("http://127.0.0.1:9/trades-app");
    expect(defaultLocalInboundConfig().tradesAppPath).toBe(TRADES_APP_INBOUND_DIR);
    expect(mayWriteTradesApp()).toBe(false);
    expect(() => refuseTradesAppWrite("job.update")).toThrow(/trades-app writes are refused/);
    expect(() => refuseTradesAppWriteMethod("POST")).toThrow(/POST/);
    expect(() => refuseTradesAppWriteMethod("PUT")).toThrow(/PUT/);
    expect(() => refuseTradesAppWriteMethod("PATCH")).toThrow(/PATCH/);
    const noWrite: NoCompiledTradesAppWrite = true;
    expect(noWrite).toBe(true);
    const client = openTradesAppShadowClient();
    expect(client.writes).toBe(false);
    expect("post" in client).toBe(false);
    expect("put" in client).toBe(false);
    expect("patch" in client).toBe(false);
  });

  it("does not call fetch while admitting a folder of fixtures", () => {
    const root = mkdtempSync(join(tmpdir(), "tr-drop-folder-"));
    const dir = join(root, "trades-app");
    mkdirSync(dir);
    copyFileSync(join(FIXTURES, "generic-jobs.json"), join(dir, "generic-jobs.json"));
    const original = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("network refused");
    };
    try {
      const admitted = admitDropInFolder(dir, { preferClass: "trades-app", receivedAt: RECEIVED });
      expect(admitted.live).toBe(false);
      expect(admitted.write).toBe(false);
      expect(admitted.files[0]?.result.ok).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("proves the synthetic drop-in demo admits peers and refuses writes", () => {
    const proof = runDropInDemo({ receivedAt: RECEIVED });
    expect(proof.synthetic).toBe(true);
    expect(proof.customerData).toBe(false);
    expect(proof.authoringNodeIsCustodian).toBe(false);
    expect(proof.live).toBe(false);
    expect(proof.write).toBe(false);
    expect(proof.wrapperIsVerification).toBe(false);
    expect(proof.mayWriteTradesApp).toBe(false);
    const byFile = Object.fromEntries(proof.files.map((file) => [file.file, file]));
    expect(byFile["export.json"]?.peerClass === "servicetitan" || byFile["export.json"]?.peerClass === "probooks").toBe(true);
    const peers = new Set(proof.files.map((file) => file.peerClass));
    expect(peers.has("servicetitan")).toBe(true);
    expect(peers.has("probooks")).toBe(true);
    expect(peers.has("trades-app")).toBe(true);
    expect(byFile["jobber-export.json"]?.profileId).toBe("jobber");
    expect(byFile["generic-jobs.csv"]?.profileId).toBe("generic-csv");
    expect(byFile["servicem8-export.json"]?.profileId).toBe("servicem8");
    expect(byFile["acculynx-export.json"]?.profileId).toBe("acculynx");
    expect(byFile["successware-export.json"]?.profileId).toBe("successware");
    expect(byFile["successware-calls.csv"]?.profileId).toBe("successware");
    expect(byFile["xero-export.json"]?.profileId).toBe("xero");
    expect(byFile["fieldedge-export.json"]?.profileId).toBe("fieldedge");
    expect(byFile["servicetrade-export.json"]?.profileId).toBe("servicetrade");
    for (const file of ["servicem8-export.json", "acculynx-export.json", "successware-export.json", "xero-export.json", "fieldedge-export.json", "servicetrade-export.json", "successware-calls.csv"]) {
      expect(byFile[file]?.peerClass).toBe("trades-app");
    }
    for (const file of proof.files) {
      expect(file.hashes.every((hash) => hash.length === 64)).toBe(true);
      expect(file.verificationStatus).toBe("UNVERIFIED");
    }
    expect(proof.refused.map((row) => row.code)).toEqual([
      "FG-REFUSE-SCRAPE",
      "FG-REFUSE-UNAUTHORIZED",
      "FG-REFUSE-UNAUTHORIZED"
    ]);
    expect(proof.receiptTip).toHaveLength(64);
    expect(proof.callClass.callback).toBeGreaterThan(0);
    expect(proof.callClass.warranty).toBeGreaterThan(0);
    expect(proof.callClass.notClassified).toBeGreaterThan(0);
    expect(proof.callClass.calls).toBeGreaterThan(proof.callClass.callback);
    expect(proof.writeRefusals.some((line) => /trades-app/.test(line))).toBe(true);
  });

  it("lists the named vendor pack in the inbound readme and TR-VENDOR receipt", () => {
    const readme = readFileSync("data/inbound/README.md", "utf8");
    for (const name of ["ServiceM8", "AccuLynx", "SuccessWare", "Xero", "FieldEdge", "ServiceTrade", "Jobber", "Housecall Pro", "Service Fusion"]) {
      expect(readme).toContain(name);
    }
    expect(existsSync("specs/TR-VENDOR-2026-09-25.txt")).toBe(true);
    const spec = readFileSync("specs/TR-VENDOR-2026-09-25.txt", "utf8");
    expect(spec).toMatch(/Aziel Eliab/);
    expect(spec).toMatch(/0\.4\.1/);
    expect(spec).toMatch(/UNVERIFIED/);
    expect(spec).toMatch(/live:false/);
    expect(spec).toMatch(/write:false/);
    expect(spec).toMatch(/MEDIUM/);
  });
});
