// Reads the API keys at request time (not at build time), trimming stray spaces or quotes
// from copy-pasting, and accepting a few common spellings of the variable names.
function read(...names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n]?.trim().replace(/^["']|["']$/g, "");
    if (v) return v;
  }
  return null;
}

export const serpApiKey = () => read("SERPAPI_API_KEY", "SERPAPI_KEY", "SERP_API_KEY", "SERPAPI");
export const anthropicKey = () => read("ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "ANTHROPIC_KEY");
export const geminiKey = () => read("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_API_KEY");
export const ebayClientId = () => read("EBAY_CLIENT_ID", "EBAY_APP_ID");
export const ebayClientSecret = () => read("EBAY_CLIENT_SECRET", "EBAY_CERT_ID");
export const serperKey = () => read("SERPER_API_KEY", "SERPER_KEY");
export const searchApiKey = () => read("SEARCHAPI_API_KEY", "SEARCHAPI_KEY", "SEARCH_API_KEY");
export const scrapingdogKey = () => read("SCRAPINGDOG_API_KEY", "SCRAPINGDOG_KEY");
export const bolClientId = () => read("BOL_CLIENT_ID");
export const bolClientSecret = () => read("BOL_CLIENT_SECRET");
export const bolSiteId = () => read("BOL_SITE_ID", "BOL_PARTNER_ID");
export const databaseUrl = () => read("DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL");
