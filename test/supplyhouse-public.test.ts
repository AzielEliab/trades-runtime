import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultAlertConfig } from "../src/desk/alerts.js";
import { startOperatorDesk } from "../src/desk/server.js";
import {
  applySupplyHouseLookup,
  attachPart,
  CATALOG_SOURCES,
  emptyJobPriceStore,
  lookupCatalogPrice,
  presentJob,
  recordCatalogView,
  setPartCost
} from "../src/desk/job-price.js";
import {
  lookupSupplyHousePublic,
  parseSupplyHouseProductHtml,
  type SupplyHouseFetch,
  type SupplyHousePublicResult
} from "../src/desk/supplyhouse-public.js";

const SKU = "PXCE075-050-DZR";
const IMAGE = "https://d3501hjdis3g5w.cloudfront.net/images/products/zoom/pxce075-050-dzr-3.jpg";

function productHtml(price: string | null, sku = SKU): string {
  const offers = price == null ? "" : `"offers":{"@type":"Offer","priceCurrency":"USD","price":"${price}","availability":"https://schema.org/InStock"},`;
  return `<!doctype html><html><head>
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","sku":"${sku}","mpn":"${sku}","name":"Elbow",${offers}"image":"${IMAGE}"}
    </script>
    <a href="/cart/add">Add to cart</a>
  </head><body><p>$5.00 in the visible text is not a price we may copy.</p></body></html>`;
}

function htmlResponse(body: string, status = 200): Awaited<ReturnType<SupplyHouseFetch>> {
  return Promise.resolve({
    status,
    headers: { get: () => null },
    text: async () => body
  });
}

function emptyRead(sku: string): SupplyHousePublicResult {
  return {
    sku,
    price: null,
    stockCount: null,
    availability: null,
    imageUrl: null,
    pageUrl: null,
    pageKind: "none",
    productSeen: false,
    httpStatus: 403,
    ordersEnabled: false,
    ordersPlaced: false,
    methods: ["GET"],
    urls: ["https://www.supplyhouse.com/sh/control/search/~SEARCH_STRING=" + sku],
    note: "Live price is unavailable. SupplyHouse did not return a number. The typed cost remains. No order was placed."
  };
}

