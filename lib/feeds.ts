// Products from affiliate feeds (Awin, Daisycon, TradeTracker, ...) imported nightly into a free
// Postgres database (Supabase or Neon). Unlimited searches, direct links, stock and sizes, and
// a commission per sale. Only active when DATABASE_URL is set.
import postgres from "postgres";
import { eurRates, toEur } from "./currency";
import { databaseUrl } from "./env";
import type { Offer, Product } from "./types";

export const hasFeeds = () => Boolean(databaseUrl());

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  const url = databaseUrl()!;
  sql ??= postgres(url, { max: 3, idle_timeout: 20, prepare: false, connect_timeout: 5, ssl: /sslmode=disable/.test(url) ? false : "require" });
  return sql;
}

type Row = {
  merchant: string; country: string; title: string; colour: string | null; size: string | null; price: string;
  old_price: string | null; shipping: string | null; currency: string; url: string; image: string | null;
};

// Never let the partner database slow down or break a search: give up after 8 seconds.
export async function searchFeeds(product: Product, countries: string[]): Promise<Offer[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("feeds timeout")), 8000); });
  try {
    return await Promise.race([queryFeeds(product, countries), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function queryFeeds(product: Product, countries: string[]): Promise<Offer[]> {
  const words = product.searchQuery
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/i)
    .filter((w) => w.length > 1)
    .slice(0, 8);
  if (!words.length) return [];
  // Brand and at least most words must match: tsquery "brand & (w1 | w2 ...)" is too loose, so require all words
  // except colour/fit, which feeds often store in a separate column.
  const core = words.filter((w) => !(product.colour || "").toLowerCase().includes(w) && !(product.fit || "").toLowerCase().includes(w));
  const tsq = (core.length ? core : words).map((w) => w.replace(/'/g, "") + ":*").join(" & ");
  const rows = await db()<Row[]>`
    select merchant, country, title, colour, size, price, old_price, shipping, currency, url, image
    from products
    where in_stock and search @@ to_tsquery('simple', ${tsq})
      and country = any(${countries.map((c) => c.toUpperCase())})
    order by price asc
    limit 200`;
  const rates = await eurRates();
  return rows.map((r) => {
    const price = toEur(Number(r.price), r.currency, rates);
    const shipping = r.shipping === null ? null : toEur(Number(r.shipping), r.currency, rates);
    const old = r.old_price ? toEur(Number(r.old_price), r.currency, rates) : null;
    return {
      source: "feed" as const,
      country: r.country,
      shop: r.merchant,
      title: [r.title, r.colour && !r.title.toLowerCase().includes(r.colour.toLowerCase()) ? r.colour : ""].filter(Boolean).join(" · "),
      url: r.url,
      thumbnail: r.image,
      price,
      oldPrice: old && old > price ? old : null,
      shipping,
      total: Math.round((price + (shipping ?? 0)) * 100) / 100,
      currency: r.currency,
      rating: null,
      reviews: null,
      match: "unsure" as const,
      stock: "in" as const, // feeds include stock; out-of-stock products aren't searched
    };
  });
}
