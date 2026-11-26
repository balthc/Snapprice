import type { Product } from "./types";

export const IDENTIFY_PROMPT = `You identify products from screenshots so a price-comparison site can find the exact same item in other webshops.
Look at everything in the image: logos, labels, product text, shop page titles, prices, and the item itself.
Return the specific product (brand, official model name, colour, article code) rather than a generic description.
Only give an article code when it is visible or you are confident it is the right one; a wrong code ruins the search.
If the image shows several products, pick the main one.

Brands sell many different items under one name (e.g. many different Stone Island jackets), so describe what makes THIS item different:
- productType: the precise kind of item, e.g. "hooded padded jacket", "overshirt", "low-top sneaker", "wide-leg carpenter trousers".
- features: 3 to 6 short visual details that tell it apart from the brand's other items, e.g. "hood with drawcords", "two large flap pockets", "padded/insulated", "no collar", "zip and press-stud front".
- colour: the precise colour as a shopper would say it, e.g. "dark olive brown", not just "green".

Many products exist in near-identical yearly versions (football shirts per season, yearly sneaker or phone models). Fill in:
- season: the season or model year, e.g. "2026/27" or "2025", only when you can read it or are confident (sponsor, badge, kit design from Lens titles). Empty if unsure.
- kit: for sports shirts, "home", "away", "third", "goalkeeper" or "training". Empty otherwise.
- version: for sports shirts, "authentic" (player) or "replica" (fan) if visible. Empty otherwise.

searchQuery: what a shopper would type into Google Shopping to find exactly this item.
Use brand + official model name/code if you know it; otherwise brand + productType + colour + the most telling feature.
No sizes, no filler. Example: "Stone Island hooded padded jacket dark brown" rather than "Stone Island jacket".`;

export function identifyText(hint?: string, lensTitles: string[] = []): string {
  return [
    hint ? `Extra info from the shopper: ${hint}` : "",
    lensTitles.length
      ? `Google Lens found these similar listings online. Use them to find the exact name and code, but only if they match what you see in the image; Lens also returns look-alikes:\n${lensTitles.map((t) => `- ${t}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n") || "Identify this product.";
}

export function describe(product: Product): string {
  return [
    `${product.brand} ${product.model}`.trim(),
    product.productType ? `type: ${product.productType}` : "",
    product.colour && product.colour !== "not specified" ? `colour: ${product.colour}` : "",
    product.articleCode ? `article code: ${product.articleCode}` : "",
    product.season ? `season/year: ${product.season} (another season or year is a different product)` : "",
    product.kit ? `kit: ${product.kit}` : "",
    product.version ? `version: ${product.version}` : "",
    product.features?.length ? `details: ${product.features.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function classifyPrompt(product: Product, titles: string[]): string {
  const list = titles.map((t, i) => `${i}: ${t}`).join("\n");
  return `Target product: ${describe(product)} (${product.category}).

Below are webshop listing titles in several languages (shops write the same item differently: "Ajax thuisshirt", "Heimtrikot", "maillot domicile" and "home jersey" are the same thing).
For each, say:
- "exact": same brand or team and same model (or clearly the same item and details). A title that doesn't mention the colour, season or every detail still counts as exact when nothing in it contradicts the target.
- "likely": same brand and item type, but it could well be another model.
- "different": another item type (e.g. shorts vs shirt), another model or season, another colour, a kids' version (unless the target is for kids), a copy, or an accessory.

${list}`;
}

export const VERIFY_PROMPT = `You check shop listings for a price-comparison site. The first image is the product the shopper wants.
Each following image is a shop's product photo. Compare each one with the first image and answer:
- "same": the same product in the same colourway: same item type, cut and silhouette, and EVERY main colour matches (e.g. for a cap: crown, visor and logo colours; for shoes: upper, sole and logo). Same details (hood or collar, pockets, padding, closures, logo placement and size). Different photo angle, lighting or background is fine.
- A two-tone version of a single-colour item, a different visor or sole colour, or a different logo colour is NOT the same.
- "similar": same brand and same kind of item, but a different model, colour or details.
- "different": anything else, or the photo is unclear.
Be strict. When in doubt, choose "similar", not "same". A wrong "same" sends the shopper to the wrong product.`;
