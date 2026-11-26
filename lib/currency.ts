// Converts foreign prices to EUR using the European Central Bank rates (via frankfurter.app, free, no key).
// Falls back to fixed approximate rates if that service is unreachable.
const FALLBACK: Record<string, number> = { EUR: 1, PLN: 4.3, DKK: 7.46, SEK: 11.3, GBP: 0.85, CHF: 0.94, NOK: 11.6, CZK: 25, HUF: 395, RON: 4.98, BGN: 1.96, USD: 1.08 };

let cache: { at: number; rates: Record<string, number> } | null = null;

export async function eurRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < 6 * 3600_000) return cache.rates;
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { rates: Record<string, number> };
    cache = { at: Date.now(), rates: { ...FALLBACK, ...data.rates, EUR: 1 } };
    return cache.rates;
  } catch {
    return FALLBACK;
  }
}

export function toEur(amount: number, currency: string, rates: Record<string, number>): number {
  const r = rates[currency] ?? FALLBACK[currency];
  if (!r) return amount;
  return Math.round((amount / r) * 100) / 100;
}
