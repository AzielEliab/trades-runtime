import { describe, expect, it } from "vitest";
import {
  FIRST_CLASS_SOURCE_KINDS,
  admitHumanCorrection,
  admitInbound,
  admitInboundOrThrow,
  refuseSilentVerifiedPromotion,
  wrapperIsVerification
} from "../src/spine/fraggate-inbound.js";
import {
  ingestProBooksBook,
  ingestProBooksCost,
  ingestProBooksItem,
  ingestProBooksShadow,
  ingestProBooksVendor,
  mayWriteProBooks,
  openProBooksShadowClient,
  refuseProBooksWrite,
  refuseProBooksWriteMethod,
  type NoCompiledPbWrite
} from "../src/spine/probooks-shadow.js";
import {
  mayWriteServiceTitan,
  refuseServiceTitanWrite,
  refuseServiceTitanWriteMethod
} from "../src/spine/servicetitan-shadow.js";
import {
  HOSTED_TENANT_LAYOUT,
  PROBOOKS_INBOUND_DIR,
  SERVICE_TITAN_INBOUND_DIR,
  TR_BYO_LAWS,
  inboundDir,
  inboundPath,
  isHostedTenantLayout,
  refuseHostedTenantLayout
} from "../src/spine/inbound-layout.js";
import { defaultLocalInboundConfig, parseLocalInboundConfig } from "../src/spine/local-inbound-config.js";
import {
  assertIsolatesDoNotMix,
  isolateLedgerPath,
  isolateReceiptPath,
  isolatesDoNotMix,
  refuseSharedHostedCorpus,
  sanitizeInstanceId
} from "../src/spine/runtime-isolate.js";
import { RULES_BYO } from "../src/rules/constitution.js";

