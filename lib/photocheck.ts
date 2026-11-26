"use client";
// Free, open-source photo check that runs in the shopper's browser (no API, no cost):
// 1. Colour: compares the main colour of the product in each result photo with the screenshot.
// 2. Look: Marqo-FashionCLIP (open-source fashion image model, via transformers.js) gives a similarity
//    score between each result photo and the screenshot. The model (~90 MB) downloads once, then is cached.

const MODEL = "Marqo/marqo-fashionCLIP";
export const COLOUR_MAX_DIFF = 26; // colourway difference (weighted ΔE over the 2 main colours) above this = other colourway
export const LOOK_MIN = 0.78; // FashionCLIP similarity below this = other item

export const proxied = (url: string) => `/api/img?u=${encodeURIComponent(url)}`;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// --- colour -----------------------------------------------------------------
export function toLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

// Main colour of the product: ignores the background (estimated from the photo's edges).
type Lab = [number, number, number];
export type Palette = { lab: Lab; w: number }[];

// The product's colourway: its two main colours with their share (e.g. navy crown 70% + red visor 30%).
export function productPalette(img: HTMLImageElement): Palette | null {
  const labs = foregroundLabs(img);
  if (!labs) return null;
  // 2-means clustering, starting from the darkest and lightest pixels.
  const byL = [...labs].sort((a, b) => a[0] - b[0]);
  let c: Lab[] = [byL[Math.floor(byL.length * 0.1)], byL[Math.floor(byL.length * 0.9)]];
  let groups: Lab[][] = [[], []];
  for (let it = 0; it < 8; it++) {
    groups = [[], []];
    for (const p of labs) groups[colourDiff(p, c[0]) <= colourDiff(p, c[1]) ? 0 : 1].push(p);
    c = groups.map((g, k) => (g.length ? ([0, 1, 2].map((i) => g.reduce((s, p) => s + p[i], 0) / g.length) as Lab) : c[k]));
  }
  const total = labs.length;
  const pal = groups.map((g, k) => ({ lab: c[k], w: g.length / total })).filter((x) => x.w > 0);
  // One colour really: merge when both clusters are nearly the same colour.
  if (pal.length === 2 && colourDiff(pal[0].lab, pal[1].lab) < 12) return [{ lab: pal[0].w >= pal[1].w ? pal[0].lab : pal[1].lab, w: 1 }];
  return pal;
}

// How different two colourways are: every colour that makes up at least 20% of one product must be
// found in the other. A navy cap vs a cream/black cap, or vs a navy cap with a red visor, scores high.
export function paletteDiff(a: Palette, b: Palette): number {
  const one = (x: Palette, y: Palette) => {
    let sum = 0;
    let wsum = 0;
    for (const p of x) {
      if (p.w < 0.2) continue;
      sum += p.w * Math.min(...y.map((q) => colourDiff(p.lab, q.lab)));
      wsum += p.w;
    }
    return wsum ? sum / wsum : 0;
  };
  return Math.max(one(a, b), one(b, a));
}

function foregroundLabs(img: HTMLImageElement): Lab[] | null {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  const px = (x: number, y: number) => { const i = (y * S + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const edge: number[][] = [];
  for (let i = 0; i < S; i++) edge.push(px(i, 0), px(i, S - 1), px(0, i), px(S - 1, i));
  const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const bg = [0, 1, 2].map((k) => med(edge.map((p) => p[k])));
  const fg: number[][] = [];
  // Look at the middle 80% where the product usually is.
  for (let y = Math.floor(S * 0.1); y < S * 0.9; y++) {
    for (let x = Math.floor(S * 0.1); x < S * 0.9; x++) {
      const p = px(x, y);
      const dist = Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]);
      if (dist > 45) fg.push(p);
    }
  }
  if (fg.length < 40) return null;
  let labs = fg.map((p) => toLab(p[0], p[1], p[2]));
  // Ignore light, colourless pixels (white/grey photo backdrops and cards), unless that is all there is.
  const coloured = labs.filter(([L, a, b]) => !(L > 75 && Math.hypot(a, b) < 10));
  if (coloured.length >= 40 && coloured.length > labs.length * 0.35) labs = coloured;
  return labs;
}

// Main colour of the product (kept for simple uses).
export function productColour(img: HTMLImageElement): [number, number, number] | null {
  const labs = foregroundLabs(img);
  if (!labs) return null;
  const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return [0, 1, 2].map((k) => med(labs.map((l) => l[k]))) as [number, number, number];
}

// Colour difference that cares more about hue than about lightness (photos differ in lighting).
export const colourDiff = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * 0.5, (a[1] - b[1]) * 1.5, (a[2] - b[2]) * 1.5);

// --- look (FashionCLIP) -------------------------------------------------------
type Embedder = (src: string) => Promise<Float32Array>;
let embedder: Promise<Embedder> | null = null;

export function loadLookModel(): Promise<Embedder> {
  embedder ??= (async () => {
    const { AutoProcessor, CLIPVisionModelWithProjection, RawImage } = await import("@huggingface/transformers");
    const processor = await AutoProcessor.from_pretrained(MODEL);
    const model = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: "q8" });
    return async (src: string) => {
      const image = await RawImage.fromURL(src);
      const inputs = await processor(image);
      const { image_embeds } = await model(inputs);
      const v = image_embeds.data as Float32Array;
      let n = 0;
      for (const x of v) n += x * x;
      n = Math.sqrt(n) || 1;
      return v.map((x) => x / n);
    };
  })();
  embedder.catch(() => { embedder = null; });
  return embedder;
}

const cosine = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export type PhotoScore = { colour: number | null; look: number | null; pass: boolean; confirmed: boolean };

// Scores every result photo against the screenshot. Photos that can't be loaded get pass=true with no scores.
export async function scorePhotos(refSrc: string, photos: (string | null)[], useLook: boolean, onProgress?: (done: number) => void): Promise<PhotoScore[]> {
  const ref = await loadImg(refSrc);
  const refPal = productPalette(ref);
  let embed: Embedder | null = null;
  let refEmb: Float32Array | null = null;
  if (useLook) {
    try {
      embed = await loadLookModel();
      refEmb = await embed(refSrc);
    } catch (e) {
      console.warn("FashionCLIP unavailable, using colour check only", e);
      embed = null;
    }
  }
  const out: PhotoScore[] = [];
  let done = 0;
  for (const p of photos) {
    let colour: number | null = null;
    let look: number | null = null;
    if (p) {
      const src = proxied(p);
      try {
        const img = await loadImg(src);
        const pal = productPalette(img);
        if (refPal && pal) colour = paletteDiff(refPal, pal);
        if (embed && refEmb) look = cosine(refEmb, await embed(src));
      } catch {
        /* photo unavailable */
      }
    }
    const pass = (colour === null || colour <= COLOUR_MAX_DIFF) && (look === null || look >= LOOK_MIN);
    // "Photo match" only when both checks ran and passed.
    out.push({ colour, look, pass, confirmed: pass && colour !== null && look !== null });
    onProgress?.(++done);
  }
  return out;
}
