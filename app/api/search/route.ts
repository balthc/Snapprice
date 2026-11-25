import { NextResponse } from "next/server";
import { z } from "zod";
import { classifyListings, hasClaude } from "@/lib/claude";
import { homeCountry, searchCountries } from "@/lib/countries";
import { mockOffers } from "@/lib/mock";
import { brandFilter, dedupe, hasSerpApi, searchCountry } from "@/lib/shopping";
import type { Offer, SearchResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const { product } = parsed.data;
  const countries = searchCountries();
  const home = homeCountry().toUpperCase();

  if (!hasSerpApi()) {
    await new Promise((r) => setTimeout(r, 1200));
    const offers = mockOffers();
    const result: SearchResult = {
      offers,
      countries: countries.map((c) => c.toUpperCase()),
      usualPrice: 119.9,
      demo: true,
      warnings: ["Demo mode: sample shops and prices. Add a SerpApi key to see live prices."],
    };
    return NextResponse.json(result);
  }

  const warnings: string[] = [];
  const settled = await Promise.allSettled(countries.map((cc) => searchCountry(product.searchQuery, cc)));
  let offers: Offer[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") offers.push(...s.value);
    else {
      console.error(s.reason);
      warnings.push(`Could not check shops in ${countries[i].toUpperCase()} this time.`);
    }
  });

  // Keep only listings of the same product.
  if (hasClaude() && offers.length) {
    offers = offers.slice(0, 200);
    try {
      const verdicts = await classifyListings(product, offers.map((o) => `[${o.country}] ${o.title}`));
      offers = offers
        .map((o, i) => ({ ...o, match: (verdicts.get(i) ?? "different") as Offer["match"] | "different" }))
        .filter((o): o is Offer => o.match !== "different");
    } catch (e) {
      console.error("classify failed", e);
      offers = brandFilter(offers, product.brand);
      warnings.push("Exact-match check was unavailable, so some results may be similar items.");
    }
  } else {
    offers = brandFilter(offers, product.brand);
  }

  // Throw away extreme outliers (usually accessories or kids' versions that slipped through).
  const med = median(offers.map((o) => o.total));
  if (med) offers = offers.filter((o) => o.total > med * 0.3);

  offers = dedupe(offers).sort((a, b) => {
    const rank = (o: Offer) => (o.match === "exact" ? 0 : 1);
    return a.total - b.total || rank(a) - rank(b);
  });

  // "Usual price": the typical price in the shopper's home country, otherwise the typical listed price.
  const homePrices = offers.filter((o) => o.country === home).map((o) => o.oldPrice ?? o.total);
  const usualPrice = median(homePrices.length ? homePrices : offers.map((o) => o.oldPrice ?? o.total));

  const result: SearchResult = {
    offers: offers.slice(0, 25),
    countries: countries.map((c) => c.toUpperCase()),
    usualPrice,
    demo: false,
    warnings,
  };
  return NextResponse.json(result);
}
