// Google Shopping settings per country: Google domain, interface language, currency.
// eu=false: outside the EU, so customs duties and VAT may be added when shipping to an EU address.
export type Country = { name: string; domain: string; hl: string; currency: string; eu: boolean };

export const COUNTRIES: Record<string, Country> = {
  nl: { name: "Netherlands", domain: "google.nl", hl: "nl", currency: "EUR", eu: true },
  be: { name: "Belgium", domain: "google.be", hl: "nl", currency: "EUR", eu: true },
  de: { name: "Germany", domain: "google.de", hl: "de", currency: "EUR", eu: true },
  fr: { name: "France", domain: "google.fr", hl: "fr", currency: "EUR", eu: true },
  it: { name: "Italy", domain: "google.it", hl: "it", currency: "EUR", eu: true },
  es: { name: "Spain", domain: "google.es", hl: "es", currency: "EUR", eu: true },
  at: { name: "Austria", domain: "google.at", hl: "de", currency: "EUR", eu: true },
  lu: { name: "Luxembourg", domain: "google.lu", hl: "fr", currency: "EUR", eu: true },
  pt: { name: "Portugal", domain: "google.pt", hl: "pt", currency: "EUR", eu: true },
  ie: { name: "Ireland", domain: "google.ie", hl: "en", currency: "EUR", eu: true },
  fi: { name: "Finland", domain: "google.fi", hl: "fi", currency: "EUR", eu: true },
  gr: { name: "Greece", domain: "google.gr", hl: "el", currency: "EUR", eu: true },
  sk: { name: "Slovakia", domain: "google.sk", hl: "sk", currency: "EUR", eu: true },
  si: { name: "Slovenia", domain: "google.si", hl: "sl", currency: "EUR", eu: true },
  hr: { name: "Croatia", domain: "google.hr", hl: "hr", currency: "EUR", eu: true },
  ee: { name: "Estonia", domain: "google.ee", hl: "et", currency: "EUR", eu: true },
  lv: { name: "Latvia", domain: "google.lv", hl: "lv", currency: "EUR", eu: true },
  lt: { name: "Lithuania", domain: "google.lt", hl: "lt", currency: "EUR", eu: true },
  pl: { name: "Poland", domain: "google.pl", hl: "pl", currency: "PLN", eu: true },
  cz: { name: "Czechia", domain: "google.cz", hl: "cs", currency: "CZK", eu: true },
  hu: { name: "Hungary", domain: "google.hu", hl: "hu", currency: "HUF", eu: true },
  ro: { name: "Romania", domain: "google.ro", hl: "ro", currency: "RON", eu: true },
  bg: { name: "Bulgaria", domain: "google.bg", hl: "bg", currency: "BGN", eu: true },
  dk: { name: "Denmark", domain: "google.dk", hl: "da", currency: "DKK", eu: true },
  se: { name: "Sweden", domain: "google.se", hl: "sv", currency: "SEK", eu: true },
  uk: { name: "United Kingdom", domain: "google.co.uk", hl: "en", currency: "GBP", eu: false },
  ch: { name: "Switzerland", domain: "google.ch", hl: "de", currency: "CHF", eu: false },
  no: { name: "Norway", domain: "google.no", hl: "no", currency: "NOK", eu: false },
};

// Countries searched when the shopper doesn't choose (each costs 1 SerpApi search).
export function searchCountries(): string[] {
  const raw = process.env.SEARCH_COUNTRIES || "nl,de,be,fr,it,es";
  return raw
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c in COUNTRIES);
}

// Most countries one search may use, to protect the free SerpApi plan.
export function maxCountries(): number {
  const n = parseInt(process.env.MAX_COUNTRIES_PER_SEARCH || "", 10);
  return Number.isFinite(n) && n > 0 ? n : 12;
}

export function homeCountry(): string {
  const c = (process.env.HOME_COUNTRY || "nl").toLowerCase();
  return c in COUNTRIES ? c : "nl";
}
