// Screenshot recognition with Google Lens, through the SerpApi key you already have.
// Costs 1 SerpApi search per screenshot. Image upload to SerpApi is free (max 500 KB, kept 10 minutes).
import { eurRates, toEur } from "./currency";
import { serpApiKey } from "./env";
import type { Offer, Product } from "./types";

type LensMatch = {
  title?: string;
  link?: string;
  source?: string;
  thumbnail?: string;
  price?: { value?: string; extracted_value?: number; currency?: string };
  in_stock?: boolean;
};

export async function uploadImage(image: Blob): Promise<string> {
  const form = new FormData();
  form.append("image", image, "screenshot.jpg");
  form.append("api_key", serpApiKey()!);
  const res = await fetch("https://serpapi.com/image", { method: "POST", body: form, signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as { image_id?: string; error?: string };
  if (!res.ok || !data.image_id) throw new Error(`Image upload failed: ${data.error ?? res.status}`);
  return data.image_id;
}

export async function lensSearch(imageId: string, country: string): Promise<LensMatch[]> {
  const params = new URLSearchParams({ engine: "google_lens", image_id: imageId, country, hl: "en", api_key: serpApiKey()! });
  const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(30_000) });
  const data = (await res.json().catch(() => ({}))) as { visual_matches?: LensMatch[]; error?: string };
  if (!res.ok) throw new Error(`Google Lens failed: ${data.error ?? res.status}`);
  return data.visual_matches ?? [];
}

const TLD_COUNTRY: Record<string, string> = {
  nl: "NL", be: "BE", de: "DE", fr: "FR", it: "IT", es: "ES", at: "AT", pt: "PT", ie: "IE", fi: "FI",
  pl: "PL", dk: "DK", se: "SE", lu: "LU", uk: "UK", ch: "CH", eu: "EU",
};
const CURRENCY_SIGN: Record<string, string> = { "€": "EUR", "£": "GBP", $: "USD", "zł": "PLN", kr: "SEK" };

export function countryFromUrl(url: string): string {
  try {
    const tld = new URL(url).hostname.split(".").pop() || "";
    return TLD_COUNTRY[tld] ?? "INT";
  } catch {
    return "INT";
  }
}

// Visual matches that show a price are real shop pages selling (something very like) the item: use them as offers.
export async function lensOffers(matches: LensMatch[]): Promise<Offer[]> {
  const rates = await eurRates();
  const out: Offer[] = [];
  for (const m of matches) {
    const v = m.price?.extracted_value;
    if (!v || !m.link || !m.title || m.in_stock === false) continue;
    let cur = (m.price?.currency || "").trim();
    cur = CURRENCY_SIGN[cur] ?? (cur.length === 3 ? cur.toUpperCase() : "EUR");
    if (!["EUR", "PLN", "DKK", "SEK"].includes(cur)) continue; // EU shops only (no import duties)
    const price = toEur(v, cur, rates);
    out.push({
      source: "lens",
      country: countryFromUrl(m.link),
      shop: m.source || new URL(m.link).hostname.replace(/^www\./, ""),
      title: m.title,
      url: m.link,
      thumbnail: m.thumbnail ?? null,
      price,
      oldPrice: null,
      shipping: null,
      total: price,
      currency: cur,
      rating: null,
      reviews: null,
      match: "unsure",
      stock: m.in_stock === true ? "in" : "unknown",
    });
  }
  return out;
}

// Without an AI: build a product name from the words most Lens titles agree on.
export function productFromTitles(titles: string[]): Product | null {
  const clean = titles
    .slice(0, 12)
    .map((t) => t.split(/\s[|–—-]\s|\s·\s/)[0].replace(/[()[\],'"‘’“”]/g, " ").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 3);
  if (!clean.length) return null;
  const count = new Map<string, number>();
  for (const t of clean) for (const w of new Set(t.toLowerCase().split(" "))) count.set(w, (count.get(w) ?? 0) + 1);
  const min = Math.max(2, Math.ceil(clean.length * 0.35));
  // Use the first title that contains the most of the agreed words, keeping its word order and spelling.
  const agreed = (t: string) => t.split(" ").filter((w) => (count.get(w.toLowerCase()) ?? 0) >= min);
  const best = [...clean].sort((a, b) => agreed(b).length - agreed(a).length)[0];
  let words = agreed(best);
  if (words.length < 2) words = best.split(" ").slice(0, 6);
  const query = words.slice(0, 8).join(" ");
  return {
    brand: words[0] ?? "",
    model: query,
    colour: "not specified",
    articleCode: null,
    category: "product",
    searchQuery: query,
    confidence: clean.length >= 4 && agreed(best).length >= 2 ? "medium" : "low",
    notes: "Recognised with Google Lens. Check the name and add the colour if needed.",
  };
}
