import { NextRequest, NextResponse } from "next/server";
import { rememberShops } from "@/lib/discover";
import { serpApiKey } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 30;

type Store = { name?: string; link?: string };

// Remembers resolved links while this server instance is running, so repeat clicks cost nothing.
const cache = new Map<string, string>();

const norm = (s: string) => s.toLowerCase().replace(/^www\./, "").replace(/\.(com|nl|de|it|fr|es|be|eu|at|pl|co\.uk)$/, "").replace(/[^a-z0-9]/g, "");

function safeGoogle(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)google\.[a-z.]+$/.test(u.hostname) ? url : null;
  } catch {
    return null;
  }
}

function safeHttp(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// Sends the shopper to the shop's own product page for a Google Shopping result.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  const shop = req.nextUrl.searchParams.get("s") || "";
  const fallback = safeGoogle(req.nextUrl.searchParams.get("f")) ?? `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(shop)}`;

  if (!token || !serpApiKey()) return NextResponse.redirect(fallback, 302);

  const key = `${token}|${shop}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.redirect(hit, 302);

  try {
    const params = new URLSearchParams({ engine: "google_immersive_product", page_token: token, more_stores: "true", api_key: serpApiKey()! });
    const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(20_000) });
    const data = (await res.json()) as { product_results?: { stores?: Store[] } };
    const stores = data.product_results?.stores ?? [];
    // Every shop selling this product goes into the small-shop index.
    await rememberShops(stores.filter((s) => safeHttp(s.link)).map((s) => ({ url: s.link!, name: s.name })));
    const want = norm(shop);
    const match =
      stores.find((s) => s.name && norm(s.name) === want) ??
      stores.find((s) => s.name && (norm(s.name).includes(want) || want.includes(norm(s.name)))) ??
      (stores.length === 1 ? stores[0] : undefined);
    const link = safeHttp(match?.link);
    if (link) {
      cache.set(key, link);
      return NextResponse.redirect(link, 302);
    }
  } catch (e) {
    console.error("go: could not resolve shop link", e);
  }
  return NextResponse.redirect(fallback, 302);
}
