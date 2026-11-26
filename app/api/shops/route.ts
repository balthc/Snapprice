import { NextRequest, NextResponse } from "next/server";
import { searchShop, shopifyShops } from "@/lib/shopify";

export const runtime = "nodejs";
export const maxDuration = 30;

// Shows which independent shops answer our free product search: /api/shops?q=nike
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "nike").slice(0, 60);
  const shops = shopifyShops();
  const results = await Promise.all(shops.map((s) => searchShop(s, q)));
  return NextResponse.json({
    query: q,
    shops: shops.map((s, i) => ({ shop: s.domain, country: s.country, works: results[i] !== null, results: results[i]?.length ?? 0 })),
  });
}
