// Free, rule-based filters that run on every search, with or without AI:
// a listing whose title clearly names a different kind of item (shorts vs trousers)
// or a different colour (khaki vs navy) is removed. Words in 9 languages.

type Dict = Record<string, string[]>;

// Order matters: more specific kinds first (shorts before trousers, hoodie before sweater).
const KINDS: Dict = {
  // Football/sports shirts: listed as shirt, jersey, trikot, maillot, maglia, camiseta... all the same thing.
  jersey: ["jersey", "trikot", "heimtrikot", "auswartstrikot", "auswärtstrikot", "fussballtrikot", "fußballtrikot", "maillot", "maglia", "thuisshirt", "uitshirt", "voetbalshirt", "football shirt", "soccer jersey", "home shirt", "away shirt", "third shirt", "camiseta de futbol", "camiseta futbol", "camiseta 1", "koszulka meczowa", "matchtrøje", "fotbollströja", "kit "],
  shorts: ["shorts", "short ", "bermuda", "korte broek", "pantalon corto", "pantalón corto", "pantaloncini", "kurze hose", "pantaloncino", "spodenki", "pantalones cortos"],
  jeans: ["jeans", "denim", "spijkerbroek", "vaqueros", "vaquero"],
  trousers: ["trousers", "pants", "pant ", "chino", "broek", "hose", "pantalon", "pantalón", "pantalone", "pantaloni", "spodnie", "byxor", "bukser", "cargo", "jogger"],
  hoodie: ["hoodie", "hooded sweat", "kapuzenpullover", "felpa con cappuccio", "sweat à capuche", "sudadera con capucha", "capuchon"],
  sweater: ["sweater", "jumper", "pullover", "sweatshirt", "trui", "felpa", "sudadera", "maglione", "pull ", "knit"],
  tshirt: ["t-shirt", "tshirt", "tee ", "camiseta", "maglietta", "polo"],
  shirt: ["shirt", "overshirt", "hemd", "overhemd", "camicia", "chemise", "camisa", "koszula"],
  coat: ["coat", "parka", "jas ", "mantel", "cappotto", "manteau", "abrigo", "płaszcz", "trench"],
  jacket: ["jacket", "jack ", "jacke", "giacca", "giubbotto", "giubbino", "veste", "blouson", "chaqueta", "cazadora", "kurtka", "bomber", "anorak", "gilet", "bodywarmer"],
  dress: ["dress", "jurk", "kleid", "vestito", "robe ", "vestido", "sukienka"],
  skirt: ["skirt", "rok ", "rock ", "gonna", "jupe", "falda", "spódnica"],
  sneakers: ["sneaker", "trainer", "baskets", "zapatillas", "scarpe da ginnastica", "turnschuh", "dunk", "air max", "air force"],
  boots: ["boot", "laars", "stiefel", "stivale", "botte", "bota ", "botas", "kozaki"],
  sandals: ["sandal", "slide", "slipper", "teenslipper", "ciabatta", "chancla"],
  bag: ["bag", "tas ", "tasche", "borsa", "sac ", "bolso", "backpack", "rugzak", "rucksack", "zaino", "sac à dos", "mochila"],
  hat: ["cap ", "beanie", "hat ", "muts", "pet ", "mütze", "cappello", "bonnet", "gorra", "gorro"],
  socks: ["sock", "sokken", "socken", "calzini", "chaussettes", "calcetines"],
};

// Which kinds count as the same thing for the shopper.
const SAME_KIND: Record<string, string[]> = {
  trousers: ["trousers", "jeans"],
  jeans: ["jeans", "trousers"],
  jacket: ["jacket", "coat"],
  coat: ["coat", "jacket"],
  sweater: ["sweater", "hoodie"],
  hoodie: ["hoodie", "sweater"],
  jersey: ["jersey", "tshirt", "shirt"],
  shirt: ["shirt", "jacket"], // overshirts are often listed as shirt jackets
};

const COLOURS: Dict = {
  black: ["black", "zwart", "schwarz", "nero", "noir", "negro", "czarn", "svart", "sort"],
  white: ["white", "wit ", "weiß", "weiss", "bianco", "blanc", "blanco", "biał", "vit ", "hvid"],
  grey: ["grey", "gray", "grijs", "grau", "grigio", "gris", "szar", "antraciet", "anthracite", "charcoal"],
  navy: ["navy", "marine", "dark blue", "donkerblauw", "dunkelblau", "blu scuro", "blu navy", "bleu marine", "azul marino", "granat", "midnight"],
  blue: ["blue", "blauw", "blau", "blu ", "bleu", "azul", "niebiesk", "indigo", "denim blue", "sky"],
  beige: ["beige", "khaki", "kaki", "sand ", "stone ", "camel", "ecru", "cream", "crème", "tan ", "taupe", "écru", "crudo"],
  brown: ["brown", "bruin", "braun", "marrone", "marron", "marrón", "brąz", "chocolate", "cognac", "mocha"],
  green: ["green", "groen", "grün", "verde", "vert", "zielon", "olive", "olijf", "oliva", "khaki green", "army", "military"],
  red: ["red", "rood", "rot ", "rosso", "rouge", "rojo", "czerwon", "burgundy", "bordeaux", "wine"],
  pink: ["pink", "roze", "rosa", "rose ", "różow"],
  yellow: ["yellow", "geel", "gelb", "giallo", "jaune", "amarillo", "żółt", "mustard"],
  orange: ["orange", "oranje", "arancione", "naranja", "pomarańcz"],
  multi: ["two tone", "two-tone", "twotone", "bicolor", "bicolour", "bicolore", "multicolor", "multicolour", "multicolore", "tie dye", "tie-dye", "camo", "camouflage"],
  purple: ["purple", "paars", "lila", "viola", "violet", "morado", "fiolet"],
};

