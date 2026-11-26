// Exact-variant check: the season/year, the kit (home/away/third) and the version (authentic/replica)
// must match. A 26/27 Ajax home shirt never shows a 25/26 one, even if they look alike.
//  - "conflict": the listing names another season, kit or version → removed
//  - "unverified": the listing doesn't say → only shown under "similar", unless the shop page confirms it
//  - "ok": everything the shopper specified is confirmed
import type { Product } from "./types";

const norm = (t: string) => ` ${t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ")} `;

// "2026/27", "26/27", "2026-2027", "26-27", "2026/2027", "26–27" → "2026/27". A lone year → "2026".
export function seasonsOf(text: string): { seasons: string[]; years: string[] } {
  const t = text.replace(/[–—]/g, "-");
  const seasons = new Set<string>();
  for (const m of t.matchAll(/(?<![\d])(20)?(\d{2})\s*[/\-]\s*(20)?(\d{2})(?![\d])/g)) {
    const a = Number(m[2]);
    const b = Number(m[4]);
    if (b === (a + 1) % 100 && a >= 10 && a <= 40) seasons.add(`20${m[2]}/${m[4]}`);
  }
  const years = new Set<string>();
  const rest = t.replace(/(?<![\d])(20)?(\d{2})\s*[/\-]\s*(20)?(\d{2})(?![\d])/g, " ");
  for (const m of rest.matchAll(/(?<![\d])(20[1-4]\d)(?![\d])/g)) years.add(m[1]);
  return { seasons: [...seasons], years: [...years] };
}

const KITS: Record<string, string[]> = {
  home: ["home", "thuis", "heim", "domicile", "casa", "local ", "primera", "1st", "1a ", "1ª", "first kit"],
  away: ["away", "uit ", "uitshirt", "auswarts", "auswärts", "exterieur", "extérieur", "trasferta", "visitante", "fuera", "segunda", "2nd", "2a ", "2ª"],
  third: ["third", "derde", "ausweich", "troisieme", "troisième", "tercera", "terza", "3rd", "3a ", "3ª"],
  fourth: ["fourth", "vierde", "4th"],
  goalkeeper: ["goalkeeper", "keeper", "torwart", "gardien", "portero", "portiere"],
  training: ["training", "pre-match", "prematch", "warm-up", "warm up", "aufwarm"],
};
const VERSIONS: Record<string, string[]> = {
  authentic: ["authentic", "player", "match ", "heat.rdy", "dri-fit adv", "vaporknit", "spieler", "speler"],
  replica: ["replica", "stadium", "fan ", "fanshirt", "fan version"],
};

function pick(dict: Record<string, string[]>, text: string): string[] {
  const t = norm(text);
  return Object.entries(dict)
    .filter(([, words]) => words.some((w) => new RegExp(`(^|[^a-z0-9])${w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${w.endsWith(" ") ? "([^a-z0-9]|$)" : ""}`).test(t)))
    .map(([k]) => k);
}

export const kitOf = (text: string) => pick(KITS, text);
export const versionOf = (text: string) => pick(VERSIONS, text);

// What the shopper's product specifies (from the season/kit/version fields, or its name).
export function wanted(product: Product): { season: string | null; year: string | null; kit: string | null; version: string | null } {
  const src = `${product.season ?? ""}`;
  const s = seasonsOf(src);
  const fromName = seasonsOf(product.model);
  const season = s.seasons[0] ?? fromName.seasons[0] ?? null;
  const year = season ? null : s.years[0] ?? null;
  const kit = (product.kit && kitOf(product.kit)[0]) || kitOf(product.model)[0] || null;
  const version = (product.version && versionOf(product.version)[0]) || versionOf(product.model)[0] || null;
  return { season, year, kit, version };
}

export type VariantStatus = "ok" | "unverified" | "conflict";

export function variantCheck(text: string, product: Product): VariantStatus {
  const want = wanted(product);
  if (!want.season && !want.year && !want.kit && !want.version) return "ok";
  let unverified = false;
  const got = seasonsOf(text);
  if (want.season) {
    const [a, b] = [want.season.slice(0, 4), `20${want.season.slice(5)}`];
    if (got.seasons.length) {
      if (!got.seasons.includes(want.season)) return "conflict";
    } else if (got.years.length) {
      // A lone year can't confirm a season, but a year outside it rules it out.
      if (!got.years.some((y) => y === a || y === b)) return "conflict";
      unverified = true;
    } else unverified = true;
  } else if (want.year) {
    if (got.years.length && !got.years.includes(want.year)) return "conflict";
    if (!got.years.includes(want.year)) unverified = true;
  }
  if (want.kit) {
    const kits = kitOf(text);
    if (kits.length && !kits.includes(want.kit)) return "conflict";
    if (!kits.length) unverified = true;
  }
  if (want.version) {
    const v = versionOf(text);
    if (v.length && !v.includes(want.version)) return "conflict";
    // Most shops don't name the version; not naming it is fine.
  }
  return unverified ? "unverified" : "ok";
}

// Short label for the shopper, e.g. "2026/27 · home".
export function variantLabel(product: Product): string {
  const w = wanted(product);
  return [w.season ?? w.year, w.kit, w.version].filter(Boolean).join(" · ");
}
