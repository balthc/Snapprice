export type Product = {
  brand: string;
  model: string;
  colour: string;
  articleCode: string | null;
  category: string;
  searchQuery: string;
  confidence: "high" | "medium" | "low";
  notes: string;
};

export type Offer = {
  country: string; // ISO code, e.g. "IT"
  shop: string;
  title: string;
  url: string;
  thumbnail: string | null;
  price: number; // item price in EUR
  oldPrice: number | null; // pre-discount price in EUR, if shown
  shipping: number | null; // shipping in EUR as listed by the shop; null = unknown
  total: number; // price + shipping (unknown shipping counted as 0)
  currency: string; // original currency
  rating: number | null;
  reviews: number | null;
  match: "exact" | "likely" | "unsure";
};

export type SearchResult = {
  offers: Offer[];
  countries: string[];
  usualPrice: number | null;
  demo: boolean;
  warnings: string[];
};
