"use client";

import { useEffect, useRef, useState } from "react";

export type Live = {
  phase: "searching" | "matching" | "photos" | "stock";
  countries: string[];
  sources: string[];
  done: string[]; // countries where offers were found
  tried?: string[]; // countries that answered (with or without offers)
  seen?: Live["phase"][]; // phases already reached
  found: number;
  shops: { shop: string; total: number; thumbnail: string | null; key?: string }[];
};

const flag = (cc: string) => {
  const c = cc === "UK" ? "GB" : cc;
  if (!/^[A-Z]{2}$/.test(c)) return "🌍";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
};

const STEPS: { key: Live["phase"]; label: string }[] = [
  { key: "searching", label: "Searching shops across Europe" },
  { key: "matching", label: "Keeping only your exact item" },
  { key: "photos", label: "Comparing photos with your screenshot" },
  { key: "stock", label: "Checking stock and shop photos" },
];

const TIPS = [
  "Shipping is included in every price we show.",
  "Sold-out offers are removed before you see them.",
  "We check shops in 28 European countries at once.",
  "Tip: add the article code for a perfect match.",
  "Similar items are kept separately, never mixed in.",
];

export default function LiveSearch({ live, note }: { live: Live; note: string | null }) {
  const [tip, setTip] = useState(0);
  const [secs, setSecs] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.scrollIntoView({ behavior: "smooth", block: "center" }), []);
  useEffect(() => {
    const a = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 3500);
    const b = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  const state = (k: Live["phase"]) => (k === live.phase ? "now" : (live.seen ?? []).includes(k) ? "done" : "next");
  const tried = new Set(live.tried ?? []);
  const hit = new Set(live.done);
  const answered = live.countries.filter((c) => tried.has(c)).length;

  return (
    <div className="live" role="status" ref={box}>
      <div className="live-top">
        <div className="counter">
          <b>{live.found}</b>
          <span>listings to check{secs > 2 ? ` · ${secs}s` : ""}</span>
        </div>
        <ol className="steps-live">
          {STEPS.map((s) => (
            <li key={s.key} className={state(s.key)}>
              <i aria-hidden="true">{state(s.key) === "done" ? "✓" : ""}</i>
              {s.key === "searching" && live.countries.length ? `${s.label} (${answered}/${live.countries.length} countries)` : s.label}
              {s.key === "photos" && live.phase === "photos" && note ? <small> {note}</small> : null}
            </li>
          ))}
        </ol>
      </div>

      {live.countries.length > 0 && (
        <div className="flags" aria-label="Countries searched">
          {live.countries.map((c) => (
            <span key={c} className={`flag${hit.has(c) ? " hit" : tried.has(c) ? " tried" : ""}`} title={c}>
              {flag(c)}
              <small>{c}</small>
            </span>
          ))}
        </div>
      )}

      <p className="muted">
        {answered > 0 ? `${answered} of ${live.countries.length} countries answered. ` : ""}
        Results appear once every offer has passed our checks for the exact model, colour and season.
      </p>
      <p className="tip" key={tip}>{TIPS[tip]}</p>
    </div>
  );
}
