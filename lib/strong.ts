// Strong text evidence that a listing is the shopper's exact product:
// - "code": the manufacturer's article/style code appears in the title (e.g. I029919)
// - "model": every word of the model name appears (e.g. "Flint Pant") and nothing contradicts kind or colour
import { colourConfirmed, coloursOf, contradicts, kindOf } from "./attributes";
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
  const brandOk = norm(product.brand).split(/[^a-z0-9]+/).filter((w) => w.length > 1).every((w) => n.includes(w));
  // A model name only counts when the colour is confirmed too (same model in another colourway is another product).
  if (words.length && brandOk && words.every((w) => n.includes(w)) && !contradicts(title, product) && colourConfirmed(title, product)) return "model";
  return null;
}

// Words that identify the item in any language: the model name minus item-type words, colours,
// seasons and generic words (those are written differently per shop and language).
const GENERIC = new Set(["home", "away", "third", "men", "mens", "women", "womens", "unisex", "official", "new", "the", "and", "with",
  "replica", "authentic", "stadium", "edition", "version", "season", "kit", "size", "adult", "adults"]);
export function distinctiveWords(product: Product): string[] {
  const brand = new Set(norm(product.brand).split(/\s+/));
  return [...new Set(norm(product.model).split(/[^a-z0-9]+/))].filter(
    (w) => w.length > 1 && !brand.has(w) && !GENERIC.has(w) && !/^\d{1,4}$/.test(w) && !kindOf(w) && !coloursOf(w).length
  );
}

// Free fallback when no AI check is set up: keep listings that name the item's distinctive words
// (or the brand, when the model has none). Language-independent, so "Ajax Heimtrikot" counts for "Ajax home shirt".
export function keywordMatch(title: string, product: Product): boolean {
  const t = norm(title);
  const words = distinctiveWords(product);
  if (words.length) return words.filter((w) => t.includes(w)).length >= Math.max(1, Math.ceil(words.length * 0.6));
  return norm(product.brand).split(/\s+/).filter((w) => w.length > 1).every((w) => t.includes(w));
}

// Shorter query for the shops' search: brand + model (+ article code). Colour and type words narrow
// Google Shopping too much in other languages; our filters check those afterwards.
export function shopQuery(product: Product): string {
  const base = [product.brand, product.model, product.articleCode ?? ""].join(" ");
  const seen = new Set<string>();
  const words = base.split(/\s+/).filter((w) => {
    const k = norm(w);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const q = words.slice(0, 9).join(" ");
  return q.length >= 3 && words.length >= 2 ? q : product.searchQuery;
}
