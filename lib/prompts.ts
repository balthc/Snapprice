import type { Product } from "./types";

export const IDENTIFY_PROMPT = `You identify products from screenshots so a price-comparison site can find the exact same item in other webshops.
Look at everything in the image: logos, labels, product text, shop page titles, prices, and the item itself.
Return the specific product (brand, official model name, colour, article code) rather than a generic description.
Only give an article code when it is visible or you are confident it is the right one; a wrong code ruins the search.
If the image shows several products, pick the main one.
The searchQuery must be what a shopper would type into Google Shopping to find exactly this item: brand + model + colour, no sizes, no filler.`;

export function identifyText(hint?: string, lensTitles: string[] = []): string {
  return [
    hint ? `Extra info from the shopper: ${hint}` : "",
    lensTitles.length
      ? `Google Lens found these similar listings online (use them to get the exact name and code, but trust the image):\n${lensTitles.map((t) => `- ${t}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n") || "Identify this product.";
}

export function classifyPrompt(product: Product, titles: string[]): string {
  const list = titles.map((t, i) => `${i}: ${t}`).join("\n");
  return `Target product: ${product.brand} ${product.model}, colour ${product.colour}${product.articleCode ? `, article code ${product.articleCode}` : ""} (${product.category}).

Below are webshop listing titles in several languages. For each, say:
- "exact": same brand, same model, same colour (or colour not stated in the title)
- "likely": same brand and model but you cannot be sure about colour or version
- "different": another model, another colour, a copy, an accessory, or a different product

${list}`;
}
