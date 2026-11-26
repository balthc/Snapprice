import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snapprice: screenshot a product, find the cheapest shop in Europe",
  description:
    "Drop in a screenshot of the exact item you want. Snapprice recognises it and finds the webshop in Europe selling it cheapest.",
  icons: { icon: "/icon.svg" },
  // Daisycon site verification (affiliate network). On every page, including the maintenance page.
  other: { "97c6479e67e38a1": "3b5c14ddef5cf35ec21a3a2c7f5f3b95" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