describe("TR-BYO first-class sourceKinds", () => {
  it("names servicetitan, probooks, operator-file, and human", () => {
    expect(FIRST_CLASS_SOURCE_KINDS).toEqual(["servicetitan", "probooks", "operator-file", "human"]);
  });

  it("admits servicetitan and probooks as peer inbound: MEDIUM, hashed, live:false, write:false, unverified", () => {
    const st = admitInboundOrThrow({
      sourceKind: "servicetitan",
      sourceId: "st:job:1042",
      receivedAt: "2026-09-17T12:00:00Z",
      body: { jobId: 1042 },
      treatAsVerified: true,
      verificationStatus: "VERIFIED"
    });
    const pb = admitInboundOrThrow({
      sourceKind: "probooks",
      sourceId: "pb:item:sku-1",
      receivedAt: "2026-09-17T12:00:00Z",
      body: { sku: "sku-1" },
      treatAsVerified: true
    });

    for (const admitted of [st, pb]) {
      expect(admitted.ok).toBe(true);
      expect(admitted.packet.contentHash).toHaveLength(64);
      expect(admitted.packet.trust).toBe("MEDIUM");
      expect(admitted.verificationStatus).toBe("UNVERIFIED");
      expect(admitted.wrapperIsVerification).toBe(false);
      expect(admitted.treatAsVerified).toBe(false);
      expect(admitted.live).toBe(false);
      expect(admitted.write).toBe(false);
      expect(wrapperIsVerification(admitted.packet)).toBe(false);
      expect(refuseSilentVerifiedPromotion("VERIFIED")).toBe(false);
    }
    expect(st.packet.sourceType).toBe("servicetitan");
    expect(pb.packet.sourceType).toBe("probooks");
  });

  it("keeps operator-file LOW and unverified until origin is tagged", () => {
    const dropped = admitInboundOrThrow({
      sourceKind: "operator-file",
      sourceId: "file:export.csv",
      receivedAt: "2026-09-17T12:00:00Z",
      body: { rows: 12 },
      trust: "HIGH",
      treatAsVerified: true
    });
    expect(dropped.packet.trust).toBe("LOW");
    expect(dropped.verificationStatus).toBe("UNVERIFIED");
    expect(dropped.originTagged).toBe(false);
    expect(dropped.treatAsVerified).toBe(false);

    const tagged = admitInboundOrThrow({
      sourceKind: "operator-file",
      sourceId: "file:st.json",
      receivedAt: "2026-09-17T12:00:00Z",
      originKind: "servicetitan",
      body: { rows: 12 }
    });
    expect(tagged.originTagged).toBe(true);
    expect(tagged.packet.trust).toBe("MEDIUM");
    expect(tagged.verificationStatus).toBe("UNVERIFIED");
  });

  it("records human manager corrections on Chain C with actor id", () => {
    const admitted = admitHumanCorrection({
      sourceId: "price:sku-1",
      receivedAt: "2026-09-17T12:00:00Z",
      actorId: "mgr-1",
      role: "manager",
      reason: "correct OEM price",
      body: { sku: "sku-1", replacementAction: "pricebook:override", originalAction: "pricebook:shadow" }
    });
    expect(admitted.sourceKind).toBe("human");
    expect(admitted.packet.sourceType).toBe("human");
    expect(admitted.verificationStatus).toBe("UNVERIFIED");
    expect(admitted.humanCorrection?.chain).toBe("C");
    expect(admitted.humanCorrection?.actorId).toBe("mgr-1");
    expect(admitted.humanCorrection?.record.actorId).toBe("mgr-1");
    expect(admitted.humanCorrection?.record.chain).toBe("C");

    const refused = admitInbound({
      sourceKind: "human",
      sourceId: "price:sku-1",
      receivedAt: "t",
      body: { sku: "sku-1" }
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("expected refuse");
    expect(refused.code).toBe("FG-REFUSE-HUMAN-ACTOR");
  });

  it("refuses scrape and does not silently promote a wrap to VERIFIED", () => {
    for (const sourceKind of ["scrape", "listing-scrape", "unauthorized-scrape"] as const) {
      const refused = admitInbound({
        sourceKind,
        sourceId: "x",
        receivedAt: "t",
        body: { url: "https://example.invalid" }
      });
      expect(refused.ok).toBe(false);
      if (refused.ok) throw new Error("expected refuse");
      expect(refused.code).toBe("FG-REFUSE-SCRAPE");
    }
    expect(admitInbound({ sourceKind: "central-dump", sourceId: "x", receivedAt: "t", body: {} }).ok).toBe(false);
    expect(admitInbound({ sourceKind: "hosted-upload", sourceId: "x", receivedAt: "t", body: {} }).ok).toBe(false);
  });
});

describe("TR-BYO ProBooks shadow sibling", () => {
  it("ingests books/items/costs/vendor via FragGate and refuses writes", () => {
    const book = ingestProBooksBook("gl-1", "2026-09-17T12:00:00Z", { name: "parts" });
    const item = ingestProBooksItem("sku-1", "2026-09-17T12:00:00Z", { cost: 18 });
    const cost = ingestProBooksCost("c-9", "2026-09-17T12:00:00Z", { amount: 42 });
    const vendor = ingestProBooksVendor("v-2", "2026-09-17T12:00:00Z", { nameHash: "x" });
    expect(book.hash).toHaveLength(64);
    expect(item.packet.sourceType).toBe("probooks");
    expect(cost.inbound.verificationStatus).toBe("UNVERIFIED");
    expect(vendor.write).toBe(false);
    expect(vendor.live).toBe(false);
    expect(mayWriteProBooks()).toBe(false);
    expect(mayWriteServiceTitan()).toBe(false);
    expect(() => refuseProBooksWrite("item.update")).toThrow(/live ProBooks writes are refused/);
    expect(() => refuseProBooksWriteMethod("POST")).toThrow(/POST/);
    expect(() => refuseProBooksWriteMethod("PUT")).toThrow(/PUT/);
    expect(() => refuseProBooksWriteMethod("PATCH")).toThrow(/PATCH/);
    expect(() => refuseServiceTitanWrite("dispatch.update")).toThrow(/ServiceTitan/);
    expect(() => refuseServiceTitanWriteMethod("POST")).toThrow(/POST/);

    const noWrite: NoCompiledPbWrite = true;
    expect(noWrite).toBe(true);
    const client = openProBooksShadowClient();
    expect(client.writes).toBe(false);
    expect("post" in client).toBe(false);
    expect("put" in client).toBe(false);
    expect("patch" in client).toBe(false);
    expect(client.ingest).toBe(ingestProBooksShadow);
  });
});

describe("TR-BYO inbound paths and isolate", () => {
  it("points at local inbound folders, not data/tenants", () => {
    expect(inboundDir("servicetitan")).toBe(SERVICE_TITAN_INBOUND_DIR);
    expect(inboundDir("probooks")).toBe(PROBOOKS_INBOUND_DIR);
    expect(inboundPath("servicetitan", "jobs.json")).toBe("data/inbound/servicetitan/jobs.json");
    expect(inboundPath("probooks", "items.json")).toBe("data/inbound/probooks/items.json");
    expect(isHostedTenantLayout(HOSTED_TENANT_LAYOUT)).toBe(true);
    expect(isHostedTenantLayout("data/inbound/servicetitan")).toBe(false);
    expect(() => refuseHostedTenantLayout()).toThrow(/data\/inbound\/servicetitan/);
    expect(() => refuseSharedHostedCorpus()).toThrow(/data\/tenants/);
  });

  it("keeps separate receipt and ledger files per runtime instance", () => {
    expect(isolateReceiptPath("branch-a")).not.toBe(isolateReceiptPath("branch-b"));
    expect(isolateLedgerPath("branch-a")).not.toBe(isolateLedgerPath("branch-b"));
    expect(isolatesDoNotMix("branch-a", "branch-b")).toBe(true);
    expect(() => assertIsolatesDoNotMix("same", "same")).toThrow(/must not share/);
    expect(() => sanitizeInstanceId("tenants")).toThrow(/instance id/);
    expect(() => sanitizeInstanceId("hosted")).toThrow(/instance id/);
  });

  it("parses a tiny local config with no cloud account", () => {
    const config = parseLocalInboundConfig({
      instanceId: "midwest-3",
      servicetitanReadEndpoint: "http://127.0.0.1:9/st"
    });
    expect(config.instanceId).toBe("midwest-3");
    expect(config.servicetitanPath).toBe(SERVICE_TITAN_INBOUND_DIR);
    expect(config.probooksPath).toBe(PROBOOKS_INBOUND_DIR);
    expect(config.receiptPath).toBe(isolateReceiptPath("midwest-3"));
    expect(config.cloudAccount).toBeUndefined();
    expect(defaultLocalInboundConfig().servicetitanPath).toBe(SERVICE_TITAN_INBOUND_DIR);
    expect(() => parseLocalInboundConfig({ instanceId: "x", cloudAccount: "acme" })).toThrow(/cloudAccount/);
    expect(() => parseLocalInboundConfig({ instanceId: "x", tenants: [{ id: "a" }, { id: "b" }] })).toThrow(/tenants/);
    expect(() => parseLocalInboundConfig({ instanceId: "x", instanceIds: ["a", "b"] })).toThrow(/shared hosted corpus/);
    expect(() => parseLocalInboundConfig({ instanceId: "x", servicetitanPath: "data/tenants/acme" })).toThrow(/data\/tenants/);
  });

  it("does not open a network socket", () => {
    expect(typeof fetch).toBe("function");
    const admitted = admitInboundOrThrow({
      sourceKind: "probooks",
      sourceId: "pb:book:offline",
      receivedAt: "2026-09-17T12:00:00Z",
      body: { offline: true }
    });
    expect(admitted.live).toBe(false);
    expect(admitted.packet.body.offline).toBe(true);
  });
});

describe("TR-BYO laws", () => {
  it("locks the eight BYO laws in constitution and inbound layout", () => {
    expect(RULES_BYO).toEqual(TR_BYO_LAWS);
    expect(RULES_BYO).toHaveLength(8);
  });
});
