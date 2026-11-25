import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Snapprice is coming soon",
  robots: { index: false, follow: false },
};

export default function Maintenance() {
  return (
    <main className="band close" style={{ minHeight: "100vh", display: "grid", alignItems: "center" }}>
      <div className="wrap" style={{ display: "grid", gap: 20, maxWidth: 720 }}>
        <span className="logo" style={{ color: "#fff" }}>
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><path d="M3 4h11l11 11-10 10L3 13z" fill="#fff" /><circle cx="9" cy="9" r="2.4" fill="var(--field)" /></svg>
          Snapprice
        </span>
        <h1>Coming soon.</h1>
        <p style={{ fontSize: 20 }}>Screenshot a product and we find the shop in Europe selling it cheapest. We&apos;re putting on the finishing touches.</p>
        <p>Questions? Write to {CONTACT_EMAIL}.</p>
      </div>
    </main>
  );
}