describe("SupplyHouse public price", () => {
  it("uses a price only when the public product body exposes one", async () => {
    const parsed = parseSupplyHouseProductHtml(productHtml("19.40"), SKU, "https://www.supplyhouse.com/example");
    expect(parsed.price).toBe(19.4);
    expect(parsed.availability).toBe("InStock");
    expect(parsed.imageUrl).toBe(IMAGE);
    expect(parsed.productSeen).toBe(true);

    const calls: { method: string; url: string }[] = [];
    const fetchImpl: SupplyHouseFetch = (url, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, url });
      if (method !== "GET") throw new Error("refusing a non-GET");
      if (/cart|checkout|login|sign-in|order/i.test(url)) throw new Error("refusing an order url");
      if (url.includes("/sh/control/search")) {
        return htmlResponse(`<a href="/Bluefin-${SKU}-elbow">product</a>`);
      }
      return htmlResponse(productHtml("19.40"));
    };
    const hit = await lookupSupplyHousePublic(SKU, { fetchImpl });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(calls.every((call) => call.url.startsWith("https://www.supplyhouse.com/"))).toBe(true);
    expect(hit.price).toBe(19.4);
    expect(hit.stockCount).toBeNull();
    expect(hit.imageUrl).toBe(IMAGE);
    expect(hit.availability).toBe("InStock");
    expect(hit.pageKind).toBe("product-page");
    expect(hit.pageUrl).toContain(SKU);
    expect(hit.ordersEnabled).toBe(false);
    expect(hit.ordersPlaced).toBe(false);
    expect(hit.note).toMatch(/SupplyHouse public product page/);
    expect(hit.note).toMatch(/No order was placed/);

    const other = parseSupplyHouseProductHtml(productHtml("9.99", "OTHER-SKU"), SKU, "https://www.supplyhouse.com/example");
    expect(other.price).toBeNull();
    expect(other.productSeen).toBe(false);
    const loose = parseSupplyHouseProductHtml("<p>$5.00</p>", SKU, "https://www.supplyhouse.com/example");
    expect(loose.price).toBeNull();
    const foreign = parseSupplyHouseProductHtml(
      productHtml("19.40").replace(IMAGE, "https://evil.example/photo.jpg"),
      SKU,
      "https://www.supplyhouse.com/example"
    );
    expect(foreign.imageUrl).toBeNull();
    expect(foreign.price).toBe(19.4);
  });

  it("keeps the typed cost when SupplyHouse does not return a number", () => {
    const attached = attachPart(emptyJobPriceStore(), { jobId: "job-1", sku: SKU, name: "Elbow" });
    const priced = setPartCost(attached.store, { jobId: "job-1", partId: attached.part.partId, cost: 40 });
    const missing = applySupplyHouseLookup(priced, {
      jobId: "job-1",
      sku: SKU,
      partId: attached.part.partId,
      actorRole: "technician",
      at: "2026-10-03T00:00:00Z",
      result: emptyRead(SKU)
    });
    const part = missing.store.jobs[0]?.parts[0];
    expect(part?.cost).toBe(40);
    expect(part?.costSource).toBe("typed");
    expect(missing.lookup.price).toBeNull();
    expect(missing.lookup.stock).toBeNull();
    expect(missing.lookup.ordersEnabled).toBe(false);
    expect(missing.request.stockCount).toBeNull();
    expect(missing.request.ordersPlaced).toBe(false);
    const view = presentJob(missing.store.jobs[0]!, []);
    expect(view.parts[0]?.livePriceNote).toBe("Live price is unavailable.");
    expect(view.parts[0]?.supplierStock).toBeNull();
    expect(view.ordersEnabled).toBe(false);

    const noNumber = parseSupplyHouseProductHtml(productHtml(null), SKU, "https://www.supplyhouse.com/example");
    expect(noNumber.productSeen).toBe(true);
    expect(noNumber.price).toBeNull();
  });

  it("does not place an order and leaves the other named sources empty", async () => {
    const calls: string[] = [];
    const fetchImpl: SupplyHouseFetch = (url, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push(method);
      if (method !== "GET") throw new Error("order side effect");
      return htmlResponse("<html><title>Just a moment...</title><p>security verification</p></html>", 403);
    };
    const blocked = await lookupSupplyHousePublic(SKU, { fetchImpl });
    expect(calls).toEqual(["GET"]);
    expect(blocked.price).toBeNull();
    expect(blocked.ordersPlaced).toBe(false);
    expect(blocked.ordersEnabled).toBe(false);
    expect(blocked.note).toMatch(/Live price is unavailable/);
    expect(blocked.note).toMatch(/No order was placed/);
    expect(blocked.note).toMatch(/security check/);

    const signed = recordCatalogView(emptyJobPriceStore(), {
      jobId: "job-1",
      sourceId: "supplyhouse",
      sku: SKU,
      actorRole: "technician",
      at: "2026-10-03T00:00:01Z"
    });
    expect(signed.request.localStub).toBe(true);
    expect(signed.request.priceReturned).toBeNull();
    expect(signed.request.ordersPlaced).toBe(false);
    expect(signed.request.note).toMatch(/No browser session is opened/);
    expect(signed.request.note).toMatch(/No order was placed/);
    expect(calls).toEqual(["GET"]);

    for (const id of ["johnstone", "ruud", "rheem", "bryant", "carrier", "duncan", "larson", "habegger", "lee-supply", "lowes", "home-depot"]) {
      const lookup = lookupCatalogPrice(id, "COND-14");
      expect(lookup.price).toBeNull();
      expect(lookup.stock).toBeNull();
      expect(lookup.imageUrl).toBeNull();
      expect(lookup.ordersEnabled).toBe(false);
      expect(lookup.priceConnected).toBe(false);
    }
    expect(CATALOG_SOURCES.every((source) => source.ordersEnabled === false && source.priceConnected === false)).toBe(true);
    expect(CATALOG_SOURCES.find((source) => source.id === "supplyhouse")?.note).toMatch(/does not place an order/);
    expect(CATALOG_SOURCES.filter((source) => source.id !== "supplyhouse").every((source) => source.note.includes("No permitted account"))).toBe(true);
  });

  it("hits the live public SupplyHouse page with GET only", async () => {
    const result = await lookupSupplyHousePublic(SKU);
    expect(result.methods.length).toBeGreaterThan(0);
    expect(result.methods.every((method) => method === "GET")).toBe(true);
    expect(result.urls.every((url) => url.startsWith("https://www.supplyhouse.com/"))).toBe(true);
    expect(result.urls.some((url) => /\/(cart|checkout|login|sign-in|orders?)(\/|$)|add-to-cart/i.test(url))).toBe(false);
    expect(result.ordersEnabled).toBe(false);
    expect(result.ordersPlaced).toBe(false);
    expect(result.stockCount).toBeNull();
    expect(result.note).toMatch(/No order was placed/);
    if (result.httpStatus != null && result.httpStatus >= 400) {
      expect(result.price).toBeNull();
      expect(result.imageUrl).toBeNull();
    }
    if (result.price == null) {
      expect(result.note).toMatch(/Live price is unavailable/);
    } else {
      expect(result.pageUrl).toMatch(/^https:\/\/(www\.)?supplyhouse\.com\//);
      expect(result.note).toMatch(/SupplyHouse/);
    }
  }, 20000);

  it("keeps a typed cost on the desk when the public SupplyHouse read has no number", async () => {
    const root = mkdtempSync(join(tmpdir(), "tr-sh-http-"));
    const desk = await startOperatorDesk({
      cwd: root,
      port: 0,
      folders: (["servicetitan", "probooks", "trades-app"] as const).map((preferClass) => ({
        dir: join(root, preferClass),
        preferClass
      })),
      alertConfig: defaultAlertConfig(),
      persistAlertState: false,
      persistLocalReports: false
    });
    try {
      const attach = await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "attach-part", jobId: "job-sh", sku: "ZZ-TR-NO-PUBLIC-PRICE", name: "No such part" })
      });
      expect(attach.status).toBe(200);
      const board = (await (await fetch(`${desk.url}api/job-price`)).json()) as {
        ordersEnabled: boolean;
        live_backends: boolean;
        pilot_started: boolean;
        field_claim: boolean;
        jobs: { sheet: { jobId: string; parts: { partId: string }[] } }[];
      };
      expect(board.ordersEnabled).toBe(false);
      expect(board.live_backends).toBe(false);
      expect(board.pilot_started).toBe(false);
      expect(board.field_claim).toBe(false);
      const partId = board.jobs.find((job) => job.sheet.jobId === "job-sh")?.sheet.parts[0]?.partId;
      await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-cost", jobId: "job-sh", partId, cost: 44 })
      });
      const lookup = await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "lookup",
          jobId: "job-sh",
          sourceId: "supplyhouse",
          sku: "ZZ-TR-NO-PUBLIC-PRICE",
          partId,
          role: "technician"
        })
      });
      const body = (await lookup.json()) as {
        lookup: { price: number | null; ordersEnabled: boolean; stock: null };
        note: string;
        ordersEnabled: boolean;
        servicetitanWrite: boolean;
        pilot_started: boolean;
        live_backends: boolean;
        field_claim: boolean;
      };
      expect(lookup.status).toBe(200);
      expect(body.lookup.price).toBeNull();
      expect(body.lookup.stock).toBeNull();
      expect(body.lookup.ordersEnabled).toBe(false);
      expect(body.ordersEnabled).toBe(false);
      expect(body.servicetitanWrite).toBe(false);
      expect(body.pilot_started).toBe(false);
      expect(body.live_backends).toBe(false);
      expect(body.field_claim).toBe(false);
      expect(body.note).toMatch(/Live price is unavailable/);
      expect(body.note).toMatch(/No order was placed/);
      const after = (await (await fetch(`${desk.url}api/job-price`)).json()) as {
        jobs: { sheet: { jobId: string }; parts: { cost: number | null; costSource: string; supplierStock: null; livePriceNote: string }[] }[];
      };
      const priced = after.jobs.find((job) => job.sheet.jobId === "job-sh");
      expect(priced?.parts[0]?.cost).toBe(44);
      expect(priced?.parts[0]?.costSource).toBe("typed");
      expect(priced?.parts[0]?.supplierStock).toBeNull();
      expect(priced?.parts[0]?.livePriceNote).toBe("Live price is unavailable.");

      const signin = await fetch(`${desk.url}api/job-price`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "signin", jobId: "job-sh", sourceId: "supplyhouse", sku: "ZZ-TR-NO-PUBLIC-PRICE", role: "technician" })
      });
      const signBody = (await signin.json()) as { lookup: { price: null; ordersEnabled: boolean }; note: string; ordersEnabled: boolean };
      expect(signBody.lookup.price).toBeNull();
      expect(signBody.lookup.ordersEnabled).toBe(false);
      expect(signBody.ordersEnabled).toBe(false);
      expect(signBody.note).toMatch(/No browser session is opened/);
      expect(signBody.note).toMatch(/No order was placed/);
    } finally {
      await desk.close();
    }
  }, 20000);
});
