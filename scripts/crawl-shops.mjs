// Small-shop index crawler. Runs every night on GitHub Actions (free) and refreshes the public
// product data of independent webshops into the database, so one-day sales show up the next morning.
//
// Polite by design:
//  - identifies itself as SnappriceBot with a link to /bot (how to opt out)
//  - respects robots.txt (rules for "SnappriceBot" or "*", and Crawl-delay)
//  - one request at a time per shop, at least 1.5 seconds apart
//  - only reads public product data (Shopify /products.json, WooCommerce Store API,
//    or product pages listed in the shop's sitemap with schema.org Product data)
//  - shops that opt out (OPTOUT_DOMAINS, or status 'optout' in the shops table) are never visited
//
// Env: DATABASE_URL (required), SITE_URL (your live site, for the bot page link),
//      CRAWL_MINUTES (time budget, default 40), CRAWL_PARALLEL (shops at once, default 8),
//      OPTOUT_DOMAINS (comma separated), MAX_PAGES_SITEMAP (product pages per shop per night, default 250)
import fs from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL not set: nothing to crawl.");
  process.exit(0);
}
const sql = postgres(url, { max: 4, prepare: false, ssl: /sslmode=disable/.test(url) ? false : "require", connect_timeout: 15 });

const SCHEME = process.env.CRAWL_SCHEME || "https"; // "http" only for local tests
const SITE = (process.env.SITE_URL || "https://snapprice-six.vercel.app").replace(/\/$/, "");
const UA = `Mozilla/5.0 (compatible; SnappriceBot/1.0; +${SITE}/bot)`;
const BUDGET_MS = Number(process.env.CRAWL_MINUTES || 40) * 60_000;
const PARALLEL = Number(process.env.CRAWL_PARALLEL || 24); // different shops at once; each shop still gets 1 request at a time
const MAX_SITEMAP = Number(process.env.MAX_PAGES_SITEMAP || 150);
// Keep the free database (Supabase: 500 MB) from filling up.
const MAX_PER_SHOP = Number(process.env.MAX_PRODUCTS_PER_SHOP || 3000);
const DB_LIMIT_MB = Number(process.env.DB_LIMIT_MB || 420);
// Split the work over several parallel GitHub jobs (shards), each with its own time budget.
const SHARD = Number(process.env.SHARD || 0);
const SHARDS = Number(process.env.SHARDS || 1);
const MIN_GAP_MS = 1500;
const started = Date.now();
const timeLeft = () => BUDGET_MS - (Date.now() - started);
const OPTOUT = new Set((process.env.OPTOUT_DOMAINS || "").split(",").map((d) => d.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean));

