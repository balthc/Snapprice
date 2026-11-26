import type { Offer, Product } from "./types";

export const MOCK_PRODUCT: Product = {
  brand: "Carhartt WIP",
  model: "Double Knee Pant",
  colour: "Black rinsed",
  articleCode: "I031501",
  category: "trousers",
  searchQuery: "Carhartt WIP Double Knee Pant Black rinsed",
  confidence: "high",
  notes: "Demo mode: this is a sample product. Add your API keys to recognise real screenshots.",
};


export function mockOffers(): Offer[] {
  const rows: [string, string, number, number | null, number | null][] = [
    ["IT", "Moda Strada", 71.94, 119.9, 0],
    ["DE", "Werkhaus Berlin", 89.95, 119.9, 4.95],
    ["FR", "Atelier Nord", 99.0, 119.9, 0],
    ["ES", "Urbano Store", 104.9, 119.9, 6.5],
    ["BE", "Brussels Denim Co", 112.0, null, null],
    ["NL", "Denim Depot", 119.9, null, 0],
  ];
  return rows.map(([country, shop, price, oldPrice, shipping]) => ({
    source: "demo" as const,
    country,
    shop,
    title: "Carhartt WIP Double Knee Pant Black rinsed",
    url: "#demo",
    thumbnail: null,
    price,
    oldPrice,
    shipping,
    total: Math.round((price + (shipping ?? 0)) * 100) / 100,
    currency: "EUR",
    rating: 4.6,
    reviews: 120,
    match: "exact" as const,
  }));
}
