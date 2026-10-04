/**
 * Read-only public page lookup for supplyhouse.com.
 * GET only. No login, no cart, no order, no signed-in scrape.
 * A price, an availability word, or an image is kept only when the response body exposes it.
 * A stock count is never invented from InStock or OutOfStock.
 */

export const SUPPLYHOUSE_AVAILABILITY = [
  "InStock",
  "OutOfStock",
  "PreOrder",
  "LimitedAvailability",
  "SoldOut",
  "BackOrder",
  "Discontinued"
] as const;

export type SupplyHouseAvailability = (typeof SUPPLYHOUSE_AVAILABILITY)[number];

export interface SupplyHousePublicResult {
  sku: string;
  price: number | null;
  stockCount: null;
  availability: SupplyHouseAvailability | null;
  imageUrl: string | null;
  pageUrl: string | null;
  pageKind: "product-page" | "search-page" | "none";
  productSeen: boolean;
  httpStatus: number | null;
  ordersEnabled: false;
  ordersPlaced: false;
  methods: string[];
  urls: string[];
  note: string;
}

export interface SupplyHouseFetchInit {
  method?: string;
  headers?: Record<string, string>;
  redirect?: "manual" | "follow" | "error";
  signal?: AbortSignal;
}

export type SupplyHouseFetch = (url: string, init?: SupplyHouseFetchInit) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_GETS = 4;
const MAX_BODY = 1_500_000;
const IMAGE_HOSTS = new Set(["www.supplyhouse.com", "supplyhouse.com", "d3501hjdis3g5w.cloudfront.net"]);

const UNAVAILABLE =
  "Live price is unavailable. SupplyHouse did not return a number. The typed cost remains. No order was placed.";

export function isSupplyHouseImageUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function supplyHouseSearchUrl(sku: string): string {
  return `https://www.supplyhouse.com/sh/control/search/~SEARCH_STRING=${encodeURIComponent(cleanSku(sku))}`;
}

function cleanSku(sku: string): string {
  const named = sku.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(named)) {
    throw new Error("catalog lookup needs a sku");
  }
  return named;
}

function emptyResult(sku: string, note: string, extra?: Partial<SupplyHousePublicResult>): SupplyHousePublicResult {
  return {
    sku,
    price: null,
    availability: null,
    imageUrl: null,
    pageUrl: null,
    pageKind: "none",
    productSeen: false,
    httpStatus: null,
    methods: [],
    urls: [],
    note,
    ...extra,
    stockCount: null,
    ordersEnabled: false,
    ordersPlaced: false
  };
}

export function parseSupplyHouseProductHtml(
  html: string,
  sku: string,
  _pageUrl: string
): {
  price: number | null;
  availability: SupplyHouseAvailability | null;
  imageUrl: string | null;
  productSeen: boolean;
} {
  const want = cleanSku(sku).toLowerCase();
  let price: number | null = null;
  let availability: SupplyHouseAvailability | null = null;
  let imageUrl: string | null = null;
  let productSeen = false;
  let ambiguous = false;
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const products: Record<string, unknown>[] = [];
    collectProducts(parsed, products);
    for (const product of products) {
      if (!skuMatches(product, want)) continue;
      productSeen = true;
      const offer = readOffers(product.offers);
      if (offer.ambiguous) ambiguous = true;
      if (offer.price != null && price != null && offer.price !== price) ambiguous = true;
      if (offer.price != null && price == null) price = offer.price;
      if (offer.availability && !availability) availability = offer.availability;
      const image = readImage(product.image);
      if (image && !imageUrl) imageUrl = image;
    }
  }
  if (ambiguous) price = null;
  if (!productSeen) return { price: null, availability: null, imageUrl: null, productSeen: false };
  return { price, availability, imageUrl: isSupplyHouseImageUrl(imageUrl) ? imageUrl : null, productSeen: true };
}

function collectProducts(value: unknown, out: Record<string, unknown>[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectProducts(item, out);
    return;
  }
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes("Product")) out.push(record);
  if (record["@graph"]) collectProducts(record["@graph"], out);
  if (Array.isArray(record.hasVariant)) collectProducts(record.hasVariant, out);
}

function skuMatches(product: Record<string, unknown>, want: string): boolean {
  for (const key of ["sku", "mpn"]) {
    const value = product[key];
    if (typeof value === "string" && value.trim().toLowerCase() === want) return true;
  }
  return false;
}

function readOffers(offers: unknown): { price: number | null; availability: SupplyHouseAvailability | null; ambiguous: boolean } {
  const list = Array.isArray(offers) ? offers : offers && typeof offers === "object" ? [offers] : [];
  const prices: number[] = [];
  let availability: SupplyHouseAvailability | null = null;
  for (const offer of list) {
    if (!offer || typeof offer !== "object") continue;
    const row = offer as Record<string, unknown>;
    const currency = typeof row.priceCurrency === "string" ? row.priceCurrency.trim().toUpperCase() : "USD";
    if (currency !== "USD") continue;
    const price = readPrice(row.price);
    if (price != null) prices.push(price);
    const next = readAvailability(row.availability);
    if (next && !availability) availability = next;
  }
  const unique = [...new Set(prices)];
  if (unique.length > 1) return { price: null, availability, ambiguous: true };
  return { price: unique[0] ?? null, availability, ambiguous: false };
}

function readPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value * 100) / 100;
  if (typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value.trim())) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed * 100) / 100;
  }
  return null;
}

function readAvailability(value: unknown): SupplyHouseAvailability | null {
  if (typeof value !== "string") return null;
  const word = value.trim().split("/").pop() ?? "";
  return (SUPPLYHOUSE_AVAILABILITY as readonly string[]).includes(word) ? (word as SupplyHouseAvailability) : null;
}

