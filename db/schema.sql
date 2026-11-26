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