const TLD = { nl: "NL", be: "BE", de: "DE", fr: "FR", it: "IT", es: "ES", at: "AT", pt: "PT", ie: "IE", fi: "FI", pl: "PL", dk: "DK", se: "SE", lu: "LU", uk: "UK", ch: "CH", gr: "GR", cz: "CZ", hu: "HU", ro: "RO", bg: "BG", hr: "HR", si: "SI", sk: "SK", ee: "EE", lv: "LV", lt: "LT", no: "NO", cy: "CY", mt: "MT" };
const CUR = { PL: "PLN", DK: "DKK", SE: "SEK", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", UK: "GBP", CH: "CHF", NO: "NOK" };
const countryOf = (domain) => TLD[domain.split(".").pop()] ?? "EU";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- polite fetching ------------------------------------------------------------------------------
function politeFetcher(domain, delayMs) {
  let last = 0;
  return async (path, accept = "*/*", maxBytes = 3_000_000) => {
    const wait = last + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(path.startsWith("http") ? path : `${SCHEME}://${domain}${path}`, {
      headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en,nl;q=0.8,de;q=0.6,fr;q=0.5,it;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok || !res.body) return { status: res.status, text: "", type: res.headers.get("content-type") || "" };
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    return { status: res.status, text: Buffer.concat(chunks).toString("utf8"), type: res.headers.get("content-type") || "" };
  };
}

// --- robots.txt ----------------------------------------------------------------------------------
async function robots(domain) {
  try {
    const res = await fetch(`${SCHEME}://${domain}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401 || res.status === 403) return { allowed: () => false, delay: 0, sitemaps: [] };
    if (!res.ok) return { allowed: () => true, delay: 0, sitemaps: [] };
    const lines = (await res.text()).split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
    const groups = []; // { agents: [], rules: [{allow, path}], delay }
    const sitemaps = [];
    let cur = null;
    let lastWasAgent = false;
    for (const line of lines) {
      const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === "sitemap") { sitemaps.push(val); continue; }
      if (key === "user-agent") {
        if (!lastWasAgent || !cur) { cur = { agents: [], rules: [], delay: 0 }; groups.push(cur); }
        cur.agents.push(val.toLowerCase());
        lastWasAgent = true;
        continue;
      }
      lastWasAgent = false;
      if (!cur) continue;
      if (key === "allow" || key === "disallow") { if (val || key === "allow") cur.rules.push({ allow: key === "allow", path: val }); }
      if (key === "crawl-delay") cur.delay = Math.min(30, Number(val) || 0);
    }
    const mine = groups.find((g) => g.agents.some((a) => a.includes("snappricebot"))) ?? groups.find((g) => g.agents.includes("*"));
    const rules = mine?.rules ?? [];
    const toRe = (p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    const allowed = (path) => {
      let best = null;
      for (const r of rules) {
        if (!r.path) continue;
        if (toRe(r.path).test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
      }
      return !best || best.allow;
    };
    return { allowed, delay: (mine?.delay ?? 0) * 1000, sitemaps };
  } catch {
    return { allowed: () => true, delay: 0, sitemaps: [] };
  }
}

// --- product readers -----------------------------------------------------------------------------
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function crawlShopify(shop, get, rb) {
  if (!rb.allowed("/products.json")) return null;
  const first = await get("/products.json?limit=1", "application/json");
  if (!first.type.includes("json") || !first.text.includes('"products"')) return null;
  let currency = shop.currency;
  if (!currency && rb.allowed("/cart.js")) {
    try { currency = JSON.parse((await get("/cart.js", "application/json")).text).currency; } catch { /* keep default */ }
  }
  currency ||= CUR[shop.country] ?? "EUR";
  const out = [];
  for (let page = 1; page <= 40 && timeLeft() > 60_000; page++) {
    const r = await get(`/products.json?limit=250&page=${page}`, "application/json", 8_000_000);
    let products = [];
    try { products = JSON.parse(r.text).products ?? []; } catch { break; }
    if (!products.length) break;
    for (const p of products) {
      const variants = p.variants ?? [];
      const avail = variants.filter((v) => v.available !== false);
      const cheapest = (avail.length ? avail : variants).reduce((a, v) => (num(v.price) && (!a || num(v.price) < num(a.price)) ? v : a), null);
      const price = num(cheapest?.price);
      if (!price) continue;
      const was = num(cheapest?.compare_at_price);
      out.push({
        id: `shop:${shop.domain}:${p.id}`,
        title: [p.vendor && !String(p.title).toLowerCase().includes(String(p.vendor).toLowerCase()) ? p.vendor : "", p.title].filter(Boolean).join(" "),
        brand: p.vendor || null,
        size: avail.map((v) => v.title).filter((t) => t && t !== "Default Title").slice(0, 30).join(", ") || null,
        ean: variants.find((v) => /^\d{8,14}$/.test(v.barcode || ""))?.barcode ?? null,
        price, old_price: was && was > price ? was : null, currency,
        url: `${SCHEME}://${shop.domain}/products/${p.handle}`,
        image: p.images?.[0]?.src ?? null,
        in_stock: avail.length > 0,
      });
    }
    if (products.length < 250) break;
  }
  return { platform: "shopify", currency, products: out, complete: true };
}

async function crawlWoo(shop, get, rb) {
  const base = "/wp-json/wc/store/v1/products";
  if (!rb.allowed(base)) return null;
  const first = await get(`${base}?per_page=1`, "application/json");
  if (!first.type.includes("json") || !first.text.trim().startsWith("[")) return null;
  const out = [];
  let currency = shop.currency;
  for (let page = 1; page <= 100 && timeLeft() > 60_000; page++) {
    const r = await get(`${base}?per_page=100&page=${page}`, "application/json", 8_000_000);
    let products = [];
    try { products = JSON.parse(r.text); } catch { break; }
    if (!Array.isArray(products) || !products.length) break;
    for (const p of products) {
      const pr = p.prices ?? {};
      const unit = 10 ** Number(pr.currency_minor_unit ?? 2);
      const price = num(pr.price) ? num(pr.price) / unit : null;
      if (!price || !p.permalink) continue;
      const regular = num(pr.regular_price) ? num(pr.regular_price) / unit : null;
      currency = pr.currency_code || currency;
      out.push({
        id: `shop:${shop.domain}:${p.id}`,
        title: String(p.name || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#8211;/g, "-"),
        brand: p.brands?.[0]?.name ?? null,
        size: null, ean: null,
        price, old_price: regular && regular > price ? regular : null, currency: pr.currency_code || currency || "EUR",
        url: p.permalink,
        image: p.images?.[0]?.src ?? null,
        in_stock: p.is_in_stock !== false,
      });
    }
    if (products.length < 100) break;
  }
  return { platform: "woocommerce", currency, products: out, complete: true };
}

// Any other shop (Shopware, Lightspeed, PrestaShop, Magento, ...): product pages from the sitemap,
// read with the schema.org Product data shops publish for Google.
function productFromHtml(html) {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const v = stack.pop();
      if (!v || typeof v !== "object") continue;
      if (Array.isArray(v)) { stack.push(...v); continue; }
      if (v["@graph"]) stack.push(v["@graph"]);
      const t = v["@type"];
      if (t === "Product" || (Array.isArray(t) && t.includes("Product")) || t === "ProductGroup") {
        const offers = [v.offers, ...(v.hasVariant ?? []).map((x) => x.offers)].flat().filter(Boolean).flatMap((o) => (o.offers ? [o, ...[o.offers].flat()] : [o]));
        const o = offers.find((x) => num(x.price ?? x.lowPrice));
        if (!o || !v.name) continue;
        const img = Array.isArray(v.image) ? v.image[0] : v.image;
        return {
          title: String(v.name), brand: typeof v.brand === "string" ? v.brand : v.brand?.name ?? null,
          price: num(o.price ?? o.lowPrice), currency: o.priceCurrency || null,
          ean: v.gtin13 || v.gtin || null, image: typeof img === "string" ? img : img?.url ?? null,
          in_stock: !/OutOfStock|SoldOut|Discontinued/i.test(String(o.availability || "")),
        };
      }
    }
  }
  return null;
}

