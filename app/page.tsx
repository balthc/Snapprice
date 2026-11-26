import Finder from "@/components/Finder";
import { CONTACT_EMAIL, FAQS, PLANS, STEPS } from "@/lib/site";

export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="wrap">
          <a className="logo" href="#top" aria-label="Snapprice home">
            <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true"><path d="M3 4h11l11 11-10 10L3 13z" fill="var(--green)" /><circle cx="9" cy="9" r="2.4" fill="var(--bg)" /></svg>
            Snapprice
          </a>
          <nav className="links" aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="hero wrap" aria-labelledby="h1">
          <h1 id="h1">Find it cheaper. Anywhere in Europe.</h1>
          <p className="lede">Drop a screenshot of any product. We recognise it and show the shops that have it in stock, cheapest first, shipping included.</p>
          <Finder />
        </section>

        <section className="band" id="how" aria-labelledby="how-h">
          <div className="wrap">
            <h2 className="section-title" id="how-h">How it works</h2>
            <ol className="steps">
              {STEPS.map(([t, p]) => (
                <li key={t}><h3>{t}</h3><p>{p}</p></li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band soft" id="pricing" aria-labelledby="p-h">
          <div className="wrap">
            <h2 className="section-title" id="p-h">Simple pricing</h2>
            <div className="plans">
              <div className="plan">
                <h3>{PLANS.free.name}</h3>
                <p className="amt">{PLANS.free.price} <small>{PLANS.free.per}</small></p>
                <ul>{PLANS.free.items.map((i) => <li key={i}>{i}</li>)}</ul>
                <a className="btn btn-ghost" href="#top">Start searching</a>
              </div>
              <div className="plan pro">
                <h3>{PLANS.plus.name}</h3>
                <p className="amt">{PLANS.plus.price} <small>{PLANS.plus.per}</small></p>
                <ul>{PLANS.plus.items.map((i) => <li key={i}>{i}</li>)}</ul>
                <a className="btn btn-main" href={`mailto:${CONTACT_EMAIL}?subject=Snapprice%20Plus`}>Join the waitlist</a>
              </div>
            </div>
          </div>
        </section>

        <section className="band" id="faq" aria-labelledby="q-h">
          <div className="wrap">
            <h2 className="section-title" id="q-h">Questions</h2>
            <div className="faq">
              {FAQS.map(([q, a]) => (
                <details key={q}><summary>{q}</summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>© 2026 Snapprice</span>
          <span>{CONTACT_EMAIL}</span>
        </div>
      </footer>
    </>
  );
}
