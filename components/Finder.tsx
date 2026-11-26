"use client";

import { useEffect, useRef, useState } from "react";
import type { Offer, Product, SearchResult } from "@/lib/types";
import { FREE_SEARCHES_PER_MONTH } from "@/lib/site";

type Stage = "idle" | "identifying" | "identified" | "searching" | "done";

const eur = (n: number) => "€" + n.toFixed(2);
const ENFORCE_LIMIT = process.env.NEXT_PUBLIC_ENFORCE_FREE_LIMIT === "true";

// Free-plan counter kept in the browser. Real accounts and payments come later.
function useQuota() {
  const key = "snapprice-quota";
  const month = new Date().toISOString().slice(0, 7);
  const read = (): number => {
    if (typeof window === "undefined") return 0;
    try {
      const q = JSON.parse(localStorage.getItem(key) || "{}");
      return q.month === month ? q.count || 0 : 0;
    } catch {
      return 0;
    }
  };
  const [used, setUsed] = useState(0);
  useEffect(() => setUsed(read()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const bump = () => {
    const n = read() + 1;
    localStorage.setItem(key, JSON.stringify({ month, count: n }));
    setUsed(n);
  };
  return { used, left: Math.max(0, FREE_SEARCHES_PER_MONTH - used), bump };
}

// Shrinks screenshots before upload to under ~480 KB (Google Lens accepts max 500 KB). Recognition doesn't need more.
async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  if (file.size < 480_000 && Math.max(bmp.width, bmp.height) <= 1600) return file;
  let max = 1400;
  for (let i = 0; i < 6; i++) {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.85 - i * 0.07));
    if (blob && blob.size < 480_000) return blob;
    max = Math.round(max * 0.8);
  }
  return file;
}

