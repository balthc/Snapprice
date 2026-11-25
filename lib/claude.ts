import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Product } from "./types";

export const hasClaude = () => Boolean(process.env.ANTHROPIC_API_KEY);
const model = () => process.env.CLAUDE_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
function claude() {
  client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 });
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

const IDENTIFY_PROMPT = `You identify products from screenshots so a price-comparison site can find the exact same item in other webshops.
Look at everything in the image: logos, labels, product text, shop page titles, prices, and the item itself.
Return the specific product (brand, official model name, colour, article code) rather than a generic description.
Only give an article code when it is visible or you are confident it is the right one; a wrong code ruins the search.
If the image shows several products, pick the main one.`;

export async function identifyProduct(imageBase64: string, mediaType: string, hint?: string): Promise<Product & { isProduct: boolean }> {
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
          { type: "text", text: hint ? `Extra info from the shopper: ${hint}` : "Identify this product." },
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
  const list = titles.map((t, i) => `${i}: ${t}`).join("\n");
  const res = await claude().beta.messages.parse({
    model: model(),
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: zodOutputFormat(MatchSchema) },
    messages: [
      {
        role: "user",
        content: `Target product: ${product.brand} ${product.model}, colour ${product.colour}${product.articleCode ? `, article code ${product.articleCode}` : ""} (${product.category}).

Below are webshop listing titles in several languages. For each, say:
- "exact": same brand, same model, same colour (or colour not stated in the title)
- "likely": same brand and model but you cannot be sure about colour or version
- "different": another model, another colour, a copy, an accessory, or a different product

${list}`,
      },
    ],
  });
  const out = new Map<number, "exact" | "likely" | "different">();
  for (const v of res.parsed_output?.verdicts ?? []) out.set(v.i, v.match);
  return out;
}
