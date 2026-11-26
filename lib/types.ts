export type Product = {
  brand: string;
  model: string;
  colour: string;
  articleCode: string | null;
  category: string;
  productType?: string; // e.g. "hooded padded jacket"
  features?: string[]; // visual details that tell it apart, e.g. "two flap pockets"
  fit?: string; // e.g. "slim", "regular", "wide"
  searchQuery: string;
  confidence: "high" | "medium" | "low";
  notes: string;
};

export type Offer = {
  source: "google" | "lens" | "ebay" | "feed" | "shop" | "demo";
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
  photo?: string; // product photo taken from the shop's own page (og:image / schema.org)
  strong?: "code" | "model"; // article code or full model name found in the title
  seen?: boolean; // photo compared with the shopper's screenshot and judged the same product
};

export type SearchResult = {
  offers: Offer[];
  similar: Offer[]; // same brand and kind of item, but not confirmed as the same product
  visualCheck: boolean; // true when result photos were compared with the screenshot
  checks?: { textCheck: string | null; photoCheck: string | null }; // which match checks actually ran
  countries: string[];
  sources: string[];
  usualPrice: number | null;
  demo: boolean;
  warnings: string[];
};

// Live progress for the search page, sent line by line while the search runs.
export type SearchEvent =
  | { t: "plan"; countries: string[]; sources: string[] }
  | { t: "phase"; phase: "searching" | "matching" | "photos" | "stock" }
  | { t: "found"; label: string; cc: string | null; n: number; shops: { shop: string; total: number; thumbnail: string | null }[] }
  | { t: "done"; result: SearchResult }
  | { t: "error"; error: string };
