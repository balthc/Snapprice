// Shop discovery for the small-shop index: every webshop that shows up in a search result (or that a
// shopper clicks through to) is remembered, and the nightly crawler starts indexing it.
// Big marketplaces and non-shops are skipped. Only active when DATABASE_URL is set.
import { db, hasFeeds } from "./feeds";
import { countryFromUrl } from "./lens";

const SKIP = /(^|\.)(google|amazon|ebay|bol|zalando|aboutyou|aliexpress|temu|shein|wish|vinted|depop|grailed|stockx|klekt|facebook|instagram|pinterest|youtube|tiktok|reddit|wikipedia|idealo|kieskeurig|tweakers|pricerunner|kelkoo|beslist|vercel|serpapi|partner\.bol)\./i;

export async function rememberShops(items: { url: string; name?: string }[]): Promise<void> {
  if (!hasFeeds() || !items.length) return;
  const rows = new Map<string, { domain: string; name: string | null; country: string; found_via: string }>();
  for (const it of items) {
    let host: string;
    try {
      host = new URL(it.url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (SKIP.test(host) || !host.includes(".")) continue;
    const country = countryFromUrl(it.url);
    rows.set(host, { domain: host, name: it.name?.slice(0, 120) || null, country: country === "INT" ? "EU" : country, found_via: "search" });
  }
  if (!rows.size) return;
  const sql = db();
  const list = [...rows.values()].slice(0, 100);
  await Promise.race([
    sql`insert into shops ${sql(list, "domain", "name", "country", "found_via")} on conflict (domain) do nothing`.then(() => {}),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch((e) => console.error("rememberShops", (e as Error).message));
}
