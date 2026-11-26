// Free extra source: eBay's official Browse API (free developer account, 5,000 calls a day).
// Covers eBay in NL, BE, DE, FR, IT, ES, AT, IE, PL, including many shops that also sell on eBay.
// Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET (from https://developer.ebay.com, "Production" keyset).
import { eurRates, toEur } from "./currency";
import { ebayClientId, ebayClientSecret } from "./env";
import type { Offer } from "./types";

export const hasEbay = () => Boolean(ebayClientId() && ebayClientSecret());

const MARKETS: Record<string, string> = {
  nl: "EBAY_NL", be: "EBAY_BE", de: "EBAY_DE", fr: "EBAY_FR", it: "EBAY_IT", es: "EBAY_ES", at: "EBAY_AT", ie: "EBAY_IE", pl: "EBAY_PL",
};

let token: { value: string; until: number } | null = null;
async function getToken(): Promise<string> {
  if (token && Date.now() < token.until) return token.value;
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${ebayClientId()}:${ebayClientSecret()}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`eBay login failed: ${data.error_description ?? res.status}`);
  token = { value: data.access_token, until: Date.now() + ((data.expires_in ?? 7200) - 120) * 1000 };
  return token.value;
}

type Money = { value?: string; currency?: string };
type Item = {
  title?: string;
  itemWebUrl?: string;
  price?: Money;
  marketingPrice?: { originalPrice?: Money };
  image?: { imageUrl?: string };
  shippingOptions?: { shippingCost?: Money }[];
  seller?: { username?: string; feedbackPercentage?: string; feedbackScore?: number };
  itemLocation?: { country?: string };
};

export function ebayMarkets(countries: string[]): string[] {
  return countries.filter((c) => c in MARKETS);
}

export async function searchEbay(query: string, cc: string, home: string): Promise<Offer[]> {
  const params = new URLSearchParams({ q: query, limit: "50", filter: "conditions:{NEW},buyingOptions:{FIXED_PRICE}" });
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      "X-EBAY-C-MARKETPLACE-ID": MARKETS[cc],
      // Ask eBay for shipping costs to the shopper's country.
      "X-EBAY-C-ENDUSERCTX": `contextualLocation=${encodeURIComponent(`country=${home.toUpperCase()}`)}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`eBay ${cc.toUpperCase()} ${res.status}`);
  const data = (await res.json()) as { itemSummaries?: Item[] };
  const rates = await eurRates();
  const offers: Offer[] = [];
  for (const it of data.itemSummaries ?? []) {
    const v = parseFloat(it.price?.value ?? "");
    if (!v || !it.title || !it.itemWebUrl) continue;
    const cur = it.price?.currency || "EUR";
    const price = toEur(v, cur, rates);
    const shipRaw = it.shippingOptions?.[0]?.shippingCost;
    const shipping = shipRaw?.value ? toEur(parseFloat(shipRaw.value), shipRaw.currency || cur, rates) : null;
    const orig = parseFloat(it.marketingPrice?.originalPrice?.value ?? "");
    const oldPrice = orig ? toEur(orig, it.marketingPrice?.originalPrice?.currency || cur, rates) : null;
    const fb = parseFloat(it.seller?.feedbackPercentage ?? "");
    offers.push({
      source: "ebay",
      country: (it.itemLocation?.country || cc).toUpperCase(),
      shop: `eBay · ${it.seller?.username ?? "seller"}`,
      title: it.title,
      url: it.itemWebUrl,
      thumbnail: it.image?.imageUrl ?? null,
      price,
      oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
      shipping,
      total: Math.round((price + (shipping ?? 0)) * 100) / 100,
      currency: cur,
      rating: fb ? Math.round((fb / 20) * 10) / 10 : null, // 98% feedback → 4.9 stars
      reviews: it.seller?.feedbackScore ?? null,
      match: "unsure",
      stock: "in", // eBay search only returns live listings that can be bought now
    });
  }
  return offers;
}
