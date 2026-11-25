import { NextResponse } from "next/server";
import { hasClaude, identifyProduct } from "@/lib/claude";
import { MOCK_PRODUCT } from "@/lib/mock";
import { hasSerpApi } from "@/lib/shopping";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  const hint = (form?.get("hint") as string | null)?.slice(0, 300) || undefined;

  if (!(file instanceof File)) return NextResponse.json({ error: "Please add a screenshot." }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Please use a PNG, JPG, WEBP or GIF image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is over 5 MB. Try a smaller screenshot." }, { status: 400 });

  // Live prices are on but recognition isn't: say so instead of returning the sample product.
  if (!hasClaude() && hasSerpApi()) {
    return NextResponse.json(
      { error: "Screenshot recognition isn't switched on yet. For now, type the product name below to search live prices." },
      { status: 503 }
    );
  }

  if (!hasClaude()) {
    await new Promise((r) => setTimeout(r, 900));
    return NextResponse.json({ product: MOCK_PRODUCT, demo: true });
  }

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const p = await identifyProduct(data, file.type, hint);
    if (!p.isProduct) {
      return NextResponse.json({ error: "We couldn't find a product in this image. Try a screenshot that shows the item clearly." }, { status: 422 });
    }
    const { isProduct: _ignored, ...product } = p;
    return NextResponse.json({ product, demo: false });
  } catch (e) {
    console.error("identify failed", e);
    return NextResponse.json({ error: "Recognition failed. Please try again in a moment." }, { status: 502 });
  }
}
