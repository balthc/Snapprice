import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Product } from "./types";
import { anthropicKey } from "./env";
import { IDENTIFY_PROMPT, VERIFY_PROMPT, classifyPrompt, identifyText } from "./prompts";

export const hasClaude = () => Boolean(anthropicKey());
const model = () => process.env.CLAUDE_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
function claude() {
  client ??= new Anthropic({ apiKey: anthropicKey()!, maxRetries: 2, timeout: 60_000 });
  return client;
}

const ProductSchema = z.object({
  isProduct: z.boolean().describe("false if the image does not show a buyable product"),
  brand: z.string().describe("Brand name exactly as the manufacturer writes it, e.g. 'Carhartt WIP'"),
  model: z.string().describe("Official product/model name, e.g. 'Double Knee Pant'"),
  colour: z.string().describe("Colour name, the manufacturer's name if you can tell, e.g. 'Black rinsed'"),
  articleCode: z.string().nullable().describe("Manufacturer article/style code if visible or known with confidence, e.g. 'I031501'. null if unsure."),
  category: z.string().describe("Short category in English, e.g. 'trousers', 'sneakers', 'headphones'"),
  productType: z.string().describe("Precise kind of item, e.g. 'hooded padded jacket', 'overshirt'"),
  features: z.array(z.string()).describe("3 to 6 short visual details that set this item apart from the brand's other items"),
  season: z.string().describe("Season or model year if the item has one, e.g. '2026/27' for a football shirt, '2025' for a yearly model. Empty string if none or unknown."),
  kit: z.string().describe("For sports shirts: 'home', 'away', 'third', 'goalkeeper' or 'training'. Empty string otherwise."),
  version: z.string().describe("For sports shirts: 'authentic' (player version) or 'replica' (fan version) if you can tell. Empty string otherwise."),
  searchQuery: z.string().describe("Google Shopping query for exactly this item: brand + model/code if known, else brand + productType + colour + most telling feature. No sizes."),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().describe("One short sentence for the shopper: what you recognised, or what is unclear"),
});

export async function identifyProduct(
  imageBase64: string,
  mediaType: string,
  hint?: string,
  lensTitles: string[] = []
): Promise<Product & { isProduct: boolean }> {
  const extra = identifyText(hint, lensTitles);
  const res = await claude().beta.messages.parse({
    model: model(),
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: zodOutputFormat(ProductSchema) },
    system: IDENTIFY_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: imageBase64 },
          },
          { type: "text", text: extra },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) {
    throw new Error("Could not recognise this image. Try a clearer screenshot or type the product name.");
  }
  return res.parsed_output;
}

const MatchSchema = z.object({
  verdicts: z.array(
    z.object({
      i: z.number().int().describe("index of the listing"),
      match: z.enum(["exact", "likely", "different"]),
    })
  ),
});

// Asks Claude which shop listings are the same product (not a look-alike, accessory, other colour or other model).
export async function classifyListings(product: Product, titles: string[]): Promise<Map<number, "exact" | "likely" | "different">> {
  const res = await claude().beta.messages.parse({
    model: model(),
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: zodOutputFormat(MatchSchema) },
    messages: [
      {
        role: "user",
        content: classifyPrompt(product, titles),
      },
    ],
  });
  const out = new Map<number, "exact" | "likely" | "different">();
  for (const v of res.parsed_output?.verdicts ?? []) out.set(v.i, v.match);
  return out;
}

const VerifySchema = z.object({
  verdicts: z.array(z.object({ i: z.number().int(), match: z.enum(["same", "similar", "different"]) })),
});

type Img = { data: string; mime: string };
type ImgMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export async function verifyWithClaude(ref: Img, product: string, items: { title: string; img: Img }[]) {
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    { type: "text", text: `The shopper wants: ${product}. Image 0 (next) is their screenshot.` },
    { type: "image", source: { type: "base64", media_type: ref.mime as ImgMime, data: ref.data } },
  ];
  items.forEach((it, i) => {
    content.push({ type: "text", text: `Listing ${i}: ${it.title}` });
    content.push({ type: "image", source: { type: "base64", media_type: it.img.mime as ImgMime, data: it.img.data } });
  });
  content.push({ type: "text", text: `Give a verdict for every listing 0 to ${items.length - 1}.` });
  const res = await claude().beta.messages.parse({
    model: model(),
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: zodOutputFormat(VerifySchema) },
    system: VERIFY_PROMPT,
    messages: [{ role: "user", content }],
  });
  const map = new Map<number, "same" | "similar" | "different">();
  for (const v of res.parsed_output?.verdicts ?? []) map.set(v.i, v.match);
  return map;
}
