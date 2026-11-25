import { NextResponse } from "next/server";
import { hasClaude } from "@/lib/claude";
import { searchCountries } from "@/lib/countries";
import { hasSerpApi } from "@/lib/shopping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tells the page (and you) which parts are live. Never returns the keys themselves.
export async function GET() {
  return NextResponse.json(
    {
      livePrices: hasSerpApi(),
      recognition: hasClaude(),
      countries: searchCountries().map((c) => c.toUpperCase()),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
