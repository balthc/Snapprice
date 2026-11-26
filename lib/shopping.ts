import { COUNTRIES } from "./countries";
import { eurRates, toEur } from "./currency";
import { serpApiKey } from "./env";
import type { Offer } from "./types";

export const hasSerpApi = () => Boolean(serpApiKey());

type SerpShoppingItem = {
  title?: string;
  immersive_product_page_token?: string;
  source?: string;
  link?: string;
  product_link?: string;
  thumbnail?: string;
  price?: string;
  extracted_price?: number;
  old_price?: string;
  extracted_old_price?: number;
  delivery?: string;
  extensions?: string[];
  tag?: string;
  snippet?: string;
  rating?: number;
  reviews?: number;
};

// Pulls a shipping cost out of texts like "Free delivery", "+€4.95 delivery", "Versand: 3,99 €", "Spedizione gratuita".
export function parseShipping(text?: string): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/(free|gratis|gratuit|kostenlos|gratuita|gratuito|darmowa|fri |gratuite)/.test(t)) return 0;
  // Only trust numbers next to a currency sign or written as a price (e.g. 4,95), not dates like "by 12 Dec".
  const m = t.match(/(?:€|eur|zł|pln|kr|sek|dkk)\s*(\d+(?:[.,]\d{1,2})?)|(\d+[.,]\d{2})|(\d+)\s*(?:€|eur|zł|pln|kr)/);
  if (!m) return null;
  return parseFloat((m[1] || m[2] || m[3]).replace(",", "."));
}

const OUT_OF_STOCK =
  /(out of stock|sold out|niet (meer )?(op voorraad|leverbaar)|uitverkocht|nicht (auf lager|vorrätig|verfügbar)|ausverkauft|esaurito|non disponibile|rupture de stock|épuisé|agotado|sin stock|brak w magazynie|wyprzedane|udsolgt|slutsåld)/i;

// Remembers results for 6 hours while this server instance runs, so repeat searches cost no SerpApi credits.
// (SerpApi also serves identical searches from its own 1-hour cache for free.)
const cache = new Map<string, { at: number; offers: Offer[] }>();
const CACHE_MS = 6 * 3600_000;

export async function searchCountry(query: string, cc: string): Promise<Offer[]> {
  const key = `${cc}|${query.toLowerCase().trim()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.offers.map((o) => ({ ...o }));
  const offers = await fetchCountry(query, cc);
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), offers });
  return offers.map((o) => ({ ...o }));
}

async function fetchCountry(query: string, cc: string): Promise<Offer[]> {
  const c = COUNTRIES[cc];
  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    gl: cc,
    hl: c.hl,
    google_domain: c.domain,
    num: "40",
    api_key: serpApiKey()!,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`SerpApi ${cc.toUpperCase()} ${res.status}`);
  const data = (await res.json()) as { shopping_results?: SerpShoppingItem[]; error?: string };
  if (data.error && !data.shopping_results) {
    if (/hasn't returned any results/i.test(data.error)) return [];
    throw new Error(`SerpApi ${cc.toUpperCase()}: ${data.error}`);
  }
  const rates = await eurRates();
  const offers: Offer[] = [];
  for (const it of data.shopping_results ?? []) {
    // Google mostly lists in-stock offers already; drop any that say otherwise.
    if (OUT_OF_STOCK.test([it.delivery, it.tag, it.snippet, ...(it.extensions ?? [])].join(" "))) continue;
    if (!it.extracted_price || !it.title || !(it.link || it.product_link || it.immersive_product_page_token)) continue;
    const price = toEur(it.extracted_price, c.currency, rates);
    const oldPrice = it.extracted_old_price ? toEur(it.extracted_old_price, c.currency, rates) : null;
    const shipRaw = parseShipping(it.delivery);
    const shipping = shipRaw === null ? null : toEur(shipRaw, c.currency, rates);
    // Google Shopping only gives a link to Google's own product page. Our /api/go link looks up the
    // shop's own product page when the shopper clicks (1 SerpApi search per click, repeat clicks are cached).
    const url = it.link
      ? it.link
      : `/api/go?${new URLSearchParams({
          ...(it.immersive_product_page_token ? { t: it.immersive_product_page_token } : {}),
          s: it.source || "",
          ...(it.product_link ? { f: it.product_link } : {}),
        })}`;
    offers.push({
      source: "google",
      country: cc.toUpperCase(),
      shop: it.source || "Unknown shop",
      title: it.title,
      url,
      thumbnail: it.thumbnail ?? null,
      price,
      oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
      shipping,
      total: Math.round((price + (shipping ?? 0)) * 100) / 100,
      currency: c.currency,
      rating: it.rating ?? null,
      reviews: it.reviews ?? null,
      match: "unsure",
      stock: "unknown",
    });
  }
  return offers;
}

// Cheap safety net used when Claude is not configured: the brand must appear in the title.
export function brandFilter(offers: Offer[], brand: string): Offer[] {
  const words = brand.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return offers;
  return offers.filter((o) => words.some((w) => o.title.toLowerCase().includes(w)));
}

// Used when no AI is configured: the first word (usually the brand) and most other search words must appear in the title.
export function keywordFilter(offers: Offer[], query: string): Offer[] {
  const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = [...new Set(norm(query).split(/[^a-z0-9]+/).filter((w) => w.length > 1))];
  if (!words.length) return offers;
  const need = Math.max(1, Math.ceil(words.length * 0.6));
  return offers.filter((o) => {
    const t = norm(o.title);
    return t.includes(words[0]) && words.filter((w) => t.includes(w)).length >= need;
  });
}

// The same shop often shows up in several countries' results (and in Lens); keep its cheapest offer.
export function dedupe(offers: Offer[]): Offer[] {
  const best = new Map<string, Offer>();
  for (const o of offers) {
    const key = o.shop.toLowerCase().replace(/^www\./, "").replace(/\.(com|co\.uk|[a-z]{2})$/, "");
    const cur = best.get(key);
    if (!cur || o.total < cur.total) best.set(key, o);
  }
  return [...best.values()];
}
