import { NextResponse } from "next/server";
import { aiProvider } from "@/lib/ai";
import { hasEbay } from "@/lib/ebay";
import { COUNTRIES, homeCountry, maxCountries, searchCountries } from "@/lib/countries";
import { hasFeeds } from "@/lib/feeds";
import { hasShopify } from "@/lib/shopify";
import { activeProviders, hasSerpApi, hasShopping } from "@/lib/shopping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tells the page (and you) which parts are live. Never returns the keys themselves.
export async function GET() {
  return NextResponse.json(
    {
      livePrices: hasShopping() || hasEbay() || hasFeeds(),
      recognition: hasSerpApi() || aiProvider() !== null,
      feeds: hasFeeds(),
      sources: [hasFeeds() && "Partner shop feeds", hasShopping() && "Google Shopping", hasEbay() && "eBay", hasShopify() && "Independent shops"].filter(Boolean),
      priceProviders: activeProviders(),
      recogniser: aiProvider() ?? (hasSerpApi() ? "google-lens" : null),
      matchCheck: aiProvider(),
      countries: searchCountries().map((c) => c.toUpperCase()),
      allCountries: Object.entries(COUNTRIES).map(([code, c]) => ({ code: code.toUpperCase(), name: c.name, eu: c.eu })),
      maxCountries: maxCountries(),
      home: homeCountry().toUpperCase(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
