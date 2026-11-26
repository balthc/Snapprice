import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Product } from "./types";
import { anthropicKey } from "./env";
import { IDENTIFY_PROMPT, classifyPrompt, identifyText } from "./prompts";

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
  searchQuery: z.string().describe("The best Google Shopping search query to find exactly this item: brand + model + colour (+ code if certain). No sizes, no filler words."),
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
