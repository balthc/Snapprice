"use client";

import { useEffect, useRef, useState } from "react";
import type { Offer, Product, SearchResult } from "@/lib/types";
import { FREE_SEARCHES_PER_MONTH } from "@/lib/site";
import { scorePhotos } from "@/lib/photocheck";

type Stage = "idle" | "identifying" | "confirm" | "identified" | "searching" | "checking" | "done";

// Fields the shopper checks before searching.
type Spec = { brand: string; type: string; colour: string; model: string; fit: string };

function buildQuery(s: Spec): string {
  const parts: string[] = [];
  const add = (x: string) => {
    const v = x.trim();
    if (v && !parts.join(" ").toLowerCase().includes(v.toLowerCase())) parts.push(v);
  };
  add(s.brand);
  add(s.model);
  add(s.type);
  add(s.fit);
  add(s.colour);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

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

function toBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
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
  const [shot, setShot] = useState<{ data: string; mime: string } | null>(null);
  const [showSimilar, setShowSimilar] = useState(false);
  const [spec, setSpec] = useState<Spec>({ brand: "", type: "", colour: "", model: "", fit: "" });
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [recognisedBy, setRecognisedBy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const quota = useQuota();
  const [status, setStatus] = useState<{ livePrices: boolean; recognition: boolean; sources: string[]; version: string } | null>(null);
  useEffect(() => {
    fetch("/api/status", { cache: "no-store" }).then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);
  const busy = stage === "identifying" || stage === "searching" || stage === "checking";

  // Paste a screenshot anywhere on the page (Ctrl/Cmd+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = e.clipboardData?.files?.[0];
      if (f?.type.startsWith("image/")) onFile(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });
  const blocked = ENFORCE_LIMIT && quota.left === 0;

  // Adds the optional colour to the search words if it isn't in there already.
  function withColour(p: Product): Product {
    const c = colour.trim();
    if (!c || p.searchQuery.toLowerCase().includes(c.toLowerCase())) return p;
    return { ...p, colour: c, searchQuery: `${p.searchQuery} ${c}` };
  }

  async function search(p: Product, lensFound: Offer[] = lens, image = shot) {
    if (blocked) return;
    setShowSimilar(false);
    setStage("searching");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: p, size: size.trim() || undefined, lensOffers: lensFound, image: image ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed.");
      if (data.demo) setDemo(true);
      quota.bump();
      if (image && !data.visualCheck && !data.demo && data.offers.length) {
        setResult(data);
        setStage("checking");
        setResult(await photoCheck(data, image));
      } else {
        setResult(data);
      }
      setStage("done");
    } catch (e) {
      setError((e as Error).message);
      setStage("identified");
    }
  }

  // Free in-browser photo check (colour + FashionCLIP): photos that don't match move to "similar".
  async function photoCheck(data: SearchResult, image: { data: string; mime: string }): Promise<SearchResult> {
    const list = data.offers.slice(0, 30);
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    setCheckNote(`Comparing ${list.length} photos with your screenshot…`);
    try {
      const scores = await scorePhotos(`data:${image.mime};base64,${image.data}`, list.map((o) => o.thumbnail), !saveData, (n) =>
        setCheckNote(`Comparing photos with your screenshot… ${n} of ${list.length}`)
      );
      const keep: Offer[] = [];
      const moved: Offer[] = [];
      list.forEach((o, i) => {
        const sc = scores[i];
        if (!sc.pass) moved.push({ ...o, match: "likely" });
        else keep.push(sc.look !== null || sc.colour !== null ? { ...o, seen: true } : o);
      });
      setCheckNote(null);
      return { ...data, offers: keep, similar: [...moved, ...data.similar].sort((a, b) => a.total - b.total), visualCheck: true };
    } catch (e) {
      console.warn("photo check failed", e);
      setCheckNote(null);
      return data;
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
      const img = ["image/jpeg", "image/png", "image/webp"].includes(blob.type) && blob.size < 700_000
        ? { data: await toBase64(blob), mime: blob.type }
        : null;
      setShot(img);
      form.append("image", blob, blob === file ? file.name : "screenshot.jpg");
      const res = await fetch("/api/identify", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Recognition failed.");
      const p = withColour(data.product);
      setProduct(p);
      setLens(data.lensOffers ?? []);
      setRecognisedBy(data.recognisedBy ?? null);
      if (data.demo) setDemo(true);
      setSpec({
        brand: p.brand || "",
        type: p.productType || (p.category !== "product" ? p.category : ""),
        colour: p.colour && p.colour !== "not specified" ? p.colour : colour.trim(),
        model: [p.model?.toLowerCase().startsWith(p.brand.toLowerCase()) ? p.model.slice(p.brand.length).trim() : p.model, p.articleCode].filter(Boolean).join(" "),
        fit: "",
      });
      setStage("confirm");
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
    setShot(null);
    setRecognisedBy(null);
    setProduct(full);
    search(full, [], null);
  }

  function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!product || busy) return;
    const q = buildQuery(spec);
    if (q.length < 3) return;
    const p: Product = {
      ...product,
      brand: spec.brand.trim(),
      model: spec.model.trim() || spec.type.trim(),
      productType: spec.type.trim(),
      colour: spec.colour.trim() || "not specified",
      fit: spec.fit.trim() || undefined,
      searchQuery: q,
    };
    setProduct(p);
    search(p);
  }

  function edit(field: keyof Product, value: string) {
    if (!product) return;
    setProduct({ ...product, [field]: value });
  }

  const offers = result?.offers ?? [];
  const best = offers[0];
  const saving = best && result?.usualPrice && result.usualPrice > best.total ? result.usualPrice - best.total : null;
  const title = product
    ? product.model.toLowerCase().startsWith(product.brand.toLowerCase()) ? product.model : `${product.brand} ${product.model}`
    : "";

  return (
    <>
      <div className="finder">
        <label
          className={`drop${over ? " over" : ""}${busy ? " busy" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
        >
          <input ref={fileRef} type="file" accept="image/*" aria-label="Upload a product screenshot" disabled={busy || blocked} onChange={(e) => onFile(e.target.files?.[0])} />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="shot" src={preview} alt="Your screenshot" />
          ) : (
            <span className="icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
            </span>
          )}
          <span>
            <b>{stage === "identifying" ? "Recognising the product…" : stage === "searching" ? "Checking shops and stock…" : stage === "checking" ? "Comparing photos…" : preview ? "Drop another screenshot" : "Drop a screenshot"}</b>
            <br />
            <small>{busy ? "This takes 10 to 30 seconds" : "or click to choose one, or paste it. Shop pages, Instagram posts and photos all work."}</small>
          </span>
          {busy && <span className="scan" aria-hidden="true" />}
        </label>

        <form className="search" onSubmit={onText}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type a product name" aria-label="Product name" disabled={busy} />
          <input className="small" value={colour} onChange={(e) => setColour(e.target.value)} placeholder="Colour" aria-label="Colour, optional" disabled={busy} />
          <input className="small" value={size} onChange={(e) => setSize(e.target.value)} placeholder="Size" aria-label="Size, optional" disabled={busy} />
          <button className="btn btn-main" type="submit" disabled={busy || text.trim().length < 3}>Search</button>
        </form>

        <div className="statusline">
          {status && !status.livePrices && <span className="pill off">Demo mode: sample prices</span>}
          {status && status.livePrices && !status.recognition && <span className="pill off">Screenshot recognition off</span>}
          <span>
            {blocked
              ? "You've used your free searches this month."
              : `${quota.left} of ${FREE_SEARCHES_PER_MONTH} free searches left this month`}
          </span>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
      </div>

      {stage === "confirm" && product && (
        <form className="confirm" onSubmit={onConfirm}>
          <div>
            <h2>Is this what you&apos;re looking for?</h2>
            <p className="muted">Check and correct the details. The more exact, the better the results.</p>
          </div>
          <div className="specgrid">
            <label>Brand<input value={spec.brand} onChange={(e) => setSpec({ ...spec, brand: e.target.value })} placeholder="e.g. Tommy Jeans" /></label>
            <label>Type of item<input value={spec.type} onChange={(e) => setSpec({ ...spec, type: e.target.value })} placeholder="e.g. chino trousers" /></label>
            <label>Colour<input value={spec.colour} onChange={(e) => setSpec({ ...spec, colour: e.target.value })} placeholder="e.g. navy" /></label>
            <label>Model or code <small>(if you know it)</small><input value={spec.model} onChange={(e) => setSpec({ ...spec, model: e.target.value })} placeholder="e.g. Scanton" /></label>
            <label>Fit <small>(optional)</small><input value={spec.fit} onChange={(e) => setSpec({ ...spec, fit: e.target.value })} placeholder="e.g. slim, regular, wide" /></label>
            <label>Size <small>(optional)</small><input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. W32 L32, M, 43" /></label>
          </div>
          <p className="muted">We&apos;ll search for: <b>{buildQuery(spec) || "…"}</b></p>
          <button className="btn btn-main" type="submit" disabled={buildQuery(spec).length < 3}>Find the cheapest shops</button>
        </form>
      )}

      {stage !== "confirm" && (product || stage === "searching") && (
        <div className={`results${stage === "searching" ? " loading" : ""}`} aria-live="polite">
          {product && (
            <div className="matched">
              <span className="muted">Looking for</span>
              <h3>{title}{product.colour && product.colour !== "not specified" ? ` · ${product.colour}` : ""}</h3>
              {product.articleCode && <span className="tag">{product.articleCode}</span>}
              {demo && <span className="tag pink">Demo</span>}
              {product.confidence === "low" && <span className="tag pink">Not sure, please check</span>}
              <details className="fix">
                <summary>Not right? Edit</summary>
                <div className="fixrow">
                  <input value={product.searchQuery} onChange={(e) => edit("searchQuery", e.target.value)} aria-label="Search words" />
                  <button className="btn btn-main" type="button" disabled={busy} onClick={() => search(product)}>Search again</button>
                </div>
              </details>
            </div>
          )}

          {stage === "checking" && checkNote && <p className="note"><span className="spinner" />{checkNote}</p>}
          {stage === "searching" && (
            <div className="rows"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
          )}

          {result && stage === "done" && (
            <>
              {result.demo && (
                <p className="err"><b>Sample results, not real shops.</b> Live prices switch on once a SerpApi key is added.</p>
              )}
              <div className="res-head">
                <h2>
                  {offers.length
                    ? result.visualCheck
                      ? `${offers.length} ${offers.length === 1 ? "shop has" : "shops have"} this item`
                      : `${offers.length} ${offers.length === 1 ? "offer" : "offers"} found`
                    : "No exact match found"}
                </h2>
                <p className="muted">Cheapest first, shipping included · {result.countries.join(" ")}</p>
              </div>
              {saving && saving > 1 && (
                <div className="save"><span>Save versus the usual price</span><strong>{eur(saving)} ({Math.round((saving / result.usualPrice!) * 100)}%)</strong></div>
              )}
              {size.trim() && offers.length > 0 && (
                <p className="note">Size <b>{size.trim()}</b>: most shops don&apos;t share stock per size, so check your size on the shop page.</p>
              )}
              {offers.length ? (
                <ol className="rows">
                  {offers.map((o, i) => <Row key={o.url + i} o={o} best={i === 0} />)}
                </ol>
              ) : (
                <p className="muted">
                  We&apos;d rather show nothing than the wrong product. {result.similar.length ? "Below are similar items that didn't pass our check. " : ""}
                  You can also edit the search words above, for example add the model name.
                </p>
              )}
              {result.visualCheck && offers.length > 0 && (
                <p className="note">Results were photo-checked against your screenshot. Items that look different are under &quot;similar items&quot;.</p>
              )}
              {result.similar.length > 0 && (
                showSimilar ? (
                  <>
                    <h3 style={{ marginTop: 8 }}>Similar, but not confirmed as the same item</h3>
                    <ol className="rows similar">
                      {result.similar.map((o, i) => <Row key={o.url + i} o={o} best={false} />)}
                    </ol>
                  </>
                ) : (
                  <button className="btn btn-ghost" type="button" onClick={() => setShowSimilar(true)}>
                    Show {result.similar.length} similar {result.similar.length === 1 ? "item" : "items"} (different model, colour or not verified)
                  </button>
                )
              )}
              {result.warnings.map((w) => <p className="note" key={w}>{w}</p>)}
              <p className="note">
                {result.demo
                  ? "Demo mode: shop names and prices are examples."
                  : `Prices from ${result.sources.join(", ")}. Shipping is what the shop lists; check the final amount at checkout.`}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Row({ o, best }: { o: Offer; best: boolean }) {
  const ship = o.shipping === null ? "shipping not listed" : o.shipping === 0 ? "free shipping" : `incl. ${eur(o.shipping)} shipping`;
  const off = o.oldPrice ? Math.round((1 - o.price / o.oldPrice) * 100) : 0;
  const body = (
    <>
      <span className="pic">
        {o.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span>{o.country}</span>
        )}
      </span>
      <span className="info">
        <b>{o.shop}</b>
        <span className="t">{o.title}</span>
        <span className="tags">
          {best && <span className="tag green">Lowest price</span>}
          {o.seen && <span className="tag green">Photo match</span>}
          {o.stock === "in" && <span className="tag green">In stock</span>}
          {off >= 5 && <span className="tag pink">-{off}%</span>}
          <span className="tag">{o.country}</span>
          {o.match === "likely" && <span className="tag">Likely match</span>}
          {o.rating ? <span className="tag">★ {o.rating.toFixed(1)}</span> : null}
          {o.source === "ebay" && <span className="tag">eBay</span>}
        </span>
      </span>
      <span className="price">
        <b>{eur(o.total)}</b>
        {o.oldPrice && <s>{eur(o.oldPrice)}</s>}
        <small>{ship}</small>
      </span>
    </>
  );
  return (
    <li>
      {o.source === "demo" ? (
        <div className={`row${best ? " best" : ""}`}>{body}</div>
      ) : (
        <a className={`row${best ? " best" : ""}`} href={o.url} target="_blank" rel="noopener noreferrer nofollow" title={o.title}>{body}</a>
      )}
    </li>
  );
}
