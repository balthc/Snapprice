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
    product.features?.length ? `details: ${product.features.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function classifyPrompt(product: Product, titles: string[]): string {
  const list = titles.map((t, i) => `${i}: ${t}`).join("\n");
  return `Target product: ${describe(product)} (${product.category}).

Below are webshop listing titles in several languages. Be strict: the shopper wants this exact item, not something from the same brand.
For each, say:
- "exact": same brand and same model (or clearly the same item type and details), same colour or colour not stated
- "likely": same brand and same item type, but the title doesn't say enough to be sure it is the same model or colour
- "different": a different item type (e.g. overshirt vs hooded jacket), another model, another colour, a copy, an accessory, or kids' version

${list}`;
}

export const VERIFY_PROMPT = `You check shop listings for a price-comparison site. The first image is the product the shopper wants.
Each following image is a shop's product photo. Compare each one with the first image and answer:
- "same": the same product: same item type, same cut and silhouette, same colour, same details (hood or collar, pockets, padding, closures, logo placement). Different photo angle or background is fine.
- "similar": same brand and same kind of item, but a different model, colour or details.
- "different": anything else, or the photo is unclear.
Be strict. When in doubt, choose "similar", not "same". A wrong "same" sends the shopper to the wrong product.`;
