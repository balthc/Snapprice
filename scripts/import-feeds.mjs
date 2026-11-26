// Imports affiliate product feeds (CSV, optionally gzipped) into the products table.
// Runs every night via GitHub Actions (.github/workflows/import-feeds.yml), or by hand:
//   DATABASE_URL=... FEEDS='[...]' node scripts/import-feeds.mjs
//
// FEEDS is a JSON list. Each feed:
//   { "name": "awin-zalando-nl", "network": "awin", "merchant": "Zalando", "country": "NL",
//     "currency": "EUR", "url": "https://productdata.awin.com/datafeed/download/..." }
// "merchant", "country" and "currency" are used when the feed itself doesn't say.
// Column names of Awin, Daisycon, TradeTracker and most Google-style feeds are recognised automatically.

import postgres from "postgres";
import { parse } from "csv-parse";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

const DATABASE_URL = process.env.DATABASE_URL;
const FEEDS = JSON.parse(process.env.FEEDS || "[]");
if (!DATABASE_URL) {
  console.log("No DATABASE_URL set yet, skipping the import.");
  process.exit(0);
}
if (!FEEDS.length) {
  console.log("No FEEDS configured, nothing to import.");
  process.exit(0);
}

const sql = postgres(DATABASE_URL, { max: 2, prepare: false, ssl: /sslmode=disable/.test(DATABASE_URL) ? false : "require" });

// Possible column names per field (lower-case), in order of preference.
const COLS = {
  id: ["aw_product_id", "merchant_product_id", "product_id", "productid", "id", "sku", "offerid"],
  title: ["product_name", "title", "name", "productname", "product_title"],
  url: ["aw_deep_link", "deeplink", "deep_link", "affiliate_link", "trackinglink", "tracking_url", "link", "producturl", "product_url", "url"],
  price: ["search_price", "sale_price", "price", "display_price", "store_price", "current_price", "productprice", "price_inc_vat"],
  old: ["rrp_price", "product_price_old", "old_price", "original_price", "from_price", "price_old", "retail_price", "recommended_retail_price"],
  currency: ["currency", "price_currency"],
  image: ["aw_image_url", "merchant_image_url", "large_image", "image_url", "imageurl", "image_link", "image"],
  brand: ["brand_name", "brand", "manufacturer"],
  colour: ["colour", "color", "product_colour", "colours"],
  size: ["size", "sizes", "product_size", "size_stock_status"],
  merchant: ["merchant_name", "advertiser_name", "advertiser", "programname", "shop", "store", "merchant"],
  shipping: ["delivery_cost", "shipping_cost", "shippingcost", "delivery_costs", "shipping"],
  stock: ["in_stock", "stock_status", "availability", "instock", "is_in_stock", "stock_quantity", "stock"],
  ean: ["ean", "gtin", "ean13", "product_gtin", "upc"],
  country: ["country", "target_country", "shipping_country"],
};

function pick(row, field) {
  for (const k of COLS[field]) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function price(text) {
  if (!text) return null;
  const m = String(text).replace(/\s/g, "").match(/\d[\d.,]*/);
  if (!m) return null;
  let n = m[0];
  const last = Math.max(n.lastIndexOf(","), n.lastIndexOf("."));
  n = last >= 0 && n.length - last - 1 === 2 ? n.slice(0, last).replace(/[.,]/g, "") + "." + n.slice(last + 1) : n.replace(/[.,]/g, "");
  const v = parseFloat(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function inStock(text) {
  if (text === null) return true; // feeds usually only list available products
  const t = text.toLowerCase();
  if (/^(0|no|false|n|out|outofstock|out of stock|sold ?out|niet op voorraad|uitverkocht)$/.test(t)) return false;
  if (/^\d+$/.test(t)) return Number(t) > 0;
  return !/(out of stock|outofstock|sold out|uitverkocht)/.test(t);
}

async function importFeed(feed) {
  const started = new Date();
  console.log(`Importing ${feed.name} …`);
  const res = await fetch(feed.url);
  if (!res.ok || !res.body) throw new Error(`${feed.name}: download failed (${res.status})`);
  let stream = Readable.fromWeb(res.body);
  const gz = feed.url.includes("gzip") || feed.url.endsWith(".gz") || (res.headers.get("content-type") || "").includes("gzip");
  if (gz) stream = stream.pipe(createGunzip());

  const parser = stream.pipe(
    parse({
      columns: (h) => h.map((c) => c.trim().toLowerCase().replace(/^﻿/, "")),
      delimiter: [",", ";", "\t", "|"],
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      bom: true,
    })
  );

  let batch = [];
  let count = 0;
  const flush = async () => {
    if (!batch.length) return;
    await sql`
      insert into products ${sql(batch, "id", "feed", "network", "merchant", "country", "title", "brand", "colour", "size", "ean", "price", "old_price", "shipping", "currency", "url", "image", "in_stock", "updated_at")}
      on conflict (id) do update set
        merchant = excluded.merchant, country = excluded.country, title = excluded.title, brand = excluded.brand,
        colour = excluded.colour, size = excluded.size, ean = excluded.ean, price = excluded.price,
        old_price = excluded.old_price, shipping = excluded.shipping, currency = excluded.currency,
        url = excluded.url, image = excluded.image, in_stock = excluded.in_stock, updated_at = excluded.updated_at`;
    count += batch.length;
    batch = [];
  };

  for await (const row of parser) {
    const title = pick(row, "title");
    const url = pick(row, "url");
    const p = price(pick(row, "price"));
    if (!title || !url || !p) continue;
    const old = price(pick(row, "old"));
    const ship = price(pick(row, "shipping"));
    const id = `${feed.name}:${pick(row, "id") || url}`.slice(0, 500);
    batch.push({
      id,
      feed: feed.name,
      network: feed.network || "other",
      merchant: pick(row, "merchant") || feed.merchant || "Shop",
      country: (pick(row, "country") || feed.country || "NL").slice(0, 2).toUpperCase(),
      title: title.slice(0, 400),
      brand: pick(row, "brand"),
      colour: pick(row, "colour"),
      size: pick(row, "size"),
      ean: pick(row, "ean"),
      price: p,
      old_price: old && old > p ? old : null,
      shipping: /free|gratis|^0([.,]0+)?$/i.test((pick(row, "shipping") || "").trim()) ? 0 : ship,
      currency: (pick(row, "currency") || feed.currency || "EUR").slice(0, 3).toUpperCase(),
      url,
      image: pick(row, "image"),
      in_stock: inStock(pick(row, "stock")),
      updated_at: started,
    });
    if (batch.length >= 1000) await flush();
  }
  await flush();
  // Products that were not in today's feed are gone from the shop: remove them.
  const removed = await sql`delete from products where feed = ${feed.name} and updated_at < ${started}`;
  console.log(`${feed.name}: ${count} products imported, ${removed.count} removed.`);
}

let failed = 0;
for (const feed of FEEDS) {
  try {
    await importFeed(feed);
  } catch (e) {
    failed++;
    console.error(e);
  }
}
await sql.end();
if (failed) process.exit(1);
