# Snapprice

Screenshot a product, and Snapprice finds the webshop in Europe that sells that exact item cheapest, shipping included.

**How it works**

1. You drop in a screenshot (or type a product name).
2. Claude (an AI from Anthropic) looks at the picture and works out the exact product: brand, model, colour and article code.
3. The site searches Google Shopping in several countries at once (Netherlands, Germany, Belgium, France, Italy, Spain by default) through SerpApi.
4. Claude checks every shop listing and throws out look-alikes, other colours and accessories.
5. You get the shops ranked by price including shipping, with foreign currencies converted to euros.

Without API keys the site runs in **demo mode**: everything works, but with sample results. Nothing costs money in demo mode.

---

## Put the site live (about 10 minutes, free)

You need: this GitHub repository and a free Vercel account.

1. Go to **https://vercel.com/signup** and choose **Continue with GitHub**.
2. Click **Add New… → Project**.
3. Find **snapprice** in the list and click **Import**. (If you don't see it, click "Adjust GitHub App Permissions" and give Vercel access to the snapprice repository.)
4. Leave all settings as they are and click **Deploy**.
5. After about a minute you get a web address like `snapprice-xyz.vercel.app`. That is your live site, in demo mode.

## Switch on real search (add the two keys)

### Key 1: Claude, for recognising products

1. Go to **https://platform.claude.com** and create an account.
2. Under **Billing**, add a payment method and some credit (€5 to €10 is plenty to start).
3. Go to **Settings → API keys → Create key**. Copy the key (it starts with `sk-ant-`).

Rough cost: a few cents per search (one picture to recognise plus one check of the shop listings).

### Key 2: SerpApi, for prices from Google Shopping

1. Go to **https://serpapi.com/users/sign_up** and create an account. The free plan includes a limited number of searches per month, enough to test.
2. Go to **https://serpapi.com/manage-api-key** and copy your **Private API Key**.

Cost: one user search uses one SerpApi search **per country** (so 6 by default). On the free plan that means you can do a handful of full searches a month; for real customers you'll need a paid plan. You can search fewer countries with the `SEARCH_COUNTRIES` setting below.

### Add the keys to Vercel

1. In Vercel, open your **snapprice** project → **Settings → Environment Variables**.
2. Add `ANTHROPIC_API_KEY` with the Claude key as the value. Click **Save**.
3. Add `SERPAPI_API_KEY` with the SerpApi key. Click **Save**.
4. Go to **Deployments**, click the **⋯** next to the top one and choose **Redeploy**.

Now the site recognises real screenshots and shows live prices. Keep the keys secret: never put them in the code or share them.

### Optional settings (also under Environment Variables)

| Name | What it does | Default |
|---|---|---|
| `SEARCH_COUNTRIES` | Countries to search, comma separated. Options: nl, be, de, fr, it, es, at, pt, ie, fi, pl, dk, se | `nl,de,be,fr,it,es` |
| `HOME_COUNTRY` | The shopper's country, used for the "you save" comparison | `nl` |
| `CLAUDE_MODEL` | Which Claude model is used | `claude-opus-5-5` |
| `NEXT_PUBLIC_ENFORCE_FREE_LIMIT` | Set to `true` to block searches after the 5 free ones a month | off |

---

## Editing the site

Every change saved to this GitHub repository goes live on Vercel automatically within a minute or two.

- **Texts** (features, FAQ, prices, countries list, email address): `lib/site.ts`
- **Page layout and headlines**: `app/page.tsx`
- **Colours and styling**: `app/globals.css` (the colours are at the top, e.g. `--green`)
- **The upload and results box**: `components/Finder.tsx`

You can edit a file right on github.com: open it, click the pencil icon, change the text, and click **Commit changes**. Or ask Claude to make the change for you.

## What's not built yet

- **Accounts and payments.** The "5 free searches a month" counter lives in the visitor's browser and is easy to get around. A real subscription needs user accounts (e.g. Clerk or Supabase) and payments (e.g. Stripe or Mollie).
- **Shipping to your country.** The shipping shown is what the shop lists on Google Shopping. Shops abroad can charge more to ship to the Netherlands.
- **Size and stock checks, price-drop alerts.** Marked "Coming soon" on the site.
- **Referral income.** Links go straight to the shops. Affiliate networks (Awin, TradeTracker, Daisycon) could earn a commission per sale.

## For developers

```bash
npm install
cp .env.example .env.local   # add keys, or leave empty for demo mode
npm run dev                  # http://localhost:3000
```

Next.js (App Router) + TypeScript. API routes: `app/api/identify` (image → product, Claude vision with structured output) and `app/api/search` (SerpApi Google Shopping per country → Claude match check → ranked offers). Currency rates from the ECB via frankfurter.app.
