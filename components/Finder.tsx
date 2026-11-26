"use client";

import { useEffect, useRef, useState } from "react";
import type { Offer, Product, SearchEvent, SearchResult } from "@/lib/types";
import { FREE_SEARCHES_PER_MONTH } from "@/lib/site";
import { proxied, scorePhotos } from "@/lib/photocheck";
import type { LensPage } from "@/lib/lens";
import LiveSearch, { type Live } from "./LiveSearch";

type Stage = "idle" | "identifying" | "confirm" | "identified" | "searching" | "checking" | "done";

// Fields the shopper checks before searching.
type Spec = { brand: string; type: string; colour: string; model: string; fit: string; season: string; kit: string; version: string };

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
  const [pages, setPages] = useState<LensPage[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [shot, setShot] = useState<{ data: string; mime: string } | null>(null);
  const [showSimilar, setShowSimilar] = useState(false);
  const [spec, setSpec] = useState<Spec>({ brand: "", type: "", colour: "", model: "", fit: "", season: "", kit: "", version: "" });
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [recognisedBy, setRecognisedBy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [identStep, setIdentStep] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const quota = useQuota();
  const [status, setStatus] = useState<{
    livePrices: boolean;
    recognition: boolean;
    sources: string[];
    version: string;
    countries: string[];
    allCountries: { code: string; name: string; eu: boolean }[];
    maxCountries: number;
  } | null>(null);
  useEffect(() => {
    fetch("/api/status", { cache: "no-store" }).then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);
  const busy = stage === "identifying" || stage === "searching" || stage === "checking";
  useEffect(() => {
    if (stage !== "identifying") return;
    setIdentStep(0);
    const t = setInterval(() => setIdentStep((n) => Math.min(n + 1, 3)), 2200);
    return () => clearInterval(t);
  }, [stage]);

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

  async function search(p: Product, lensFound: Offer[] = lens, image = shot, lensPagesFound: LensPage[] = pages) {
    if (blocked) return;
    setShowSimilar(false);
    setStage("searching");
    setError(null);
    setResult(null);
    try {
      setLive({ phase: "searching", countries: [], sources: [], done: [], found: 0, shops: [] });
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ product: p, size: size.trim() || undefined, lensOffers: lensFound, lensPages: lensPagesFound, image: image ?? undefined }),
      });
      const data = await readStream(res);
      if (data.demo) setDemo(true);
      quota.bump();
      if (image && !data.visualCheck && !data.demo && data.offers.length) {
        setResult(data);
        setLive((l) => (l ? { ...l, phase: "photos", seen: [...(l.seen ?? []), l.phase] } : l));
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

  // Reads the live search: countries light up and shops appear while the server searches.
  async function readStream(res: Response): Promise<SearchResult> {
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.includes("ndjson") || !res.body) {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Search failed.");
      return data as SearchResult;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let result: SearchResult | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const e = JSON.parse(line) as SearchEvent;
        if (e.t === "done") result = e.result;
        else if (e.t === "error") throw new Error(e.error);
        else
          setLive((l) => {
            const cur = l ?? { phase: "searching" as const, countries: [], sources: [], done: [], found: 0, shops: [] };
            if (e.t === "plan") return { ...cur, countries: e.countries, sources: e.sources };
            if (e.t === "phase") return { ...cur, phase: e.phase, seen: [...(cur.seen ?? []), cur.phase] };
            return {
              ...cur,
              done: e.cc && e.n > 0 && !cur.done.includes(e.cc) ? [...cur.done, e.cc] : cur.done,
              tried: e.cc ? [...(cur.tried ?? []), e.cc] : cur.tried,
              found: cur.found + e.n,
              shops: [
                ...e.shops.map((x) => ({ ...x, key: `${e.label}-${x.shop}-${x.total}` })),
                ...cur.shops.filter((x) => !e.shops.some((y) => y.shop === x.shop)),
              ].slice(0, 8),
            };
          });
      }
    }
    if (!result) throw new Error("Search was interrupted. Please try again.");
    return result;
  }

  // Free in-browser photo check (colour + FashionCLIP): photos that clearly don't match move to "similar".
  // Listings with the article code or full model name in their title are trusted and not demoted.
  async function photoCheck(data: SearchResult, image: { data: string; mime: string }): Promise<SearchResult> {
    const list = data.offers.slice(0, 30).filter((o) => o.strong !== "code");
    const rest = data.offers.filter((o) => !list.includes(o));
    if (!list.length) return data;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    setCheckNote(`Comparing ${list.length} photos with your screenshot…`);
    try {
      const scores = await scorePhotos(`data:${image.mime};base64,${image.data}`, list.map((o) => o.thumbnail), !saveData, (n) =>
        setCheckNote(`Comparing photos with your screenshot… ${n} of ${list.length}`)
      );
      setCheckNote(null);
      const lookRan = scores.some((sc) => sc.look !== null);
      const checks = { textCheck: data.checks?.textCheck ?? null, photoCheck: lookRan ? "FashionCLIP + colour (in your browser)" : "colour only (in your browser)" };
      const keep: Offer[] = [];
      const moved: Offer[] = [];
      list.forEach((o, i) => {
        const sc = scores[i];
        if (!sc.pass) moved.push({ ...o, match: "likely" });
        else keep.push(sc.confirmed ? { ...o, seen: true } : o);
      });
      const offers = [...keep, ...rest].sort((a, b) => a.total - b.total);
      return { ...data, offers, similar: [...moved, ...data.similar].sort((a, b) => a.total - b.total), visualCheck: true, checks };
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
    setPages([]);
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
      setPages(data.lensPages ?? []);
      setRecognisedBy(data.recognisedBy ?? null);
      if (data.demo) setDemo(true);
      setSpec({
        brand: p.brand || "",
        type: p.productType || (p.category !== "product" ? p.category : ""),
        colour: p.colour && p.colour !== "not specified" ? p.colour : colour.trim(),
        model: [p.model?.toLowerCase().startsWith(p.brand.toLowerCase()) ? p.model.slice(p.brand.length).trim() : p.model, p.articleCode].filter(Boolean).join(" "),
        fit: "",
        season: p.season || "",
        kit: p.kit || "",
        version: p.version || "",
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
    setPages([]);
    setShot(null);
    setRecognisedBy(null);
    setProduct(full);
    search(full, [], null, []);
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
      season: spec.season.trim() || undefined,
      kit: spec.kit || undefined,
      version: spec.version || undefined,
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
          className={`drop${over ? " over" : ""}${busy ? " busy" : ""}${stage !== "idle" && stage !== "identifying" ? " compact" : ""}`}
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
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
            </span>
          )}
          <span>
            <b>{stage === "identifying" ? "Recognising the product…" : stage === "searching" ? "Checking shops and stock…" : stage === "checking" ? "Comparing photos…" : preview ? "Drop another screenshot" : "Drop a screenshot"}</b>
            <br />
            <small>{busy ? "This takes 10 to 30 seconds" : "or click to choose one, or paste it. Shop pages, Instagram posts and photos all work."}</small>
          </span>
          {stage === "identifying" && (
            <span className="ident" aria-hidden="true">
              {["Reading the shape", "Spotting the logo", "Matching online", "Naming the item"].map((t, i) => (
                <span key={t} className={i <= identStep ? "on" : ""}>{t}</span>
              ))}
            </span>
          )}
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
            <label>Season or year <small>(only this one is shown)</small><input value={spec.season} onChange={(e) => setSpec({ ...spec, season: e.target.value })} placeholder="e.g. 2026/27 or 2025" /></label>
            <label>Kit <small>(sports shirts)</small>
              <select value={spec.kit} onChange={(e) => setSpec({ ...spec, kit: e.target.value })}>
                <option value="">Not applicable</option><option value="home">Home</option><option value="away">Away</option><option value="third">Third</option><option value="goalkeeper">Goalkeeper</option><option value="training">Training</option>
              </select>
            </label>
            <label>Version <small>(sports shirts)</small>
              <select value={spec.version} onChange={(e) => setSpec({ ...spec, version: e.target.value })}>
                <option value="">Any</option><option value="replica">Replica (fan)</option><option value="authentic">Authentic (player)</option>
              </select>
            </label>
          </div>
          {(spec.season || spec.kit) && (
            <p className="note">Strict mode: only shops that confirm {[spec.season, spec.kit, spec.version].filter(Boolean).join(" · ")} are shown. Listings that don&apos;t say which season go under &quot;similar&quot;.</p>
          )}
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
              {[product.season, product.kit, product.version].some(Boolean) && <span className="tag green">{[product.season, product.kit, product.version].filter(Boolean).join(" · ")}</span>}
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

          {(stage === "searching" || stage === "checking") && live && <LiveSearch live={live} note={checkNote} />}

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
                {!result.demo && (
                  <p className="muted small">
                    Checked by: title {result.checks?.textCheck ?? "search words only"} · photo {result.checks?.photoCheck ?? "not compared"}
                    {result.funnel && ` · ${result.funnel.listings} listings found, ${result.funnel.afterFilters} after type and colour filter, ${result.funnel.matched} matched${result.funnel.unanswered ? ` · ${result.funnel.unanswered} sources didn't answer` : ""}`}
                  </p>
                )}
              </div>
              {saving && saving > 1 && (
                <div className="save"><span>Save versus the usual price</span><strong>{eur(saving)} ({Math.round((saving / result.usualPrice!) * 100)}%)</strong></div>
              )}
              {size.trim() && offers.length > 0 && (
                <p className="note">Size <b>{size.trim()}</b>: most shops don&apos;t share stock per size, so check your size on the shop page.</p>
              )}
              {offers.length ? (
                <ol className="rows">
                  {offers.map((o, i) => <Row key={o.url + i} o={o} best={i === 0} variant={product?.season || product?.kit ? [product.season, product.kit].filter(Boolean).join(" ") : null} />)}
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

function Row({ o, best, variant = null }: { o: Offer; best: boolean; variant?: string | null }) {
  const ship = o.shipping === null ? "shipping not listed" : o.shipping === 0 ? "free shipping" : `incl. ${eur(o.shipping)} shipping`;
  const off = o.oldPrice ? Math.round((1 - o.price / o.oldPrice) * 100) : 0;
  const body = (
    <>
      <Pic o={o} />
      <span className="info">
        <b>{o.shop}</b>
        <span className="t">{o.title}</span>
        <span className="tags">
          {best && <span className="tag green">Lowest price</span>}
          {o.seen && <span className="tag green">Photo match</span>}
          {!o.seen && o.strong === "code" && <span className="tag green">Article code match</span>}
          {!o.seen && o.strong === "model" && <span className="tag green">Model name match</span>}
          {variant && o.variant === "ok" && <span className="tag green">{variant} confirmed</span>}
          {o.variant === "unverified" && <span className="tag">Season not confirmed</span>}
          {o.stock === "in" && <span className="tag green">In stock</span>}
          {off >= 5 && <span className="tag pink">-{off}%</span>}
          <span className="tag">{o.country}</span>
          {o.match === "likely" && <span className="tag">Likely match</span>}
          {o.rating ? <span className="tag">★ {o.rating.toFixed(1)}</span> : null}
          {o.source === "ebay" && <span className="tag">eBay</span>}
          {["UK", "CH", "NO"].includes(o.country) && <span className="tag pink">Outside EU: customs may apply</span>}
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

// Product photo: the shop's own photo first (from its product page), then the search thumbnail.
function Pic({ o }: { o: Offer }) {
  const isDirect = /^https?:\/\//.test(o.url) && o.source !== "demo";
  const chain = [
    o.photo ? proxied(o.photo) : null,
    !o.photo && isDirect ? `/api/pageimg?u=${encodeURIComponent(o.url)}` : null,
    o.thumbnail,
  ].filter((x): x is string => Boolean(x));
  const [i, setI] = useState(0);
  const src = chain[i];
  return (
    <span className="pic">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setI((n) => n + 1)} />
      ) : (
        <span>{o.country}</span>
      )}
    </span>
  );
}