async function sitemapUrls(shop, get, rb) {
  const queue = rb.sitemaps.length ? [...rb.sitemaps] : [`${SCHEME}://${shop.domain}/sitemap.xml`];
  const seen = new Set();
  const urls = [];
  while (queue.length && seen.size < 30 && urls.length < 20000) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const r = await get(sm, "application/xml,text/xml", 20_000_000);
    if (!r.text) continue;
    for (const m of r.text.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      const loc = m[1].replace(/&amp;/g, "&");
      // product sitemaps first
      if (/product|produit|prodotti|artikel|item/i.test(loc)) queue.unshift(loc); else queue.push(loc);
    }
    for (const m of r.text.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1]?.replace(/&amp;/g, "&");
      const mod = m[1].match(/<lastmod>\s*([^<\s]+)/)?.[1] ?? "";
      if (loc) urls.push({ loc, mod });
    }
  }
  // Likely product pages, most recently changed first (sales and new arrivals).
  const productish = urls.filter((u) => /\/(product|products|produkt|produit|prodotto|p|item|artikel)\/|-p-?\d+|\/\d{4,}|\.html$/i.test(u.loc));
  return (productish.length ? productish : urls).sort((a, b) => (b.mod > a.mod ? 1 : -1)).map((u) => u.loc);
}

async function crawlSitemap(shop, get, rb) {
  const urls = (await sitemapUrls(shop, get, rb)).filter((u) => {
    try { return new URL(u).host.replace(/^www\./, "") === shop.domain.replace(/^www\./, "") && rb.allowed(new URL(u).pathname); } catch { return false; }
  });
  if (!urls.length) return null;
  const out = [];
  let misses = 0;
  for (const u of urls.slice(0, MAX_SITEMAP)) {
    if (timeLeft() < 60_000 || misses > 25) break;
    const r = await get(u, "text/html", 1_500_000).catch(() => ({ text: "" }));
    const p = r.text ? productFromHtml(r.text) : null;
    if (!p || !p.price) { misses++; continue; }
    misses = 0;
    out.push({ id: `shop:${shop.domain}:${u}`.slice(0, 500), title: p.title, brand: p.brand, size: null, ean: p.ean,
      price: p.price, old_price: null, currency: p.currency || shop.currency || CUR[shop.country] || "EUR", url: u, image: p.image, in_stock: p.in_stock });
  }
  if (!out.length) return null;
  return { platform: "sitemap", currency: out[0].currency, products: out, complete: false };
}

