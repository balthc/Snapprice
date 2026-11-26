// Strong text evidence that a listing is the shopper's exact product:
// - "code": the manufacturer's article/style code appears in the title (e.g. I029919)
// - "model": every word of the model name appears (e.g. "Flint Pant") and nothing contradicts kind or colour
import { contradicts } from "./attributes";
import type { Product } from "./types";

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const compact = (t: string) => norm(t).replace(/[^a-z0-9]/g, "");

// Article codes: tokens of 5+ characters that mix letters and digits, or are 6+ digits.
export function codesOf(text: string): string[] {
  return (text.match(/[A-Za-z0-9][A-Za-z0-9.\-/]{4,}/g) ?? [])
    .map((t) => t.split(/[./]/)[0]) // I029919.G1.GD → I029919
    .filter((t) => (/[a-z]/i.test(t) && /\d/.test(t) && t.length >= 5) || /^\d{6,}$/.test(t))
    .map(compact);
}

export function modelWords(product: Product): string[] {
  const brand = new Set(norm(product.brand).split(/\s+/));
  const codes = new Set(codesOf(`${product.model} ${product.articleCode ?? ""}`));
  const generic = new Set(["the", "and", "with", "men", "women", "mens", "womens", "unisex", "new", "pants", "pant", "trousers", "jacket", "shoes"]);
  return norm(product.model)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !brand.has(w) && !codes.has(w) && !generic.has(w));
}

export function strongMatch(title: string, product: Product): "code" | "model" | null {
  const t = compact(title);
  const codes = codesOf(`${product.articleCode ?? ""} ${product.model}`);
  if (codes.some((c) => t.includes(c))) return "code";
  const words = modelWords(product);
  const n = norm(title);
  const brandOk = norm(product.brand).split(/\s+/).filter((w) => w.length > 1).every((w) => n.includes(w));
  if (words.length && brandOk && words.every((w) => n.includes(w)) && !contradicts(title, product)) return "model";
  return null;
}
