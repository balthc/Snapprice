export type Product = {
  brand: string;
  model: string;
  colour: string;
  articleCode: string | null;
  category: string;
  productType?: string; // e.g. "hooded padded jacket"
  features?: string[]; // visual details that tell it apart, e.g. "two flap pockets"
  searchQuery: string;
  confidence: "high" | "medium" | "low";
  notes: string;
};

export type Offer = {
  source: "google" | "lens" | "ebay" | "demo";
  country: string; // ISO code of the shop / marketplace, e.g. "IT"
  shop: string;
  title: string;
  url: string; // link the shopper is sent to (the shop's own product page, or our /api/go resolver)
  thumbnail: string | null;
  price: number; // item price in EUR
  oldPrice: number | null; // pre-discount price in EUR, if shown
  shipping: number | null; // shipping in EUR as listed; null = unknown
  total: number; // price + shipping (unknown shipping counted as 0)
  currency: string; // original currency
  rating: number | null;
  reviews: number | null;
  match: "exact" | "likely" | "unsure";
  stock: "in" | "unknown"; // "in" = confirmed in stock; out-of-stock offers are removed
  seen?: boolean; // photo compared with the shopper's screenshot and judged the same product
};

export type SearchResult = {
  offers: Offer[];
  similar: Offer[]; // same brand and kind of item, but not confirmed as the same product
  visualCheck: boolean; // true when result photos were compared with the screenshot
  countries: string[];
  sources: string[];
  usualPrice: number | null;
  demo: boolean;
  warnings: string[];
};
