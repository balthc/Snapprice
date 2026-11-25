import { COUNTRIES } from "./countries";
import { eurRates, toEur } from "./currency";
import type { Offer } from "./types";

export const hasSerpApi = () => Boolean(process.env.SERPAPI_API_KEY);

type SerpShoppingItem = {
  title?: string;
  source?: string;
  link?: string;
  product_link?: string;
  thumbnail?: string;
  price?: string;
  extracted_price?: number;
  old_price?: string;
  extracted_old_price?: number;
  delivery?: string;
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

export async function searchCountry(query: string, cc: string): Promise<Offer[]> {
  const c = COUNTRIES[cc];
  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    gl: cc,
    hl: c.hl,
    google_domain: c.domain,
    num: "40",
    api_key: process.env.SERPAPI_API_KEY!,
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
    if (!it.extracted_price || !it.title || !(it.link || it.product_link)) continue;
    const price = toEur(it.extracted_price, c.currency, rates);
    const oldPrice = it.extracted_old_price ? toEur(it.extracted_old_price, c.currency, rates) : null;
    const shipRaw = parseShipping(it.delivery);
    const shipping = shipRaw === null ? null : toEur(shipRaw, c.currency, rates);
    offers.push({
      country: cc.toUpperCase(),
      shop: it.source || "Unknown shop",
      title: it.title,
      url: it.link || it.product_link!,
      thumbnail: it.thumbnail ?? null,
      price,
      oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
      shipping,
      total: Math.round((price + (shipping ?? 0)) * 100) / 100,
      currency: c.currency,
      rating: it.rating ?? null,
      reviews: it.reviews ?? null,
      match: "unsure",
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

// Used when Claude is not configured: most of the search words must appear in the listing title.
export function keywordFilter(offers: Offer[], query: string): Offer[] {
  const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = [...new Set(norm(query).split(/[^a-z0-9]+/).filter((w) => w.length > 2))];
  if (!words.length) return offers;
  const need = Math.max(1, Math.ceil(words.length * 0.75));
  return offers.filter((o) => {
    const t = norm(o.title);
    return words.filter((w) => t.includes(w)).length >= need;
  });
}

// Same shop listing the same price in several countries shows up repeatedly; keep the cheapest per shop.
export function dedupe(offers: Offer[]): Offer[] {
  const best = new Map<string, Offer>();
  for (const o of offers) {
    const key = o.shop.toLowerCase().replace(/\.(com|nl|de|it|fr|es|be|eu)$/, "");
    const cur = best.get(key);
    if (!cur || o.total < cur.total) best.set(key, o);
  }
  return [...best.values()];
}
