import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProvider, classify } from "@/lib/ai";
import { homeCountry, searchCountries } from "@/lib/countries";
import { ebayMarkets, hasEbay, searchEbay } from "@/lib/ebay";
import { mockOffers } from "@/lib/mock";
import { dedupe, hasSerpApi, keywordFilter, searchCountry } from "@/lib/shopping";
import type { Offer, SearchResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const httpUrl = z.string().max(2000).refine((u) => /^https?:\/\//i.test(u), "bad url");

const Body = z.object({
  product: z.object({
    brand: z.string().max(120),
    model: z.string().max(200),
    colour: z.string().max(120),
    articleCode: z.string().max(60).nullable(),
    category: z.string().max(80),
    searchQuery: z.string().min(2).max(200),
    confidence: z.enum(["high", "medium", "low"]),
    notes: z.string().max(500),
  }),
  size: z.string().max(40).optional(),
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
  const { product, lensOffers = [] } = parsed.data;
  const countries = searchCountries();
  const home = homeCountry();

  if (!hasSerpApi() && !hasEbay()) {
    await new Promise((r) => setTimeout(r, 1200));
    const result: SearchResult = {
      offers: mockOffers(),
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

  // Throw away extreme outliers (usually accessories or kids' versions that slipped through).
  const med = median(offers.map((o) => o.total));
  if (med) offers = offers.filter((o) => o.total > med * 0.3);

  offers = dedupe(offers).sort((a, b) => {
    const rank = (o: Offer) => (o.match === "exact" ? 0 : 1);
    return a.total - b.total || rank(a) - rank(b);
  });

  // "Usual price": the typical price in the shopper's home country, otherwise the typical listed price.
  const homePrices = offers.filter((o) => o.country === home.toUpperCase()).map((o) => o.oldPrice ?? o.total);
  const usualPrice = median(homePrices.length ? homePrices : offers.map((o) => o.oldPrice ?? o.total));

  const result: SearchResult = {
    offers: offers.slice(0, 40),
    countries: countries.map((c) => c.toUpperCase()),
    sources,
    usualPrice,
    demo: false,
    warnings,
  };
  return NextResponse.json(result);
}