function readImage(value: unknown): string | null {
  if (typeof value === "string") return isSupplyHouseImageUrl(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readImage(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object" && typeof (value as { url?: unknown }).url === "string") {
    return readImage((value as { url: string }).url);
  }
  return null;
}

function safeSupplyHouseUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "www.supplyhouse.com" && url.hostname !== "supplyhouse.com") return null;
  const path = `${url.pathname}${url.search}`.toLowerCase();
  if (/(\/(cart|checkout|login|sign-in|signin|account|orders?)(\/|$)|add-to-cart|addtocart)/.test(path)) return null;
  return url;
}

function skuInPath(pathname: string, sku: string): boolean {
  const hay = pathname.toLowerCase();
  const needle = sku.toLowerCase();
  const at = hay.indexOf(needle);
  if (at < 0) return false;
  const before = at === 0 ? "/" : hay[at - 1];
  const after = hay[at + needle.length] ?? "/";
  const boundary = (char: string) => !/[a-z0-9]/i.test(char);
  return boundary(before) && boundary(after);
}

function findProductLink(html: string, sku: string): string | null {
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const href = match[1];
    if (!href || href.startsWith("#")) continue;
    const absolute = href.startsWith("//") ? `https:${href}` : href.startsWith("/") ? `https://www.supplyhouse.com${href}` : href;
    const url = safeSupplyHouseUrl(absolute);
    if (!url) continue;
    if (url.pathname.toLowerCase().includes("/sh/control/search")) continue;
    if (skuInPath(url.pathname, sku)) return url.toString();
  }
  return null;
}

function securityCheck(html: string): boolean {
  return /Just a moment|cf-mitigated|security verification|Enable JavaScript and cookies/i.test(html);
}

function noteFor(parsed: { price: number | null }, pageUrl: string, pageKind: "product-page" | "search-page", status: number): string {
  if (parsed.price == null) return `${UNAVAILABLE} Public response HTTP ${status}. Page ${pageUrl}.`;
  const where = pageKind === "product-page" ? "SupplyHouse public product page" : "SupplyHouse public page";
  return `${where} ${pageUrl} returned ${parsed.price.toFixed(2)}. No order was placed.`;
}

async function getPublic(
  url: URL,
  fetchImpl: SupplyHouseFetch,
  bag: { methods: string[]; urls: string[] }
): Promise<{ status: number; body: string; finalUrl: string } | null> {
  let current = url;
  for (let hop = 0; hop < 3; hop += 1) {
    if (bag.methods.length >= MAX_GETS) return null;
    bag.methods.push("GET");
    bag.urls.push(current.toString());
    let response: Awaited<ReturnType<SupplyHouseFetch>>;
    try {
      response = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { status: response.status, body: "", finalUrl: current.toString() };
      const next = safeSupplyHouseUrl(new URL(location, current).toString());
      if (!next) return { status: response.status, body: "", finalUrl: current.toString() };
      current = next;
      continue;
    }
    const body = (await response.text()).slice(0, MAX_BODY);
    return { status: response.status, body, finalUrl: current.toString() };
  }
  return null;
}

export async function lookupSupplyHousePublic(
  sku: string,
  options?: { fetchImpl?: SupplyHouseFetch }
): Promise<SupplyHousePublicResult> {
  const named = cleanSku(sku);
  const fetchImpl = options?.fetchImpl ?? ((url, init) => fetch(url, init));
  const bag = { methods: [] as string[], urls: [] as string[] };
  const search = safeSupplyHouseUrl(supplyHouseSearchUrl(named));
  if (!search) return emptyResult(named, UNAVAILABLE);
  const searched = await getPublic(search, fetchImpl, bag);
  if (!searched) {
    return emptyResult(named, `${UNAVAILABLE} The public request did not return a page.`, {
      methods: bag.methods,
      urls: bag.urls
    });
  }
  const searchParsed = parseSupplyHouseProductHtml(searched.body, named, searched.finalUrl);
  const productLink = searched.status < 400 ? findProductLink(searched.body, named) : null;
  let status = searched.status;
  let body = searched.body;
  let finalUrl = searched.finalUrl;
  let pageKind: "product-page" | "search-page" = "search-page";
  let parsed = searchParsed;
  if (productLink) {
    const productUrl = safeSupplyHouseUrl(productLink);
    if (productUrl && productUrl.toString() !== searched.finalUrl) {
      const product = await getPublic(productUrl, fetchImpl, bag);
      if (product) {
        status = product.status;
        body = product.body;
        finalUrl = product.finalUrl;
        pageKind = "product-page";
        parsed = parseSupplyHouseProductHtml(product.body, named, product.finalUrl);
      }
    } else if (productUrl) {
      pageKind = "product-page";
    }
  }
  const challenged = status >= 400 || securityCheck(body);
  if (challenged || !parsed.productSeen) {
    const why = securityCheck(body)
      ? `${UNAVAILABLE} The public response was a security check, not a product page. HTTP ${status}.`
      : `${UNAVAILABLE} Public response HTTP ${status}.`;
    return emptyResult(named, why, {
      httpStatus: status,
      methods: bag.methods,
      urls: bag.urls,
      pageUrl: null
    });
  }
  return {
    sku: named,
    price: parsed.price,
    stockCount: null,
    availability: parsed.availability,
    imageUrl: parsed.imageUrl,
    pageUrl: finalUrl,
    pageKind,
    productSeen: true,
    httpStatus: status,
    ordersEnabled: false,
    ordersPlaced: false,
    methods: bag.methods,
    urls: bag.urls,
    note: noteFor(parsed, finalUrl, pageKind, status)
  };
}
