// Google Shopping settings per country: Google domain, interface language, currency.
export const COUNTRIES: Record<string, { name: string; domain: string; hl: string; currency: string }> = {
  nl: { name: "Netherlands", domain: "google.nl", hl: "nl", currency: "EUR" },
  be: { name: "Belgium", domain: "google.be", hl: "nl", currency: "EUR" },
  de: { name: "Germany", domain: "google.de", hl: "de", currency: "EUR" },
  fr: { name: "France", domain: "google.fr", hl: "fr", currency: "EUR" },
  it: { name: "Italy", domain: "google.it", hl: "it", currency: "EUR" },
  es: { name: "Spain", domain: "google.es", hl: "es", currency: "EUR" },
  at: { name: "Austria", domain: "google.at", hl: "de", currency: "EUR" },
  pt: { name: "Portugal", domain: "google.pt", hl: "pt", currency: "EUR" },
  ie: { name: "Ireland", domain: "google.ie", hl: "en", currency: "EUR" },
  fi: { name: "Finland", domain: "google.fi", hl: "fi", currency: "EUR" },
  pl: { name: "Poland", domain: "google.pl", hl: "pl", currency: "PLN" },
  dk: { name: "Denmark", domain: "google.dk", hl: "da", currency: "DKK" },
  se: { name: "Sweden", domain: "google.se", hl: "sv", currency: "SEK" },
};

export function searchCountries(): string[] {
  const raw = process.env.SEARCH_COUNTRIES || "nl,de,be,fr,it,es";
  return raw
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c in COUNTRIES);
}

export function homeCountry(): string {
  const c = (process.env.HOME_COUNTRY || "nl").toLowerCase();
  return c in COUNTRIES ? c : "nl";
}
