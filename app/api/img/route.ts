import { NextRequest } from "next/server";

export const runtime = "nodejs";

// Passes result photos through our own address so the browser may analyse them
// (shops' image servers usually don't allow that directly). Images only, max 3 MB.
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  const host = url.hostname;
  if (
    !/^https?:$/.test(url.protocol) ||
    host === "localhost" ||
    /^(\d+\.){3}\d+$/.test(host) ||
    host.includes(":") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return new Response("not allowed", { status: 400 });
  }
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(6000), headers: { "User-Agent": "Mozilla/5.0 (compatible; SnappriceBot/1.0)" } });
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !type.startsWith("image/")) return new Response("not an image", { status: 404 });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 3_000_000) return new Response("too big", { status: 413 });
    return new Response(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, immutable" } });
  } catch {
    return new Response("failed", { status: 502 });
  }
}
