// Visual check: compares each result's product photo with the shopper's screenshot,
// so look-alikes from the same brand (other model, colour, cut) are filtered out.
import { aiProvider } from "./ai";
import { verifyWithClaude } from "./claude";
import { verifyWithGemini, type Img } from "./gemini";
import type { Offer } from "./types";

const MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

async function fetchImage(url: string): Promise<Img | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "Mozilla/5.0 (compatible; SnappriceBot/1.0)" } });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!MIMES.includes(mime)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1_500_000 || buf.length < 200) return null;
    return { data: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}

export type Verdict = "same" | "similar" | "different" | "unchecked";

// Returns a verdict per offer (same order as the input). Offers without a usable photo are "unchecked".
export async function verifyOffers(ref: Img, productText: string, offers: Offer[]): Promise<Verdict[]> {
  const imgs = await Promise.all(offers.map((o) => (o.thumbnail ? fetchImage(o.thumbnail) : Promise.resolve(null))));
  const items: { idx: number; title: string; img: Img }[] = [];
  imgs.forEach((img, idx) => { if (img) items.push({ idx, title: offers[idx].title, img }); });
  const verdicts: Verdict[] = offers.map(() => "unchecked");
  if (!items.length) return verdicts;
  const run = aiProvider() === "claude" ? verifyWithClaude : verifyWithGemini;
  // Batches of 16 photos per AI call, in parallel.
  const batches: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += 16) batches.push(items.slice(i, i + 16));
  const results = await Promise.all(batches.map((b) => run(ref, productText, b.map(({ title, img }) => ({ title, img })))));
  results.forEach((map, bi) => {
    batches[bi].forEach((it, j) => { verdicts[it.idx] = map.get(j) ?? "different"; });
  });
  return verdicts;
}
