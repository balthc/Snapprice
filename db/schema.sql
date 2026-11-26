-- Snapprice product feed database (Supabase or Neon free tier, plain Postgres).
-- Run this once in the database's SQL editor.

create table if not exists products (
  id          text primary key,            -- feed name + product id/url, stable across imports
  feed        text not null,               -- which feed it came from (e.g. "awin-zalando-nl")
  network     text not null,               -- awin, daisycon, tradetracker, ...
  merchant    text not null,               -- shop name shown to shoppers
  country     text not null,               -- two-letter country of the shop, e.g. NL
  title       text not null,
  brand       text,
  colour      text,
  size        text,
  ean         text,
  price       numeric(10,2) not null,      -- in the feed's currency
  old_price   numeric(10,2),
  shipping    numeric(10,2),
  currency    text not null default 'EUR',
  url         text not null,               -- affiliate deep link to the product page
  image       text,
  in_stock    boolean not null default true,
  updated_at  timestamptz not null default now(),
  search      tsvector generated always as (
                to_tsvector('simple', coalesce(brand,'') || ' ' || title || ' ' || coalesce(colour,''))
              ) stored
);

create index if not exists products_search_idx on products using gin (search);
create index if not exists products_ean_idx on products (ean);
create index if not exists products_feed_idx on products (feed, updated_at);

-- Small-shop index: independent webshops found automatically (from search results) or added by hand.
-- The nightly crawler (scripts/crawl-shops.mjs) reads their public product data into "products"
-- (feed = 'shop:<domain>', network = 'index').
create table if not exists shops (
  domain        text primary key,            -- e.g. "skateshop-milano.it"
  name          text,
  country       text not null default 'EU',
  currency      text,
  platform      text,                        -- shopify, woocommerce, sitemap, unknown
  status        text not null default 'new', -- new, ok, blocked (robots.txt), failed, optout
  found_via     text,                        -- search, seed, manual
  products      integer not null default 0,
  fails         integer not null default 0,
  last_crawled  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists shops_crawl_idx on shops (status, last_crawled nulls first);
