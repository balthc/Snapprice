// Free stock check: opens the shop's product page (like a link preview does) and reads the
// availability that shops publish for Google (schema.org "InStock" / "OutOfStock").
// Only used for offers with a direct shop link; works on most shops, some block it (then: unknown).

export type Stock = "in" | "out" | "unknown";

const OUT = /(OutOfStock|SoldOut|Discontinued)/i;
const IN = /(InStock|LimitedAvailability|OnlineOnly|InStoreOnly)/i;

export function readAvailability(html: string): Stock {
  const found: string[] = [];
  for (const m of html.matchAll(/"availability"\s*:\s*"([^"]{2,80})"/gi)) found.push(m[1]);
  for (const m of html.matchAll(/itemprop=["']availability["'][^>]*(?:href|content)=["']([^"']{2,80})["']/gi)) found.push(m[1]);
  for (const m of html.matchAll(/(?:href|content)=["']([^"']{2,80})["'][^>]*itemprop=["']availability["']/gi)) found.push(m[1]);
  for (const m of html.matchAll(/property=["'](?:product|og):availability["'][^>]*content=["']([^"']{2,40})["']/gi)) found.push(m[1]);
  for (const m of html.matchAll(/content=["']([^"']{2,40})["'][^>]*property=["'](?:product|og):availability["']/gi)) found.push(m[1]);
  if (!found.length) return "unknown";
  const norm = found.map((f) => f.replace(/\s+/g, ""));
  if (norm.some((f) => IN.test(f) || /^(instock|in_stock)$/i.test(f))) return "in";
  if (norm.every((f) => OUT.test(f) || /^(outofstock|out_of_stock|oos)$/i.test(f))) return "out";
  return "unknown";
}

export async function checkStock(url: string): Promise<Stock> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SnappriceBot/1.0; price comparison)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en,nl;q=0.8,de;q=0.6",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404 || res.status === 410) return "out";
    if (!res.ok || !res.body) return "unknown";
    // Read at most ~1.5 MB of the page.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 1_500_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    return readAvailability(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    return "unknown";
  }
}
