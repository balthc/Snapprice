import { NextRequest, NextResponse } from "next/server";

// Maintenance switch. In Vercel set MAINTENANCE_MODE=true to take the site offline:
// visitors see a "coming soon" page and the search API is closed (so no SerpApi or Claude costs).
// You can still see the real site by visiting  /?preview=<MAINTENANCE_BYPASS>  once (sets a cookie for 30 days).
// Visit /?preview=off to remove that cookie again.

const COOKIE = "snapprice_preview";

export function proxy(req: NextRequest) {
  const on = (process.env.MAINTENANCE_MODE || "").trim().toLowerCase() === "true";
  if (!on) return NextResponse.next();

  const secret = (process.env.MAINTENANCE_BYPASS || "").trim();
  const preview = req.nextUrl.searchParams.get("preview");

  if (preview !== null) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("preview");
    const res = NextResponse.redirect(url);
    if (secret && preview === secret) {
      res.cookies.set(COOKIE, secret, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
    } else {
      res.cookies.delete(COOKIE);
    }
    return res;
  }

  if (secret && req.cookies.get(COOKIE)?.value === secret) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Snapprice is being improved and will be back soon." }, { status: 503 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";
  return NextResponse.rewrite(url, { status: 503, headers: { "Retry-After": "3600", "X-Robots-Tag": "noindex" } });
}

export const config = {
  // Run on everything except Next.js files, the icon and the maintenance page itself.
  matcher: ["/((?!_next/|icon.svg|favicon.ico|maintenance|bot).*)"],
};
