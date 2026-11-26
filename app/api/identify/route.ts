import { NextResponse } from "next/server";
import { aiProvider, identify } from "@/lib/ai";
import { homeCountry } from "@/lib/countries";
import { lensOffers, lensSearch, productFromTitles, uploadImage } from "@/lib/lens";
import { MOCK_PRODUCT } from "@/lib/mock";
import { hasSerpApi } from "@/lib/shopping";
import type { Offer, Product } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;
const LENS_MAX_BYTES = 500 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  const hint = (form?.get("hint") as string | null)?.slice(0, 300) || undefined;

  if (!(file instanceof File)) return NextResponse.json({ error: "Please add a screenshot." }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Please use a PNG, JPG, WEBP or GIF image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is over 5 MB. Try a smaller screenshot." }, { status: 400 });

  const provider = aiProvider();
  const lensOn = hasSerpApi();

  if (!provider && !lensOn) {
    await new Promise((r) => setTimeout(r, 900));
    return NextResponse.json({ product: MOCK_PRODUCT, lensOffers: [], recognisedBy: "demo", demo: true });
  }

  // Step 1: Google Lens finds similar listings online (titles + shop pages with prices).
  let titles: string[] = [];
  let offers: Offer[] = [];
  if (lensOn && file.size <= LENS_MAX_BYTES && file.type !== "image/gif") {
    try {
      const id = await uploadImage(file);
      const matches = await lensSearch(id, homeCountry());
      titles = matches.map((m) => m.title).filter((t): t is string => Boolean(t)).slice(0, 15);
      offers = await lensOffers(matches);
    } catch (e) {
      console.error("lens failed", e);
    }
  }

  // Step 2: name the exact product. With an AI (Claude or free Gemini) if set up, otherwise from the Lens titles.
  let product: Product | null = null;
  let recognisedBy: "claude" | "gemini" | "lens" = "lens";
  if (provider) {
    try {
      const data = Buffer.from(await file.arrayBuffer()).toString("base64");
      const p = await identify(data, file.type, hint, titles);
      if (!p.isProduct && !titles.length) {
        return NextResponse.json({ error: "We couldn't find a product in this image. Try a screenshot that shows the item clearly." }, { status: 422 });
      }
      const { isProduct: _ignored, ...rest } = p;
      product = rest;
      recognisedBy = provider;
    } catch (e) {
      console.error("ai identify failed", e);
    }
  }
  product ??= productFromTitles(titles);

  if (!product) {
    return NextResponse.json(
      { error: "We couldn't recognise this product. Try a sharper screenshot, or type the product name below." },
      { status: 422 }
    );
  }
  return NextResponse.json({ product, lensOffers: offers.slice(0, 40), recognisedBy, demo: false });
}
