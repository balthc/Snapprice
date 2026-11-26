// Free page reader: opens a shop's product page (like a link preview does) and reads what shops
// publish for Google and social media: the product photo (og:image / schema.org image), the price,
// the currency and the stock status. Some shops block this; then we simply get nothing back.
import { readAvailability, type Stock } from "./stock";

export type PageInfo = {
  status: number;
  stock: Stock;
  image: string | null;
  price: number | null;
  currency: string | null;
  title: string | null;
  text: string; // product name, description and codes from the page, for the season/variant check
};

const UA = "Mozilla/5.0 (compatible; SnappriceBot/1.0; price comparison)";

// Block addresses inside our own network (the server must only fetch public shop pages).
export function publicUrl(u: string): URL | null {
  try {
    const url = new URL(u);
    const host = url.hostname;
    if (
      !/^https?:$/.test(url.protocol) ||
      host === "localhost" ||
      /^(\d+\.){3}\d+$/.test(host) ||
      host.includes(":") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export async function fetchHtml(u: string, maxBytes = 1_500_000, timeoutMs = 5000): Promise<{ status: number; html: string; finalUrl: string }> {
  const url = publicUrl(u);
  if (!url) return { status: 400, html: "", finalUrl: u };
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en,nl;q=0.8,de;q=0.6" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok || !res.body) return { status: res.status, html: "", finalUrl: res.url || u };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return { status: res.status, html: new TextDecoder().decode(Buffer.concat(chunks)), finalUrl: res.url || u };
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\\//g, "/");

function meta(html: string, names: string[]): string | null {
  for (const n of names) {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${n}["'][^>]*content=["']([^"']+)["']`, "i"));
    if (a) return decode(a[1].trim());
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${n}["']`, "i"));
    if (b) return decode(b[1].trim());
  }
  return null;
}

type Json = Record<string, unknown>;
function productsInJsonLd(html: string): Json[] {
  const out: Json[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Json;
    const t = o["@type"];
    if (t === "Product" || (Array.isArray(t) && t.includes("Product")) || t === "ProductGroup") out.push(o);
    if (o["@graph"]) walk(o["@graph"]);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      /* broken JSON-LD: ignore */
    }
  }
  return out;
}

const firstString = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return firstString(v[0]);
  if (v && typeof v === "object") return firstString((v as Json).url ?? (v as Json).contentUrl);
  return null;
};

function priceFromProduct(p: Json): { price: number | null; currency: string | null } {
  const offersRaw = p.offers ?? (p.hasVariant as Json[] | undefined)?.map((v) => v.offers);
  const list = (Array.isArray(offersRaw) ? offersRaw : [offersRaw]).flat().filter(Boolean) as Json[];
  for (const o of list) {
    const spec = Array.isArray(o.priceSpecification) ? (o.priceSpecification[0] as Json) : (o.priceSpecification as Json | undefined);
    const raw = o.price ?? o.lowPrice ?? spec?.price;
    const price = raw === undefined ? NaN : Number(String(raw).replace(",", "."));
    if (price > 0) return { price, currency: String(o.priceCurrency ?? spec?.priceCurrency ?? "") || null };
  }
  return { price: null, currency: null };
}

export function readPage(html: string, baseUrl: string): Omit<PageInfo, "status"> {
  const products = productsInJsonLd(html);
  let image: string | null = null;
  let price: number | null = null;
  let currency: string | null = null;
  let title: string | null = null;
  const bits: string[] = [];
  for (const p of products) {
    for (const k of ["name", "description", "sku", "mpn", "gtin", "gtin13", "gtin12", "model", "releaseDate"]) {
      const v = p[k];
      if (typeof v === "string" || typeof v === "number") bits.push(decode(String(v)).slice(0, 600));
    }
    image ??= firstString(p.image);
    title ??= typeof p.name === "string" ? decode(p.name) : null;
    if (price === null) ({ price, currency } = priceFromProduct(p));
  }
  image ??= meta(html, ["og:image:secure_url", "og:image", "twitter:image", "image"]);
  title ??= meta(html, ["og:title"]);
  if (price === null) {
    const amount = meta(html, ["product:price:amount", "og:price:amount", "price"]);
    const n = amount ? Number(amount.replace(/[^\d.,]/g, "").replace(",", ".")) : NaN;
    if (n > 0) {
      price = n;
      currency = meta(html, ["product:price:currency", "og:price:currency", "priceCurrency"]);
    }
  }
  if (image) {
    try {
      image = new URL(image, baseUrl).toString();
    } catch {
      image = null;
    }
  }
  bits.push(meta(html, ["og:title"]) ?? "", meta(html, ["og:description", "description"]) ?? "", decode(html.match(/<title[^>]*>([^<]{0,300})/i)?.[1] ?? ""));
  return { stock: readAvailability(html), image, price, currency: currency?.toUpperCase() ?? null, title, text: bits.filter(Boolean).join(" | ") };
}

export async function inspectPage(url: string): Promise<PageInfo> {
  try {
    const { status, html, finalUrl } = await fetchHtml(url);
    if (!html) return { status, stock: status === 404 || status === 410 ? "out" : "unknown", image: null, price: null, currency: null, title: null, text: "" };
    return { status, ...readPage(html, finalUrl) };
  } catch {
    return { status: 0, stock: "unknown", image: null, price: null, currency: null, title: null, text: "" };
  }
}