const COMPATIBLE: Record<string, string[]> = {
  navy: ["navy", "blue"],
  blue: ["blue", "navy"],
  beige: ["beige", "brown"],
  brown: ["brown", "beige", "green"],
  green: ["green", "brown"],
  grey: ["grey"],
  black: ["black"],
  red: ["red", "pink"],
  pink: ["pink", "red"],
  multi: ["multi"],
};

// Colour words that are part of the product's name ("Boston Red Sox", "Blue Jays", "Black Panther")
// say nothing about the item's colour: remove that phrase from titles before checking colour.
function nameColourPhrases(target: { brand: string; model?: string }): string[] {
  const words = norm(`${target.brand} ${target.model ?? ""}`).trim().split(" ");
  const all = Object.values(COLOURS).flat().map((w) => norm(w).trim());
  const out: string[] = [];
  words.forEach((w, i) => {
    if (all.some((c) => c && (w === c || w.startsWith(c)) && c.length > 2)) out.push(words.slice(i, i + 2).join(" "));
  });
  return out;
}
export function withoutNameColours(title: string, target: { brand: string; model?: string }): string {
  let t = norm(title);
  for (const p of nameColourPhrases(target)) t = t.split(` ${p} `).join(" ");
  return t;
}

// The colours the shopper wants (the item's own colour, not its name), e.g. "navy" for a navy Red Sox cap.
export function wantedColours(target: { brand: string; model?: string; colour?: string }): string[] {
  if (!target.colour || target.colour === "not specified") return [];
  return coloursOf(withoutNameColours(target.colour, target));
}

// True when the title names a colour that matches the wanted colour (not just "no contradiction").
export function colourConfirmed(title: string, target: { brand: string; model?: string; colour?: string }): boolean {
  const want = wantedColours(target);
  if (!want.length) return true;
  const ok = new Set(want.flatMap((c) => COMPATIBLE[c] ?? [c]));
  return coloursOf(withoutNameColours(title, target)).some((c) => ok.has(c));
}

const norm = (t: string) => ` ${t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ąćęłńóśźżß\s-]/g, " ").replace(/\s+/g, " ")} `;

// A word matches at the start of a word in the text ("chino" matches "chinos").
// A word written with a trailing space in the lists must also end there ("short " doesn't match "shorts"... but "shorts" is listed too).
function find(dict: Dict, text: string, firstOnly: boolean): string[] {
  const t = norm(text);
  const hits: string[] = [];
  for (const [key, words] of Object.entries(dict)) {
    const hit = words.some((w) => {
      const core = norm(w).trim();
      return t.includes(` ${core}${w.endsWith(" ") ? " " : ""}`);
    });
    if (hit) {
      hits.push(key);
      if (firstOnly) break;
    }
  }
  return hits;
}

const stripBrand = (title: string, brand: string) => {
  let t = title;
  for (const w of brand.split(/\s+/).filter((w) => w.length > 1)) t = t.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ");
  return t;
};

export function kindOf(text: string): string | null {
  return find(KINDS, text, true)[0] ?? null;
}

export function coloursOf(text: string): string[] {
  return find(COLOURS, text, false);
}

// True when the title clearly contradicts the target's kind or colour.
export function contradicts(title: string, target: { brand: string; productType?: string; model?: string; colour?: string }): boolean {
  const t = stripBrand(title, target.brand);
  const wantKind = kindOf(`${target.productType ?? ""} ${stripBrand(target.model ?? "", target.brand)}`);
  if (wantKind) {
    const got = kindOf(t);
    // "jersey" is also a fabric (jersey dress, jersey trousers): only a kind when we're looking for a sports shirt.
    if (got && got !== "jersey" && !(SAME_KIND[wantKind] ?? [wantKind]).includes(got)) return true;
    if (got === "jersey" && ["shirt", "tshirt"].includes(wantKind) === false && wantKind !== "jersey" && /\b(trikot|maillot|thuisshirt|uitshirt|voetbalshirt|football shirt|home shirt|away shirt)\b/i.test(t)) return true;
  }
  // Kids' versions are a different (cheaper) product, unless the shopper is looking for one.
  const KIDS = /\b(kids?|junior|juniors|youth|toddler|baby|infant|enfant|kinder|kinderen|niños?|nino|bambin[oi]|dziec|barn|jongens|meisjes|jr)\b/i;
  if (KIDS.test(t) && !KIDS.test(`${target.model ?? ""} ${target.productType ?? ""}`)) return true;
  const wantCols = wantedColours(target);
  if (wantCols.length) {
    const ok = new Set(wantCols.flatMap((c) => COMPATIBLE[c] ?? [c]));
    const got = coloursOf(withoutNameColours(t, target));
    if (got.length && !got.some((c) => ok.has(c))) return true;
  }
  return false;
}
