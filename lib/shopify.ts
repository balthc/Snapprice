// Free extra shops: many independent European fashion and sneaker shops run on Shopify, and every
// Shopify shop has a public product search (/search/suggest.json) that its own search bar uses.
// No key, no cost. Shops that don't answer (not on Shopify, or blocking) are skipped automatically
// and rested for 6 hours. Edit the list below, or set SHOPIFY_SHOPS in Vercel to replace it:
//   SHOPIFY_SHOPS=patta.nl:NL:EUR,naked-copenhagen.com:DK:DKK
import { eurRates, toEur } from "./currency";
import type { Offer } from "./types";

type Shop = { domain: string; country: string; currency: string };

// Starting list (well-known independent EU shops). /api/shops shows which ones answer.
const DEFAULT_SHOPS =
  "www.patta.nl:NL:EUR,www.asphaltgold.com:DE:EUR,www.afew-store.com:DE:EUR,www.naked-copenhagen.com:DK:DKK," +
  "www.nittygrittystore.com:SE:SEK,www.norsestore.com:DK:EUR,www.oqium.com:NL:EUR,www.sneakerdistrict.com:NL:EUR," +
  "www.stoy.com:NL:EUR,www.thenextdoor.fr:FR:EUR,www.wodstore.com:FR:EUR,www.firmament.berlin:DE:EUR," +
  "www.uebervart-shop.de:DE:EUR,www.baskets-store.com:BE:EUR,www.livestock.nl:NL:EUR,www.thegoodstore.nl:NL:EUR," +
  "www.lessoeurs.com:NL:EUR,www.titan22.com:CY:EUR,www.footdistrict.com:ES:EUR,www.sivasdescalzo.com:ES:EUR";

export function shopifyShops(): Shop[] {
  const raw = (process.env.SHOPIFY_SHOPS || "").trim() || DEFAULT_SHOPS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [domain, country = "EU", currency = "EUR"] = s.split(":").map((x) => x.trim());
      return { domain: domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""), country: country.toUpperCase(), currency: currency.toUpperCase() };
    });
}

export const hasShopify = () => (process.env.SHOPIFY_ENABLED || "true").trim().toLowerCase() !== "false" && shopifyShops().length > 0;

const resting = new Map<string, number>(); // domain -> until (ms)
const REST_MS = 6 * 3600_000;

type SuggestProduct = {
  title?: string;
  url?: string;
  price?: string | number;
  compare_at_price_max?: string | number;
  available?: boolean;
  image?: string;
  featured_image?: { url?: string };
  vendor?: string;
};

// Shopify sends prices as "129.00" (or in cents on a few themes; values without a decimal point
// that are 100x the max price are treated as cents).
function money(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v);
  const n = Number(s.replace(",", "."));
  if (!(n > 0)) return null;
  return !s.includes(".") && n >= 10000 ? n / 100 : n;
}

export async function searchShop(shop: Shop, query: string): Promise<Offer[] | null> {
  const until = resting.get(shop.domain);
  if (until && until > Date.now()) return [];
  const params = new URLSearchParams({ q: query, "resources[type]": "product", "resources[limit]": "10", "resources[options][unavailable_products]": "hide" });
  try {
    const res = await fetch(`https://${shop.domain}/search/suggest.json?${params}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SnappriceBot/1.0; price comparison)", Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.includes("json")) throw new Error(String(res.status));
    const data = (await res.json()) as { resources?: { results?: { products?: SuggestProduct[] } } };
    const products = data.resources?.results?.products;
    if (!Array.isArray(products)) throw new Error("not shopify");
    const rates = await eurRates();
    const out: Offer[] = [];
    for (const p of products) {
      const amount = money(p.price);
      if (!p.title || !p.url || !amount || p.available === false) continue;
      const price = toEur(amount, shop.currency, rates);
      const was = money(p.compare_at_price_max);
      const old = was ? toEur(was, shop.currency, rates) : null;
      const img = p.featured_image?.url || p.image || null;
      out.push({
        source: "shop",
        country: shop.country,
        shop: shop.domain.replace(/^www\./, ""),
        title: [p.vendor && !p.title.toLowerCase().includes(p.vendor.toLowerCase()) ? p.vendor : "", p.title].filter(Boolean).join(" "),
        url: new URL(p.url, `https://${shop.domain}`).toString().replace(/\?_pos=.*$/, ""),
        thumbnail: img ? (img.startsWith("//") ? `https:${img}` : img) : null,
        price,
        oldPrice: old && old > price ? old : null,
        shipping: null,
        total: price,
        currency: shop.currency,
        rating: null,
        reviews: null,
        match: "unsure",
        stock: p.available === true ? "in" : "unknown",
      });
    }
    return out;
  } catch {
    resting.set(shop.domain, Date.now() + REST_MS);
    return null;
  }
}

export async function searchShopify(query: string, countries: string[]): Promise<Offer[]> {
  const wanted = new Set(countries.map((c) => c.toUpperCase()));
  const shops = shopifyShops().filter((s) => wanted.has(s.country) || s.country === "EU");
  const results = await Promise.all(shops.map((s) => searchShop(s, query)));
  return results.flatMap((r) => r ?? []);
}
