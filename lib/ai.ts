// Picks the AI used for recognising products and checking matches.
// Order: Claude (paid, if ANTHROPIC_API_KEY is set) → Gemini (free tier, if GEMINI_API_KEY is set) → none.
// Set AI_PROVIDER=gemini to prefer Gemini even when a Claude key exists.
import { classifyListings, hasClaude, identifyProduct } from "./claude";
import { classifyWithGemini, hasGemini, identifyWithGemini } from "./gemini";
import type { Product } from "./types";

export type Provider = "claude" | "gemini" | null;

export function aiProvider(): Provider {
  const pref = (process.env.AI_PROVIDER || "").toLowerCase();
  if (pref === "gemini" && hasGemini()) return "gemini";
  if (pref === "claude" && hasClaude()) return "claude";
  if (hasClaude()) return "claude";
  if (hasGemini()) return "gemini";
  return null;
}

export function identify(image: string, mediaType: string, hint?: string, lensTitles: string[] = []) {
  return aiProvider() === "claude"
    ? identifyProduct(image, mediaType, hint, lensTitles)
    : identifyWithGemini(image, mediaType, hint, lensTitles);
}

export function classify(product: Product, titles: string[]) {
  return aiProvider() === "claude" ? classifyListings(product, titles) : classifyWithGemini(product, titles);
}
