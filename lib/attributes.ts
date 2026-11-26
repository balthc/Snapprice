// Free, rule-based filters that run on every search, with or without AI:
// a listing whose title clearly names a different kind of item (shorts vs trousers)
// or a different colour (khaki vs navy) is removed. Words in 9 languages.

type Dict = Record<string, string[]>;

// Order matters: more specific kinds first (shorts before trousers, hoodie before sweater).
const KINDS: Dict = {
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
};

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
    if (got && !(SAME_KIND[wantKind] ?? [wantKind]).includes(got)) return true;
  }
  const wantCols = target.colour && target.colour !== "not specified" ? coloursOf(target.colour) : [];
  if (wantCols.length) {
    const ok = new Set(wantCols.flatMap((c) => COMPATIBLE[c] ?? [c]));
    const got = coloursOf(t);
    if (got.length && !got.some((c) => ok.has(c))) return true;
  }
  return false;
}
