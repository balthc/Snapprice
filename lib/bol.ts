// bol.com (NL/BE's biggest webshop, with thousands of partner sellers) through its free Marketing
// Catalog API for affiliates. Needs a bol.com partner (affiliate) account:
//   BOL_CLIENT_ID / BOL_CLIENT_SECRET  (Partner platform → Account → Open API)
//   BOL_SITE_ID (optional)             your partner site id, so clicks earn commission
import { bolClientId, bolClientSecret, bolSiteId } from "./env";
import type { Offer } from "./types";

export const hasBol = () => Boolean(bolClientId() && bolClientSecret());

let token: { value: string; until: number } | null = null;
async function getToken(): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const auth = Buffer.from(`${bolClientId()}:${bolClientSecret()}`).toString("base64");
  const res = await fetch("https://login.bol.com/token?grant_type=client_credentials", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json", "Content-Length": "0" },
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new Error(`bol.com login failed (${res.status})`);
  token = { value: data.access_token, until: Date.now() + ((data.expires_in ?? 299) - 30) * 1000 };
  return token.value;
}

const affiliate = (url: string) => {
  const site = bolSiteId();
  return site ? `https://partner.bol.com/click/click?p=2&t=url&s=${encodeURIComponent(site)}&f=TXL&url=${encodeURIComponent(url)}` : url;
};

type BolProduct = {
  ean?: string;
  title?: string;
  url?: string;
  image?: { url?: string };
  offer?: { price?: number; strikethroughPrice?: number; deliveryDescription?: string };
};

export async function searchBol(query: string, countries: string[]): Promise<Offer[]> {
  const wanted = ["NL", "BE"].filter((c) => countries.map((x) => x.toUpperCase()).includes(c));
  const out: Offer[] = [];
  for (const cc of wanted) {
    const params = new URLSearchParams({ "search-term": query, "country-code": cc, "page-size": "50", "include-offer": "true", "include-image": "true" });
    const res = await fetch(`https://api.bol.com/marketing/catalog/v1/products/search?${params}`, {
      headers: { Authorization: `Bearer ${await getToken()}`, Accept: "application/json", "Accept-Language": cc === "BE" ? "nl-BE" : "nl-NL" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`bol.com ${res.status}`);
    const data = (await res.json()) as { results?: BolProduct[] };
    for (const p of data.results ?? []) {
      const price = p.offer?.price;
      if (!price || !p.title || !p.url) continue; // no offer = not available
      const free = /gratis|free/i.test(p.offer?.deliveryDescription ?? "") || price >= 25; // bol ships free from €25
      out.push({
        source: "shop", country: cc, shop: "bol.com", title: p.title, url: affiliate(p.url), thumbnail: p.image?.url ?? null,
        price, oldPrice: p.offer?.strikethroughPrice && p.offer.strikethroughPrice > price ? p.offer.strikethroughPrice : null,
        shipping: free ? 0 : null, total: price, currency: "EUR", rating: null, reviews: null, match: "unsure", stock: "in",
      });
    }
    if (wanted.length > 1) break; // NL and BE share the same catalogue and prices; one call is enough
  }
  return out;
}