// --- one shop ------------------------------------------------------------------------------------
async function crawlShop(shop) {
  const bare = shop.domain.replace(/^www\./, "");
  if (OPTOUT.has(bare)) {
    await sql`update shops set status = 'optout' where domain = ${shop.domain}`;
    return;
  }
  const rb = await robots(shop.domain);
  if (!rb.allowed("/")) {
    await sql`update shops set status = 'blocked', last_crawled = now() where domain = ${shop.domain}`;
    console.log(`${shop.domain}: blocked by robots.txt, skipped`);
    return;
  }
  const get = politeFetcher(shop.domain, Math.max(MIN_GAP_MS, rb.delay));
  let result = null;
  try {
    const order = shop.platform === "woocommerce" ? [crawlWoo, crawlShopify, crawlSitemap] : shop.platform === "sitemap" ? [crawlSitemap] : [crawlShopify, crawlWoo, crawlSitemap];
    for (const fn of order) {
      result = await fn(shop, get, rb).catch((e) => { console.log(`${shop.domain} ${fn.name}: ${e.message}`); return null; });
      if (result) break;
    }
  } catch (e) {
    console.log(`${shop.domain}: ${e.message}`);
  }
  if (!result || !result.products.length) {
    await sql`update shops set status = 'failed', fails = fails + 1, last_crawled = now() where domain = ${shop.domain}`;
    console.log(`${shop.domain}: no product data found`);
    return;
  }
  const feed = `shop:${shop.domain}`;
  const stamp = new Date();
  // In-stock products first, then the per-shop cap (big catalogues would crowd out small shops).
  const kept = [...result.products].sort((a, b) => Number(b.in_stock) - Number(a.in_stock)).slice(0, MAX_PER_SHOP);
  const rows = kept.filter((p) => p.in_stock).map((p) => ({
    id: p.id, feed, network: "index", merchant: shop.name || bare, country: shop.country, title: p.title.slice(0, 500),
    brand: p.brand, colour: null, size: p.size, ean: p.ean, price: p.price, old_price: p.old_price, shipping: null,
    currency: (p.currency || "EUR").toUpperCase(), url: p.url, image: p.image, in_stock: p.in_stock, updated_at: stamp,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    await sql`
      insert into products ${sql(batch, "id", "feed", "network", "merchant", "country", "title", "brand", "colour", "size", "ean", "price", "old_price", "shipping", "currency", "url", "image", "in_stock", "updated_at")}
      on conflict (id) do update set
        merchant = excluded.merchant, country = excluded.country, title = excluded.title, brand = excluded.brand,
        size = excluded.size, ean = excluded.ean, price = excluded.price, old_price = excluded.old_price,
        currency = excluded.currency, url = excluded.url, image = excluded.image, in_stock = excluded.in_stock, updated_at = excluded.updated_at`;
  }
  // A full catalogue read: anything not seen tonight is gone or sold out.
  if (result.complete) await sql`update products set in_stock = false where feed = ${feed} and updated_at < ${stamp}`;
  await sql`
    update shops set status = 'ok', fails = 0, platform = ${result.platform}, currency = ${result.currency ?? null},
      products = ${rows.length}, last_crawled = now()
    where domain = ${shop.domain}`;
  console.log(`${shop.domain}: ${rows.length} products (${result.platform})`);
}

// --- main ------------------------------------------------------------------------------------------
async function main() {
  // Seed list from the repo.
  const seed = fs.existsSync("db/seed-shops.txt") ? fs.readFileSync("db/seed-shops.txt", "utf8") : "";
  const seeds = seed.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
    const [domain, country] = l.split(/\s+/);
    const d = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return { domain: d, country: (country || countryOf(d)).toUpperCase(), found_via: "seed" };
  });
  if (seeds.length && SHARD === 0) await sql`insert into shops ${sql(seeds, "domain", "country", "found_via")} on conflict (domain) do nothing`;

  // Database size guard: when near the free limit, only refresh shops already in the index.
  const [{ mb }] = await sql`select (pg_database_size(current_database()) / 1048576)::int as mb`;
  const full = mb > DB_LIMIT_MB;
  if (full) console.log(`Database is ${mb} MB (limit ${DB_LIMIT_MB} MB): refreshing known shops only, no new shops tonight.`);

  // Daily: shops never crawled first, then the ones crawled longest ago. Failing shops are retried less.
  const shops = await sql`
    select domain, name, country, currency, platform from shops
    where status not in ('optout', 'blocked') and (status <> 'failed' or fails < 3 or last_crawled < now() - interval '7 days')
      and (last_crawled is null or last_crawled < now() - interval '20 hours')
      and (${!full} or status = 'ok')
      and abs(hashtext(domain)) % ${SHARDS} = ${SHARD}
    order by (status = 'ok') desc, last_crawled asc nulls first
    limit 2000`;
  console.log(`${shops.length} shops to refresh, ${PARALLEL} at a time, ${Math.round(BUDGET_MS / 60000)} min budget`);
  let i = 0;
  const worker = async () => {
    while (i < shops.length && timeLeft() > 120_000) {
      const shop = shops[i++];
      await crawlShop(shop).catch((e) => console.log(`${shop.domain}: ${e.message}`));
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  // Cleanup: sold-out products that haven't come back for 3 days, and shops gone for 2 weeks.
  if (SHARD === 0) {
    const gone = await sql`delete from products where network = 'index' and not in_stock and updated_at < now() - interval '3 days'`;
    const stale = await sql`delete from products where network = 'index' and updated_at < now() - interval '14 days'`;
    console.log(`Cleanup: removed ${gone.count + stale.count} old products.`);
  }
  console.log(`Done in ${Math.round((Date.now() - started) / 60000)} min.`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end().catch(() => {});
  process.exit(1);
});
