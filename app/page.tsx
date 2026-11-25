import Finder from "@/components/Finder";
import { CONTACT_EMAIL, FAQS, FEATURES, MARKETS, PLANS } from "@/lib/site";

const ICONS: Record<string, React.ReactNode> = {
  eye: (<><circle cx="16" cy="16" r="5" fill="var(--green)" /><path d="M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16z" fill="none" stroke="var(--ink)" strokeWidth="2.4" /></>),
  code: (<><rect x="4" y="8" width="24" height="16" rx="3" fill="none" stroke="var(--ink)" strokeWidth="2.4" /><path d="M9 13v6M12 13v6M16 13v6M19 13v6M23 13v6" stroke="var(--green)" strokeWidth="2" /></>),
  box: (<><path d="M5 10l11-5 11 5v12l-11 5-11-5z" fill="none" stroke="var(--ink)" strokeWidth="2.4" /><path d="M5 10l11 5 11-5M16 15v12" fill="none" stroke="var(--green)" strokeWidth="2.4" /></>),
  size: (<><rect x="4" y="11" width="24" height="10" rx="2" fill="none" stroke="var(--ink)" strokeWidth="2.4" /><path d="M9 11v4M14 11v6M19 11v4M24 11v6" stroke="var(--green)" strokeWidth="2" /></>),
  bell: (<><path d="M9 22V15a7 7 0 0114 0v7l2 2H7z" fill="none" stroke="var(--ink)" strokeWidth="2.4" /><path d="M13 27h6" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" /></>),
  shield: (<><path d="M16 4l10 4v7c0 6-4 10-10 13C10 25 6 21 6 15V8z" fill="none" stroke="var(--ink)" strokeWidth="2.4" /><path d="M11 16l4 4 7-8" fill="none" stroke="var(--green)" strokeWidth="2.6" strokeLinecap="round" /></>),
};

export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="wrap">
          <a className="logo" href="#top" aria-label="Snapprice home">
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><path d="M3 4h11l11 11-10 10L3 13z" fill="var(--green)" /><circle cx="9" cy="9" r="2.4" fill="var(--bg)" /></svg>
            Snapprice
          </a>
          <nav className="links" aria-label="Main">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="btn btn-main" href="#try">Find my lowest price</a>
        </div>
      </header>

      <main id="top">
        <section className="band hero" aria-labelledby="h1">
          <div className="wrap hero-top">
            <h1 id="h1">Screenshot the product. We find the shop selling it cheapest.</h1>
            <div className="hero-side">
              <p className="lede">Drop in a screenshot of the exact item you want. Snapprice recognises the brand, model and colour, checks webshops across Europe, and shows you the lowest price with shipping included.</p>
              <div className="ctas">
                <a className="btn btn-main" href="#try">Find my lowest price</a>
                <a className="btn btn-ghost" href="#how">See how it works</a>
              </div>
              <p className="note">Free to start. No card needed for your first 5 searches.</p>
            </div>
          </div>
        </section>

        <div className="stage" id="try">
          <Finder />
        </div>

        <section className="band strip" aria-label="Markets searched">
          <div className="wrap">
            <p>Searches webshops in</p>
            <div className="marks">
              {MARKETS.map((m) => (
                <span className="mark" key={m}>
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M1.5 8h13M8 1.5c2.2 2 2.2 11 0 13M8 1.5c-2.2 2-2.2 11 0 13" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
                  {m}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="band" aria-labelledby="vp-h">
          <div className="wrap">
            <div className="head">
              <h2 id="vp-h">Stop opening twenty tabs to save a few euros.</h2>
              <p className="lede">The same jacket can cost 40% less one border away. You just never see that shop. Snapprice does the looking for you.</p>
            </div>
            <div className="vp">
              <article>
                <span className="big">Hours back</span>
                <h3>One screenshot replaces an evening of searching</h3>
                <p>No guessing the right search words or scrolling through look-alikes. You get a ranked list in under a minute.</p>
              </article>
              <article>
                <span className="big">Lowest real price</span>
                <h3>The price you actually pay, not the bait price</h3>
                <p>Results include the shop&apos;s listed shipping and convert foreign currencies, so the cheapest one is really the cheapest.</p>
              </article>
              <article>
                <span className="big">Exact match</span>
                <h3>Only the item you want</h3>
                <p>We match on brand, model and colour and leave out copies, accessories and near misses.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="band how" id="how" aria-labelledby="how-h">
          <div className="wrap">
            <div className="head">
              <h2 id="how-h">From screenshot to checkout in three steps.</h2>
              <p className="lede">You stay in control: we find the deal, you buy straight from the shop.</p>
            </div>
            <ol className="steps">
              <li>
                <div className="pic"><svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect x="96" y="18" width="108" height="116" rx="12" fill="none" stroke="var(--green)" strokeWidth="3" strokeDasharray="8 7" /><rect x="118" y="34" width="64" height="70" rx="8" fill="var(--pink)" /><path d="M134 42h32l3 54h-13l-4-32-4 32h-13z" fill="#2b2a28" /><path d="M150 120v-12m-7 6 7-7 7 7" stroke="var(--ink)" strokeWidth="3" fill="none" strokeLinecap="round" /></svg></div>
                <h3>Drop your screenshot</h3>
                <p>From any webshop, Instagram, Pinterest or a photo of a friend&apos;s jacket. Or just type the product name.</p>
              </li>
              <li>
                <div className="pic"><svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect x="70" y="30" width="72" height="90" rx="10" fill="var(--pink)" /><path d="M90 40h32l3 70h-13l-6-42-6 42H86z" fill="#2b2a28" /><circle cx="196" cy="68" r="28" fill="none" stroke="var(--ink)" strokeWidth="6" /><path d="M216 88l20 20" stroke="var(--ink)" strokeWidth="8" strokeLinecap="round" /><path d="M184 68l8 8 16-16" stroke="var(--green)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                <h3>We identify the exact product</h3>
                <p>Our recognition reads brand, model, colour and article code, then searches shops across Europe for that item only.</p>
              </li>
              <li>
                <div className="pic"><svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g fill="var(--soft)" stroke="var(--line)" strokeWidth="2"><rect x="60" y="26" width="180" height="28" rx="7" /><rect x="60" y="62" width="180" height="28" rx="7" /><rect x="60" y="98" width="180" height="28" rx="7" /></g><rect x="60" y="26" width="180" height="28" rx="7" fill="var(--green)" /><rect x="72" y="35" width="60" height="10" rx="5" fill="#fff" /><rect x="196" y="35" width="32" height="10" rx="5" fill="#fff" /><rect x="72" y="71" width="70" height="10" rx="5" fill="var(--line)" /><rect x="72" y="107" width="50" height="10" rx="5" fill="var(--line)" /></svg></div>
                <h3>Buy from the cheapest shop</h3>
                <p>See every offer ranked by delivered price, check the shop&apos;s rating, and go straight to its checkout.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="band" id="features" aria-labelledby="f-h">
          <div className="wrap">
            <div className="head">
              <h2 id="f-h">Built to find the deal other searches miss.</h2>
              <p className="lede">Everything you would check yourself, done for every shop at once.</p>
            </div>
            <div className="feat">
              {FEATURES.map((f) => (
                <div key={f.title}>
                  <svg viewBox="0 0 32 32" aria-hidden="true">{ICONS[f.icon]}</svg>
                  <h3>{f.title} {f.soon && <span className="tag">Coming soon</span>}</h3>
                  <p>{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="band quote" aria-label="Customer story">
          <div className="wrap">
            <figure style={{ margin: 0 }}>
              <blockquote>“I wanted one specific pair of Carhartt trousers. Snapprice found them at an Italian shop running 40% off, delivered to my door for €48 less than the Dutch price.”</blockquote>
              <figcaption><b>Sample customer story</b><small>Placeholder quote to show the format. Replace with a real beta user before launch.</small></figcaption>
            </figure>
            <div className="receipt" aria-label="Example saving">
              <div><span>Usual price (NL)</span><span>€119.90</span></div>
              <div><span>Italian shop, 40% off</span><span>€71.94</span></div>
              <div><span>Shipping to NL</span><span>€0.00</span></div>
              <div className="tot"><span>Saved</span><span>€47.96</span></div>
            </div>
          </div>
        </section>

        <section className="band" id="pricing" aria-labelledby="p-h">
          <div className="wrap">
            <div className="head">
              <h2 id="p-h">Pays for itself with your first deal.</h2>
              <p className="lede">Start free. Upgrade when you want unlimited searches.</p>
            </div>
            <div className="plans">
              <div className="plan">
                <h3>{PLANS.free.name}</h3>
                <p className="amt">{PLANS.free.price} <small>{PLANS.free.per}</small></p>
                <ul>{PLANS.free.items.map((i) => <li key={i}>{i}</li>)}</ul>
                <a className="btn btn-ghost" href="#try">Start saving for free</a>
              </div>
              <div className="plan pro">
                <span className="flag">Most popular</span>
                <h3>{PLANS.plus.name}</h3>
                <p className="amt">{PLANS.plus.price} <small>{PLANS.plus.per}</small></p>
                <ul>{PLANS.plus.items.map((i) => <li key={i}>{i}</li>)}</ul>
                <a className="btn btn-main" href={`mailto:${CONTACT_EMAIL}?subject=Snapprice%20Plus`}>Join the Plus waitlist</a>
              </div>
            </div>
          </div>
        </section>

        <section className="band faq how" id="faq" aria-labelledby="q-h">
          <div className="wrap">
            <div>
              <h2 id="q-h">Questions before you start.</h2>
              <p className="lede" style={{ marginTop: 16 }}>Something else on your mind? Write to {CONTACT_EMAIL}.</p>
            </div>
            <div>
              {FAQS.map(([q, a], i) => (
                <details key={q} open={i === 0}><summary>{q}</summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </section>

        <section className="band close" aria-labelledby="c-h">
          <div className="wrap">
            <div>
              <h2 id="c-h">Your next purchase is probably cheaper somewhere else.</h2>
              <p>Find out in under a minute. Your first 5 searches are free.</p>
            </div>
            <a className="btn btn-white" href="#try">Find my lowest price</a>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>© 2026 Snapprice. Compare once, pay less.</span>
          <nav aria-label="Footer"><a href="#how">How it works</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a><span>{CONTACT_EMAIL}</span></nav>
        </div>
      </footer>
    </>
  );
}
