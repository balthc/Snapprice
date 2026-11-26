import { NextResponse } from "next/server";
import { aiProvider } from "@/lib/ai";
import { hasEbay } from "@/lib/ebay";
import { searchCountries } from "@/lib/countries";
import { hasSerpApi } from "@/lib/shopping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tells the page (and you) which parts are live. Never returns the keys themselves.
export async function GET() {
  return NextResponse.json(
    {
      livePrices: hasSerpApi() || hasEbay(),
      recognition: hasSerpApi() || aiProvider() !== null,
      sources: [hasSerpApi() && "Google Shopping", hasEbay() && "eBay"].filter(Boolean),
      recogniser: aiProvider() ?? (hasSerpApi() ? "google-lens" : null),
      matchCheck: aiProvider(),
      countries: searchCountries().map((c) => c.toUpperCase()),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
