// Free option for recognition and match checking: Google's Gemini API free tier.
// Get a key (no credit card) at https://aistudio.google.com/apikey and set GEMINI_API_KEY.
import { geminiKey } from "./env";
import { IDENTIFY_PROMPT, classifyPrompt, identifyText } from "./prompts";
import type { Product } from "./types";

export const hasGemini = () => Boolean(geminiKey());
const model = () => process.env.GEMINI_MODEL || "gemini-3.5-flash";

async function generate(parts: unknown[], schema: unknown, system?: string): Promise<unknown> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey()! },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return JSON.parse(text);
}

const PRODUCT_SCHEMA = {
  type: "OBJECT",
  properties: {
    isProduct: { type: "BOOLEAN" },
    brand: { type: "STRING" },
    model: { type: "STRING" },
    colour: { type: "STRING" },
    articleCode: { type: "STRING", nullable: true },
    category: { type: "STRING" },
    searchQuery: { type: "STRING" },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
    notes: { type: "STRING" },
  },
  required: ["isProduct", "brand", "model", "colour", "category", "searchQuery", "confidence", "notes"],
};

export async function identifyWithGemini(
  imageBase64: string,
  mediaType: string,
  hint?: string,
  lensTitles: string[] = []
): Promise<Product & { isProduct: boolean }> {
  const out = (await generate(
    [{ inline_data: { mime_type: mediaType, data: imageBase64 } }, { text: identifyText(hint, lensTitles) }],
    PRODUCT_SCHEMA,
    IDENTIFY_PROMPT
  )) as Product & { isProduct: boolean };
  if (!out?.searchQuery) throw new Error("Gemini gave no product");
  return { ...out, articleCode: out.articleCode || null };
}

export async function classifyWithGemini(product: Product, titles: string[]) {
  const out = (await generate([{ text: classifyPrompt(product, titles) }], {
    type: "OBJECT",
    properties: {
      verdicts: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { i: { type: "INTEGER" }, match: { type: "STRING", enum: ["exact", "likely", "different"] } },
          required: ["i", "match"],
        },
      },
    },
    required: ["verdicts"],
  })) as { verdicts?: { i: number; match: "exact" | "likely" | "different" }[] };
  const map = new Map<number, "exact" | "likely" | "different">();
  for (const v of out.verdicts ?? []) map.set(v.i, v.match);
  return map;
}
