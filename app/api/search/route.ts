import { NextResponse } from "next/server";
import { z } from "zod";
import { aiProvider, classify } from "@/lib/ai";
import { COUNTRIES, homeCountry, maxCountries, searchCountries } from "@/lib/countries";
import { ebayMarkets, hasEbay, searchEbay } from "@/lib/ebay";
import { mockOffers } from "@/lib/mock";
import { contradicts } from "@/lib/attributes";
import { keywordMatch, shopQuery, strongMatch } from "@/lib/strong";
import { describe } from "@/lib/prompts";
import { inspectPage } from "@/lib/page";
import { hasShopify, searchShopify } from "@/lib/shopify";
import { countryFromUrl } from "@/lib/lens";
import { eurRates, toEur } from "@/lib/currency";
import { verifyOffers } from "@/lib/verify";
import { hasFeeds, searchFeeds } from "@/lib/feeds";
import { activeProviders, dedupe, hasShopping, searchCountry } from "@/lib/shopping";
import type { Offer, SearchEvent, SearchResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const httpUrl = z.string().max(2000).refine((u) => /^https?:\/\//i.test(u), "bad url");

const Body = z.object({
  product: z.object({
    brand: z.string().max(120),
    model: z.string().max(200),
    colour: z.string().max(120),
    articleCode: z.string().max(60).nullable(),
    category: z.string().max(80),
    productType: z.string().max(120).optional(),
    features: z.array(z.string().max(120)).max(8).optional(),
    searchQuery: z.string().min(2).max(200),
    fit: z.string().max(60).optional(),
    confidence: z.enum(["high", "medium", "low"]),
    notes: z.string().max(500),
  }),
  size: z.string().max(40).optional(),
  countries: z.array(z.string().max(4)).max(40).optional(),
  // The shopper's screenshot (small JPEG, base64), used to compare result photos.
  image: z.object({ data: z.string().max(1_000_000), mime: z.enum(["image/jpeg", "image/png", "image/webp"]) }).optional(),
  // Shop pages Google Lens found for the screenshot (sent back by the page).
  lensOffers: z
    .array(
      z.object({
        source: z.literal("lens"),
        country: z.string().max(4),
        shop: z.string().max(120),
        title: z.string().max(300),
        url: httpUrl,
        thumbnail: httpUrl.nullable(),
        price: z.number().positive().max(100000),
        oldPrice: z.null(),
        shipping: z.null(),
        total: z.number().positive().max(100000),
        currency: z.string().max(4),
        rating: z.null(),
        reviews: z.null(),
        match: z.enum(["exact", "likely", "unsure"]),
        stock: z.enum(["in", "unknown"]),
      })
    )
    .max(60)
    .optional(),
  // Shop pages Google Lens found without a price: we read price, photo and stock from the page itself.
  lensPages: z
    .array(z.object({ url: httpUrl, title: z.string().max(300), shop: z.string().max(120), thumbnail: httpUrl.nullable() }))
    .max(30)
    .optional(),
});

type Emit = (e: SearchEvent) => void;

const EU_CURRENCIES = ["EUR", "PLN", "DKK", "SEK", "CZK", "HUF", "RON", "BGN"];
const direct = (o: Offer) => /^https?:\/\//.test(o.url) && !/(^|\.)google\./.test(new URL(o.url).hostname);

// Lens pages without a price: open them (free) and keep the ones that show a price in an EU currency.
async function offersFromPages(pages: { url: string; title: string; shop: string; thumbnail: string | null }[]): Promise<Offer[]> {
  const infos = await Promise.all(pages.slice(0, 20).map((p) => inspectPage(p.url)));
  const rates = await eurRates();
  const out: Offer[] = [];
  pages.slice(0, 20).forEach((p, i) => {
    const info = infos[i];
    const cur = (info.currency || "").toUpperCase();
    if (!info.price || !EU_CURRENCIES.includes(cur) || info.stock === "out") return;
    const price = toEur(info.price, cur, rates);
    out.push({
      source: "lens", country: countryFromUrl(p.url), shop: p.shop, title: info.title || p.title, url: p.url,
      thumbnail: p.thumbnail, photo: info.image ?? undefined, price, oldPrice: null, shipping: null, total: price,
      currency: cur, rating: null, reviews: null, match: "unsure", stock: info.stock === "in" ? "in" : "unknown",
    });
  });
  return out;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!(req.headers.get("accept") || "").includes("ndjson")) return NextResponse.json(await runSearch(parsed.data, () => {}));

  // Streamed: the page shows countries lighting up and shops appearing while we search.
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit: Emit = (e) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* shopper left */
        }
      };
      try {
        emit({ t: "done", result: await runSearch(parsed.data, emit) });
      } catch (e) {
        console.error("search failed", e);
        emit({ t: "error", error: "Search failed. Please try again." });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

async function runSearch(input: z.infer<typeof Body>, emit: Emit): Promise<SearchResult> {
  const { product, lensOffers = [], lensPages = [], image } = input;
  const picked = (input.countries ?? []).map((c) => c.toLowerCase()).filter((c) => c in COUNTRIES);
  const countries = [...new Set(picked.length ? picked : searchCountries())].slice(0, maxCountries());
  const home = homeCountry();

  if (!hasShopping() && !hasEbay() && !hasFeeds()) {
    const demo = mockOffers();
    emit({ t: "plan", countries: countries.map((c) => c.toUpperCase()), sources: ["Demo"] });
    emit({ t: "phase", phase: "searching" });
    for (const [i, cc] of countries.entries()) {
      await new Promise((r) => setTimeout(r, 110));
      const o = demo[i % demo.length];
      emit({ t: "found", label: cc.toUpperCase(), cc: cc.toUpperCase(), n: i % 3 ? 0 : 1, shops: i % 3 ? [] : [{ shop: o.shop, total: o.total, thumbnail: o.thumbnail }] });
    }
    const result: SearchResult = {
      offers: demo,
      similar: [],
      visualCheck: false,
      countries: countries.map((c) => c.toUpperCase()),
      sources: ["Demo"],
      usualPrice: 119.9,
      demo: true,
      warnings: ["Demo mode: sample shops and prices. Add a SerpApi key to see live prices."],
    };
    return result;
  }

  const warnings: string[] = [];
  const sources: string[] = [];
  const query = shopQuery(product);
  const jobs: { label: string; cc: string | null; run: Promise<Offer[]> }[] = [];
  if (hasFeeds()) {
    sources.push("Partner shops");
    jobs.push({ label: "partner shop feeds", cc: null, run: searchFeeds(product, countries) });
  }
  if (hasShopping()) {
    sources.push("Google Shopping");
    for (const cc of countries) jobs.push({ label: `Google Shopping ${cc.toUpperCase()}`, cc: cc.toUpperCase(), run: searchCountry(query, cc) });
  }
  if (hasEbay()) {
    sources.push("eBay");
    for (const cc of ebayMarkets(countries)) jobs.push({ label: `eBay ${cc.toUpperCase()}`, cc: cc.toUpperCase(), run: searchEbay(query, cc, home) });
  }
  if (hasShopify()) {
    sources.push("Independent shops");
    jobs.push({ label: "independent shops", cc: null, run: searchShopify(`${product.brand} ${product.model}`.trim() || product.searchQuery, countries) });
  }
  if (lensPages.length) jobs.push({ label: "shop pages", cc: null, run: offersFromPages(lensPages) });
  if (lensOffers.length || lensPages.length) sources.push("Google Lens");

  emit({ t: "plan", countries: countries.map((c) => c.toUpperCase()), sources });
  emit({ t: "phase", phase: "searching" });
  if (lensOffers.length) emit({ t: "found", label: "Google Lens", cc: null, n: lensOffers.length, shops: lensOffers.slice(0, 4).map((o) => ({ shop: o.shop, total: o.total, thumbnail: o.thumbnail })) });
  const quiet = new Set(["partner shop feeds", "independent shops", "shop pages"]); // bonus sources: no warning if they fail
  const settled = await Promise.allSettled(
    jobs.map((j) =>
      j.run.then(
        (v) => {
          const top = [...v].sort((a, b) => a.total - b.total).slice(0, 4);
          emit({ t: "found", label: j.label, cc: j.cc, n: v.length, shops: top.map((o) => ({ shop: o.shop, total: o.total, thumbnail: o.thumbnail })) });
          return v;
        },
        (e) => {
          emit({ t: "found", label: j.label, cc: j.cc, n: 0, shops: [] });
          throw e;
        }
      )
    )
  );
  let offers: Offer[] = [...lensOffers];
  const failed: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") offers.push(...s.value);
    else {
      console.error(jobs[i].label, s.reason);
      // The partner database is a bonus source: if it's down or not set up yet, shoppers shouldn't see a warning.
      if (quiet.has(jobs[i].label)) return;
      failed.push(jobs[i].label.replace("Google Shopping ", ""));
    }
  });
  if (failed.length) {
    warnings.push(
      failed.length === jobs.filter((j) => !quiet.has(j.label)).length
        ? `The price services didn't answer this time${activeProviders().length ? " (their free allowance may be used up)" : ""}. Please try again later.`
        : `Couldn't check: ${failed.join(", ")}.`
    );
  }

  // Hard filters (free, always on): drop listings whose title names another kind of item or another colour.
  offers = offers.filter((o) => !contradicts(o.title, product));
  // Strong text evidence: the article code or the full model name is in the title.
  offers = offers.map((o) => {
    const strong = strongMatch(o.title, product);
    return strong ? { ...o, strong } : o;
  });

  // Keep only listings of the same product: checked by AI if one is set up, otherwise by search words.
  emit({ t: "phase", phase: "matching" });
  const provider = aiProvider();
  let checked = false;
  if (provider && offers.length) {
    offers = offers.slice(0, 250);
    try {
      const verdicts = await classify(product, offers.map((o) => `[${o.country}] ${o.title}`));
      offers = offers
        .map((o, i) => {
          const v = (verdicts.get(i) ?? "different") as Offer["match"] | "different";
          // An article code is decisive; a full model name upgrades "likely" (but never overrides "different").
          const match = o.strong === "code" ? "exact" : o.strong === "model" && v === "likely" ? "exact" : v;
          return { ...o, match };
        })
        .filter((o): o is Offer => o.match !== "different");
      checked = true;
    } catch (e) {
      console.error("classify failed", e);
    }
  }
  if (!checked && offers.length) {
    const strong = offers.filter((o) => o.strong).map((o) => ({ ...o, match: "exact" as const }));
    offers = dedupe([...strong, ...offers.filter((o) => !o.strong && keywordMatch(o.title, product))]);
    warnings.push(
      provider
        ? "The exact-match check didn't work this time, so a few results may be similar items."
        : "Results are matched on your search words only, so a few may be similar items. A free Gemini key switches on the exact-match check."
    );
  }

  // Strict by default: only "exact" text matches go in the main list, "likely" ones go to "similar".
  let similar: Offer[] = [];
  if (checked) {
    similar = offers.filter((o) => o.match === "likely");
    offers = offers.filter((o) => o.match === "exact");
  }

  // Throw away extreme outliers (usually accessories or kids' versions that slipped through).
  const med = median(offers.map((o) => o.total));
  if (med) offers = offers.filter((o) => o.total > med * 0.3);

  offers = dedupe(offers).sort((a, b) => {
    const rank = (o: Offer) => (o.match === "exact" ? 0 : 1);
    return a.total - b.total || rank(a) - rank(b);
  });

  // Visual check: compare the photos of the cheapest candidates with the shopper's screenshot.
  let visualCheck = false;
  let photoCheck: string | null = null;
  if (image && provider) {
    emit({ t: "phase", phase: "photos" });
    const prevOffers = offers, prevSimilar = similar;
    const pool = dedupe([...offers, ...similar]).sort((a, b) => a.total - b.total).slice(0, 32);
    try {
      const verdicts = await verifyOffers(image, describe(product), pool);
      // Photos confirm; an article code in the title also counts as confirmed; a full model name counts
      // unless the photo is clearly another product; a photo we couldn't load keeps the title verdict.
      // A title already judged "exact" stays unless the photo shows a clearly different product.
      const keep = (o: Offer, v: string) =>
        v === "same" || o.strong === "code" || (v !== "different" && (o.strong === "model" || o.match === "exact"));
      offers = pool.filter((o, i) => keep(o, verdicts[i])).map((o) => ({ ...o, seen: verdicts[pool.indexOf(o)] === "same", match: "exact" as const }));
      similar = pool.filter((o, i) => !keep(o, verdicts[i]) && (verdicts[i] === "similar" || verdicts[i] === "unchecked")).map((o) => ({ ...o, match: "likely" as const }));
      // Offers beyond the 32 checked keep their title verdict.
      const inPool = new Set(pool);
      offers.push(...prevOffers.filter((o) => !inPool.has(o)));
      similar.push(...prevSimilar.filter((o) => !inPool.has(o)));
      offers = dedupe(offers).sort((a, b) => a.total - b.total);
      visualCheck = true;
      photoCheck = provider === "claude" ? "Claude" : "Gemini";
    } catch (e) {
      console.error("visual check failed", e);
      warnings.push("The photo comparison didn't work this time, so results are matched on their titles only.");
    }
  }

  // Open the shop pages we link to directly (free): confirms stock, removes sold-out offers and
  // takes the product photo from the shop's own page.
  emit({ t: "phase", phase: "stock" });
  const toCheck = [...offers.slice(0, 24), ...similar.slice(0, 8)].filter((o) => direct(o) && (o.stock === "unknown" || !o.photo)).slice(0, 24);
  const pages = await Promise.all(toCheck.map((o) => inspectPage(o.url)));
  const gone = new Set(toCheck.filter((_, i) => pages[i].stock === "out"));
  toCheck.forEach((o, i) => {
    if (pages[i].stock === "in") o.stock = "in";
    if (pages[i].image && !o.photo) o.photo = pages[i].image!;
  });
  if (gone.size) {
    offers = offers.filter((o) => !gone.has(o));
    similar = similar.filter((o) => !gone.has(o));
  }

  // "Usual price": the typical price in the shopper's home country, otherwise the typical listed price.
  const homePrices = offers.filter((o) => o.country === home.toUpperCase()).map((o) => o.oldPrice ?? o.total);
  const usualPrice = median(homePrices.length ? homePrices : offers.map((o) => o.oldPrice ?? o.total));

  const result: SearchResult = {
    offers: offers.slice(0, 40),
    similar: dedupe(similar).sort((a, b) => a.total - b.total).slice(0, 20),
    visualCheck,
    checks: { textCheck: checked ? (provider === "claude" ? "Claude" : "Gemini") : null, photoCheck },
    countries: countries.map((c) => c.toUpperCase()),
    sources,
    usualPrice,
    demo: false,
    warnings,
  };
  return result;
}
