import { COUNTRIES } from "./countries";
import { eurRates, toEur } from "./currency";
import { searchApiKey, serpApiKey, serperKey } from "./env";
import type { Offer } from "./types";

export const hasSerpApi = () => Boolean(serpApiKey());
// Any Google Shopping provider configured (SerpApi, Serper or SearchAPI).
export const hasShopping = () => Boolean(serpApiKey() || serperKey() || searchApiKey());

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
  const offers = await rotate(query, cc);
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), offers });
  return offers.map((o) => ({ ...o }));
}

// --- Provider rotation --------------------------------------------------------------------------
// Each provider has its own free allowance. When one runs out (or fails), the next one takes over.
type Provider = { name: string; on: () => boolean; run: (q: string, cc: string) => Promise<Offer[]> };
const PROVIDERS: Provider[] = [
  { name: "SerpApi", on: () => Boolean(serpApiKey()), run: (q, cc) => serpapiCountry(q, cc) },
  { name: "Serper", on: () => Boolean(serperKey()), run: (q, cc) => serperCountry(q, cc) },
  { name: "SearchAPI", on: () => Boolean(searchApiKey()), run: (q, cc) => searchapiCountry(q, cc) },
];
const restingUntil = new Map<string, number>(); // provider → time it may be tried again

export class QuotaError extends Error {}
const isQuota = (status: number, msg = "") =>
  [401, 402, 403, 429].includes(status) || /(run out|limit|credits|quota|exceeded|plan|searches left)/i.test(msg);

export function activeProviders(): string[] {
  return PROVIDERS.filter((p) => p.on()).map((p) => p.name);
}

async function rotate(query: string, cc: string): Promise<Offer[]> {
  let lastErr: unknown = new Error("No price provider configured");
  for (const p of PROVIDERS) {
    if (!p.on() || (restingUntil.get(p.name) ?? 0) > Date.now()) continue;
    try {
      return await p.run(query, cc);
    } catch (e) {
      lastErr = e;
      // Out of credits: rest this provider for 6 hours. Other errors: just try the next one.
      if (e instanceof QuotaError) restingUntil.set(p.name, Date.now() + 6 * 3600_000);
      console.error(`${p.name} ${cc}:`, (e as Error).message);
    }
  }
  throw lastErr;
}

// Parses "€71,94", "1.299,00 €", "£45.00", "45 zł" into a number.
export function parsePrice(text?: string | number | null): number | null {
  if (typeof text === "number") return text;
  if (!text) return null;
  const m = text.replace(/\s/g, "").match(/\d[\d.,]*/);
  if (!m) return null;
  let n = m[0];
  const lastSep = Math.max(n.lastIndexOf(","), n.lastIndexOf("."));
  if (lastSep >= 0 && n.length - lastSep - 1 === 2) {
    n = n.slice(0, lastSep).replace(/[.,]/g, "") + "." + n.slice(lastSep + 1);
  } else {
    n = n.replace(/[.,]/g, "");
  }
  const v = parseFloat(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

async function serperCountry(query: string, cc: string): Promise<Offer[]> {
  const c = COUNTRIES[cc];
  const res = await fetch("https://google.serper.dev/shopping", {
    method: "POST",
    headers: { "X-API-KEY": serperKey()!, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: cc === "uk" ? "gb" : cc, hl: c.hl, num: 40 }),
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    shopping?: { title?: string; source?: string; link?: string; price?: string; delivery?: string; imageUrl?: string; rating?: number; ratingCount?: number }[];
    message?: string;
  };
  if (!res.ok) {
    if (isQuota(res.status, data.message)) throw new QuotaError(`Serper: ${data.message ?? res.status}`);
    throw new Error(`Serper ${res.status}`);
  }
  const rates = await eurRates();
  const out: Offer[] = [];
  for (const it of data.shopping ?? []) {
    const raw = parsePrice(it.price);
    if (!raw || !it.title || !it.link) continue;
    if (OUT_OF_STOCK.test(it.delivery ?? "")) continue;
    const price = toEur(raw, c.currency, rates);
    const ship = parseShipping(it.delivery);
    const shipping = ship === null ? null : toEur(ship, c.currency, rates);
    out.push({
      source: "google", country: cc.toUpperCase(), shop: it.source || "Shop", title: it.title, url: it.link,
      thumbnail: it.imageUrl ?? null, price, oldPrice: null, shipping, total: Math.round((price + (shipping ?? 0)) * 100) / 100,
      currency: c.currency, rating: it.rating ?? null, reviews: it.ratingCount ?? null, match: "unsure", stock: "unknown",
    });
  }
  return out;
}

async function searchapiCountry(query: string, cc: string): Promise<Offer[]> {
  const c = COUNTRIES[cc];
  const params = new URLSearchParams({ engine: "google_shopping", q: query, gl: cc === "uk" ? "gb" : cc, hl: c.hl, api_key: searchApiKey()! });
  const res = await fetch(`https://www.searchapi.io/api/v1/search?${params}`, { signal: AbortSignal.timeout(25_000) });
  const data = (await res.json().catch(() => ({}))) as {
    shopping_results?: {
      title?: string; seller?: string; product_link?: string; price?: string; extracted_price?: number; extracted_original_price?: number;
      delivery?: string; thumbnail?: string; rating?: number; reviews?: number;
    }[];
    error?: string;
  };
  if (!res.ok || (data.error && !data.shopping_results)) {
    if (isQuota(res.status, data.error)) throw new QuotaError(`SearchAPI: ${data.error ?? res.status}`);
    throw new Error(`SearchAPI ${res.status}: ${data.error ?? ""}`);
  }
  const rates = await eurRates();
  const out: Offer[] = [];
  for (const it of data.shopping_results ?? []) {
    const raw = it.extracted_price ?? parsePrice(it.price);
    if (!raw || !it.title || !it.product_link) continue;
    if (OUT_OF_STOCK.test(it.delivery ?? "")) continue;
    const price = toEur(raw, c.currency, rates);
    const old = it.extracted_original_price ? toEur(it.extracted_original_price, c.currency, rates) : null;
    const ship = parseShipping(it.delivery);
    const shipping = ship === null ? null : toEur(ship, c.currency, rates);
    out.push({
      source: "google", country: cc.toUpperCase(), shop: it.seller || "Shop", title: it.title, url: it.product_link,
      thumbnail: it.thumbnail ?? null, price, oldPrice: old && old > price ? old : null, shipping,
      total: Math.round((price + (shipping ?? 0)) * 100) / 100, currency: c.currency, rating: it.rating ?? null, reviews: it.reviews ?? null,
      match: "unsure", stock: "unknown",
    });
  }
  return out;
}

async function serpapiCountry(query: string, cc: string): Promise<Offer[]> {
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
  const data = (await res.json().catch(() => ({}))) as { shopping_results?: SerpShoppingItem[]; error?: string };
  if (data.error && /hasn't returned any results/i.test(data.error)) return [];
  if (!res.ok || (data.error && !data.shopping_results)) {
    if (isQuota(res.status, data.error)) throw new QuotaError(`SerpApi: ${data.error ?? res.status}`);
    throw new Error(`SerpApi ${cc.toUpperCase()} ${res.status}: ${data.error ?? ""}`);
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
