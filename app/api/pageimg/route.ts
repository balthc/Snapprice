import { NextRequest } from "next/server";
import { fetchHtml, publicUrl, readPage } from "@/lib/page";

export const runtime = "nodejs";

// Product photo from the shop's own page: opens the page, finds its og:image / schema.org image
// and sends the browser to it (through /api/img). 404 when the page has none; the page then shows
// the search thumbnail instead. Cached for a day.
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  if (!publicUrl(u)) return new Response("bad url", { status: 400 });
  try {
    const { html, finalUrl } = await fetchHtml(u, 800_000, 4500);
    const image = html ? readPage(html, finalUrl).image : null;
    if (!image || !publicUrl(image)) return new Response("no image", { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } });
    return new Response(null, {
      status: 302,
      headers: { Location: `/api/img?u=${encodeURIComponent(image)}`, "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    });
  } catch {
    return new Response("failed", { status: 502 });
  }
}
