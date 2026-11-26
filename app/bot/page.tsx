import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "SnappriceBot: how we visit webshops", robots: { index: true } };

export default function Bot() {
  return (
    <main className="band">
      <div className="wrap" style={{ maxWidth: 760, display: "grid", gap: 18 }}>
        <h1 style={{ fontSize: 36 }}>SnappriceBot</h1>
        <p>
          Snapprice helps shoppers find the product they want at the best price in an independent European webshop, and sends them
          straight to your product page. To do that, SnappriceBot reads the public product information your shop already publishes:
          product names, prices, photos and stock.
        </p>
        <h2 style={{ fontSize: 22 }}>How it behaves</h2>
        <ul>
          <li>It identifies itself as <code>SnappriceBot</code> with a link to this page.</li>
          <li>It follows your <code>robots.txt</code> rules (for <code>SnappriceBot</code> or <code>*</code>) and any <code>Crawl-delay</code>.</li>
          <li>It visits once a day, one page at a time, at least 1.5 seconds apart.</li>
          <li>It only reads public product data: your shop&apos;s product feed or product pages. No accounts, carts or checkouts.</li>
          <li>Shoppers always buy on your own site. We never copy your shop or sell your products ourselves.</li>
        </ul>
        <h2 style={{ fontSize: 22 }}>Opt out</h2>
        <p>
          Add this to your <code>robots.txt</code> and we stop visiting within a day:
        </p>
        <pre style={{ background: "var(--soft)", padding: 14, borderRadius: 12 }}>User-agent: SnappriceBot{"\n"}Disallow: /</pre>
        <p>
          Or email <a href={`mailto:${CONTACT_EMAIL}?subject=SnappriceBot%20opt-out`}>{CONTACT_EMAIL}</a> with your shop&apos;s address and
          we remove it and all its products from Snapprice.
        </p>
      </div>
    </main>
  );
}
