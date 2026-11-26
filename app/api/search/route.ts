import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProvider, classify } from "@/lib/ai";
import { COUNTRIES, homeCountry, maxCountries, searchCountries } from "@/lib/countries";
import { ebayMarkets, hasEbay, searchEbay } from "@/lib/ebay";
import { mockOffers } from "@/lib/mock";
import { contradicts } from "@/lib/attributes";
import { describe } from "@/lib/prompts";
import { checkStock } from "@/lib/stock";
import { verifyOffers } from "@/lib/verify";
import { dedupe, hasSerpApi, keywordFilter, searchCountry } from "@/lib/shopping";
import type { Offer, SearchResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const httpUrl = z.string().max(2000).refine((u) => /^https?:\/\//i.test(u), "bad url");

const Body = z.object({
  product: z.object({
    brand: z.string().max(120),
    model: z.string().max(200),
    colour: z.string().max(120),
    articleCode: z.string().max(60).nullable(),
    category: z.string().max(80),
    productType: z.string().max(120).optional(),
    features: z.array(z.string().max(120)).max(8).optional(),
    searchQuery: z.string().min(2).max(200),
    fit: z.string().max(60).optional(),
    confidence: z.enum(["high", "medium", "low"]),
    notes: z.string().max(500),
  }),
  size: z.string().max(40).optional(),
  countries: z.array(z.string().max(4)).max(40).optional(),
  // The shopper's screenshot (small JPEG, base64), used to compare result photos.
  image: z.object({ data: z.string().max(1_000_000), mime: z.enum(["image/jpeg", "image/png", "image/webp"]) }).optional(),
  // Shop pages Google Lens found for the screenshot (sent back by the page).
  lensOffers: z
    .array(
      z.object({
        source: z.literal("lens"),
        country: z.string().max(4),
        shop: z.string().max(120),
        title: z.string().max(300),
        url: httpUrl,
        thumbnail: httpUrl.nullable(),
        price: z.number().positive().max(100000),
        oldPrice: z.null(),
        shipping: z.null(),
        total: z.number().positive().max(100000),
        currency: z.string().max(4),
        rating: z.null(),
        reviews: z.null(),
        match: z.enum(["exact", "likely", "unsure"]),
        stock: z.enum(["in", "unknown"]),
      })
    )
    .max(60)
    .optional(),
});

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { product, lensOffers = [], image } = parsed.data;
  const picked = (parsed.data.countries ?? []).map((c) => c.toLowerCase()).filter((c) => c in COUNTRIES);
  const countries = [...new Set(picked.length ? picked : searchCountries())].slice(0, maxCountries());
  const home = homeCountry();

  if (!hasSerpApi() && !hasEbay()) {
    await new Promise((r) => setTimeout(r, 1200));
    const result: SearchResult = {
      offers: mockOffers(),
      similar: [],
      visualCheck: false,
      countries: countries.map((c) => c.toUpperCase()),
      sources: ["Demo"],
      usualPrice: 119.9,
      demo: true,
      warnings: ["Demo mode: sample shops and prices. Add a SerpApi key to see live prices."],
    };
    return NextResponse.json(result);
  }

  const warnings: string[] = [];
  const sources: string[] = [];
  const jobs: { label: string; run: Promise<Offer[]> }[] = [];
  if (hasSerpApi()) {
    sources.push("Google Shopping");
    for (const cc of countries) jobs.push({ label: `Google Shopping ${cc.toUpperCase()}`, run: searchCountry(product.searchQuery, cc) });
  }
  if (hasEbay()) {
    sources.push("eBay");
    for (const cc of ebayMarkets(countries)) jobs.push({ label: `eBay ${cc.toUpperCase()}`, run: searchEbay(product.searchQuery, cc, home) });
  }
  if (lensOffers.length) sources.push("Google Lens");

  const settled = await Promise.allSettled(jobs.map((j) => j.run));
  let offers: Offer[] = [...lensOffers];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") offers.push(...s.value);
    else {
      console.error(s.reason);
      warnings.push(`Could not check ${jobs[i].label} this time.`);
    }
  });

  // Hard filters (free, always on): drop listings whose title names another kind of item or another colour.
  offers = offers.filter((o) => !contradicts(o.title, product));

  // Keep only listings of the same product: checked by AI if one is set up, otherwise by search words.
  const provider = aiProvider();
  let checked = false;
  if (provider && offers.length) {
    offers = offers.slice(0, 250);
    try {
      const verdicts = await classify(product, offers.map((o) => `[${o.country}] ${o.title}`));
      offers = offers
        .map((o, i) => ({ ...o, match: (verdicts.get(i) ?? "different") as Offer["match"] | "different" }))
        .filter((o): o is Offer => o.match !== "different");
      checked = true;
    } catch (e) {
      console.error("classify failed", e);
    }
  }
  if (!checked && offers.length) {
    offers = keywordFilter(offers, product.searchQuery);
    warnings.push(
      provider
        ? "The exact-match check didn't work this time, so a few results may be similar items."
        : "Results are matched on your search words only, so a few may be similar items. A free Gemini key switches on the exact-match check."
    );
  }

  // Strict by default: only "exact" text matches go in the main list, "likely" ones go to "similar".
  let similar: Offer[] = [];
  if (checked) {
    similar = offers.filter((o) => o.match === "likely");
    offers = offers.filter((o) => o.match === "exact");
  }

  // Throw away extreme outliers (usually accessories or kids' versions that slipped through).
  const med = median(offers.map((o) => o.total));
  if (med) offers = offers.filter((o) => o.total > med * 0.3);

  offers = dedupe(offers).sort((a, b) => {
    const rank = (o: Offer) => (o.match === "exact" ? 0 : 1);
    return a.total - b.total || rank(a) - rank(b);
  });

  // Visual check: compare the photos of the cheapest candidates with the shopper's screenshot.
  let visualCheck = false;
  if (image && provider) {
    const pool = dedupe([...offers, ...similar]).sort((a, b) => a.total - b.total).slice(0, 32);
    try {
      const verdicts = await verifyOffers(image, describe(product), pool);
      offers = pool.filter((_, i) => verdicts[i] === "same").map((o) => ({ ...o, seen: true, match: "exact" as const }));
      similar = pool.filter((_, i) => verdicts[i] === "similar" || verdicts[i] === "unchecked").map((o) => ({ ...o, match: "likely" as const }));
      visualCheck = true;
    } catch (e) {
      console.error("visual check failed", e);
      warnings.push("The photo comparison didn't work this time, so results are matched on their titles only.");
    }
  }

  // Live stock check on the shop pages we link to directly (free). Out-of-stock offers are removed.
  const toCheck = [...offers.slice(0, 40), ...similar.slice(0, 10)].filter((o) => o.stock === "unknown" && o.source === "lens").slice(0, 15);
  const stock = await Promise.all(toCheck.map((o) => checkStock(o.url)));
  const gone = new Set(toCheck.filter((_, i) => stock[i] === "out"));
  toCheck.forEach((o, i) => { if (stock[i] === "in") o.stock = "in"; });
  if (gone.size) {
    offers = offers.filter((o) => !gone.has(o));
    similar = similar.filter((o) => !gone.has(o));
  }

  // "Usual price": the typical price in the shopper's home country, otherwise the typical listed price.
  const homePrices = offers.filter((o) => o.country === home.toUpperCase()).map((o) => o.oldPrice ?? o.total);
  const usualPrice = median(homePrices.length ? homePrices : offers.map((o) => o.oldPrice ?? o.total));

  const result: SearchResult = {
    offers: offers.slice(0, 40),
    similar: dedupe(similar).sort((a, b) => a.total - b.total).slice(0, 20),
    visualCheck,
    countries: countries.map((c) => c.toUpperCase()),
    sources,
    usualPrice,
    demo: false,
    warnings,
  };
  return NextResponse.json(result);
}