export default function Finder() {
  const [stage, setStage] = useState<Stage>("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [text, setText] = useState("");
  const [colour, setColour] = useState("");
  const [size, setSize] = useState("");
  const [lens, setLens] = useState<Offer[]>([]);
  const [recognisedBy, setRecognisedBy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const quota = useQuota();
  const [status, setStatus] = useState<{ livePrices: boolean; recognition: boolean; sources: string[]; version: string } | null>(null);
  useEffect(() => {
    fetch("/api/status", { cache: "no-store" }).then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);
  const busy = stage === "identifying" || stage === "searching";
  const blocked = ENFORCE_LIMIT && quota.left === 0;

  // Adds the optional colour to the search words if it isn't in there already.
  function withColour(p: Product): Product {
    const c = colour.trim();
    if (!c || p.searchQuery.toLowerCase().includes(c.toLowerCase())) return p;
    return { ...p, colour: c, searchQuery: `${p.searchQuery} ${c}` };
  }

  async function search(p: Product, lensFound: Offer[] = lens) {
    if (blocked) return;
    setStage("searching");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: p, size: size.trim() || undefined, lensOffers: lensFound }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed.");
      setResult(data);
      if (data.demo) setDemo(true);
      quota.bump();
      setStage("done");
    } catch (e) {
      setError((e as Error).message);
      setStage("identified");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || busy || blocked) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    setResult(null);
    setProduct(null);
    setLens([]);
    setPreview(URL.createObjectURL(file));
    setStage("identifying");
    try {
      const form = new FormData();
      const blob = await shrink(file);
      form.append("image", blob, blob === file ? file.name : "screenshot.jpg");
      const res = await fetch("/api/identify", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Recognition failed.");
      const p = withColour(data.product);
      setProduct(p);
      setLens(data.lensOffers ?? []);
      setRecognisedBy(data.recognisedBy ?? null);
      if (data.demo) setDemo(true);
      setStage("identified");
      await search(p, data.lensOffers ?? []);
    } catch (e) {
      setError((e as Error).message);
      setStage("idle");
    }
  }

  function onText(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (q.length < 3 || busy) return;
    const p: Product = {
      brand: q.split(/\s+/)[0],
      model: q,
      colour: "not specified",
      articleCode: null,
      category: "product",
      searchQuery: q,
      confidence: "medium",
      notes: "Typed by the shopper.",
    };
    const full = withColour(p);
    setPreview(null);
    setLens([]);
    setRecognisedBy(null);
    setProduct(full);
    search(full, []);
  }

  function edit(field: keyof Product, value: string) {
    if (!product) return;
    setProduct({ ...product, [field]: value });
  }

  const offers = result?.offers ?? [];
  const best = offers[0];
  const saving = best && result?.usualPrice && result.usualPrice > best.total ? result.usualPrice - best.total : null;

  return (
    <div className="app" role="region" aria-label="Price finder">
      <div className="bar">
        <i></i><i></i><i></i><span>snapprice.app/search</span>
        {status && (
          <span className="modes" title={`Version ${status.version}`}>
            <span className={`mode ${status.livePrices ? "on" : "off"}`}>{status.livePrices ? "Live prices" : "Demo prices"}</span>
            <span className={`mode ${status.recognition ? "on" : "off"}`}>{status.recognition ? "Screenshot recognition on" : "Screenshot recognition off"}</span>
          </span>
        )}
      </div>
      <div className="app-grid">
        <div className="app-left">
          <label
            className={`drop${over ? " over" : ""}${busy || blocked ? " disabled" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
          >
            <input ref={fileRef} type="file" accept="image/*" aria-label="Upload a product screenshot" onChange={(e) => onFile(e.target.files?.[0])} />
            <span className="thumb">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Your screenshot" />
              ) : (
                <svg width="54" height="80" viewBox="0 0 54 80" aria-hidden="true"><path d="M6 4h42l4 72H32L27 30l-5 46H2z" fill="#2b2a28" /><path d="M6 4h42v8H6z" fill="#4a4844" /><path d="M8 40h12v16H6zM34 40h12l2 16H34z" fill="#3a3936" /></svg>
              )}
            </span>
            <span>
              <b>{stage === "identifying" ? <><span className="spinner" />Recognising the product…</> : preview ? "Drop another screenshot" : "Drop a screenshot here"}</b>
              <small>or tap to choose one. Any shop, Instagram post or photo works.</small>
            </span>
          </label>

          <div className="or">or type it</div>
          <form className="field" onSubmit={onText}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Carhartt WIP Double Knee Pant black" aria-label="Product name" disabled={busy} />
            <button className="btn btn-main" type="submit" disabled={busy || text.trim().length < 3}>Search</button>
          </form>
          <div className="field opts">
            <input value={colour} onChange={(e) => setColour(e.target.value)} placeholder="Colour (optional)" aria-label="Colour, optional" disabled={busy} />
            <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="Size (optional)" aria-label="Size, optional" disabled={busy} />
          </div>

          {product && (
            <div className="match">
              <p className="note">Matched product {demo && <span className="demo-badge">Demo</span>}</p>
              <h3>{product.model.toLowerCase().startsWith(product.brand.toLowerCase()) ? product.model : `${product.brand} ${product.model}`}{product.colour && product.colour !== "not specified" ? `, ${product.colour}` : ""}</h3>
              <div className="chips">
                <span className={`chip ${product.confidence === "low" ? "ok-chip-low" : "ok"}`}>
                  {product.confidence === "high" ? "Confident match" : product.confidence === "medium" ? "Probable match" : "Unsure, please check"}
                </span>
                {product.colour && product.colour !== "not specified" && <span className="chip ok">Colour: {product.colour}</span>}
                {product.articleCode && <span className="chip">Code {product.articleCode}</span>}
              </div>
              {product.notes && <p className="muted">{product.notes}</p>}
              {recognisedBy && recognisedBy !== "demo" && (
                <p className="muted">Recognised by {recognisedBy === "lens" ? "Google Lens" : recognisedBy === "gemini" ? "Gemini" : "Claude"}{lens.length ? `, which also found ${lens.length} shop pages` : ""}.</p>
              )}
              <details>
                <summary className="muted" style={{ cursor: "pointer" }}>Not right? Fix the search</summary>
                <div className="edit" style={{ marginTop: 8 }}>
                  <div className="field">
                    <input value={product.searchQuery} onChange={(e) => edit("searchQuery", e.target.value)} aria-label="Search words" />
                    <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => search(product)}>Search again</button>
                  </div>
                </div>
              </details>
            </div>
          )}

          {error && <p className="err" role="alert">{error}</p>}
          <p className="quota">
            {blocked
              ? "You've used your free searches this month. Plus with unlimited searches is coming soon."
              : `${quota.left} of ${FREE_SEARCHES_PER_MONTH} free searches left this month.`}
          </p>
        </div>

        <div className={`app-right${stage === "searching" ? " scan" : ""}`}>
          {stage === "searching" && (
            <div className="res-head"><h3><span className="spinner" />Checking shops across Europe…</h3><p>This takes 10 to 30 seconds</p></div>
          )}
          {stage !== "searching" && !result && (
            <div className="empty">
              <h3 style={{ marginBottom: 8 }}>Your cheapest shops appear here</h3>
              <p>Drop a screenshot or type a product name to start.</p>
            </div>
          )}
          {result && stage === "done" && (
            <>
              {result.demo ? (
                <p className="err"><b>Sample results, not real shops.</b> The site can&apos;t see a SerpApi key yet, so these are made-up example prices.</p>
              ) : (
                <p className="live-note"><span className="mode on">Live</span> Real prices from Google Shopping, checked just now.</p>
              )}
              <div className="res-head">
                <h3>{offers.length ? `${offers.length} ${offers.length === 1 ? "shop has" : "shops have"} it` : "No exact matches found"}</h3>
                <p>Sorted by price with shipping · {result.sources.join(" + ")} · {result.countries.join(", ")}</p>
              </div>
              {size.trim() && offers.length > 0 && (
                <p className="muted">Your size: <b>{size.trim()}</b>. Shops don&apos;t share stock per size with us yet, so check it on the shop page.</p>
              )}
              {offers.length ? (
                <ol className="rows">
                  {offers.map((o, i) => <Row key={o.url + i} o={o} best={i === 0} />)}
                </ol>
              ) : (
                <p className="empty">Try fixing the search words on the left, for example add or remove the colour.</p>
              )}
              {saving && saving > 1 && (
                <div className="save"><span>You save versus the usual price</span><strong>{eur(saving)} ({Math.round((saving / result.usualPrice!) * 100)}%)</strong></div>
              )}
              {result.warnings.map((w) => <p className="warn" key={w}>{w}</p>)}
            </>
          )}
        </div>
      </div>
      <p className="sample">
        {demo
          ? "Demo mode: sample shops and prices, not live data. Add the API keys to switch on live search."
          : "Prices come from Google Shopping listings and may change. Shipping is what the shop lists; check the final amount at checkout."}
      </p>
    </div>
  );
}

function Row({ o, best }: { o: Offer; best: boolean }) {
  const meta = [
    o.match === "likely" ? "Likely match" : null,
    o.rating ? `★ ${o.rating.toFixed(1)}${o.reviews ? ` (${o.reviews})` : ""}` : null,
    o.currency !== "EUR" ? `converted from ${o.currency}` : null,
    o.source === "lens" ? "found by Google Lens" : null,
  ].filter(Boolean).join(" · ");
  const ship = o.shipping === null ? "shipping not listed" : o.shipping === 0 ? "free shipping" : `incl. ${eur(o.shipping)} shipping`;
  const off = o.oldPrice ? Math.round((1 - o.price / o.oldPrice) * 100) : 0;
  return (
    <li>
      <a className={`row${best ? " best" : ""}`} href={o.source === "demo" ? undefined : o.url} target="_blank" rel="noopener noreferrer nofollow" title={o.title}>
        <span className="cc">{o.country}</span>
        <span className="shop">
          <b>{o.shop}{best && <span className="tag">Lowest</span>}{off >= 5 && <span className="tag">-{off}%</span>}</b>
          <small>{meta || o.title}</small>
        </span>
        <span className="price">
          <b>{eur(o.total)}</b>
          {o.oldPrice && <s>{eur(o.oldPrice)}</s>} <small className="note">{ship}</small>
        </span>
      </a>
    </li>
  );
}
