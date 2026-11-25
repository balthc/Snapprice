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
