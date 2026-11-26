// Edit the texts of the website here. Everything below shows up on the home page.

export const MARKETS = ["Netherlands", "Germany", "Belgium", "France", "Italy", "Spain"];

export const FEATURES: { icon: string; title: string; text: string; soon?: boolean }[] = [
  { icon: "eye", title: "Screenshot recognition", text: "Works with shop pages, social posts and photos, even when the brand name is not in the picture." },
  { icon: "code", title: "Exact-match check", text: "Every listing is checked against the brand, model and colour, so look-alikes and copies are left out." },
  { icon: "box", title: "Delivered price", text: "Shipping as listed by the shop is added and foreign currencies are converted before ranking." },
  { icon: "size", title: "Size and stock check", text: "Leave out shops that don't have your size in stock.", soon: true },
  { icon: "bell", title: "Price-drop alerts", text: "Save an item and get a message when any shop drops below your target price.", soon: true },
  { icon: "shield", title: "Shop safety check", text: "Each shop shows its rating, so you can spot new or unreviewed shops before you click." },
];

export const FAQS: [string, string][] = [
  ["How does Snapprice know it is the exact same product?", "We read the brand, model name, colour and, where visible, the manufacturer's article code. Every shop listing is then checked against that, and anything that looks like a different model, colour or a copy is left out. If we are not sure, the result is marked as a likely match."],
  ["Is it really free?", "Yes. The Free plan gives you 5 screenshot searches every month with no card needed. Plus removes the limit for €4.99 a month."],
  ["Do I buy from Snapprice?", "No. You buy directly from the webshop, with its own checkout, delivery and return policy. Some shops may pay us a small referral fee when you buy, which never changes the price you pay or the ranking."],
  ["Can I return items bought from a shop abroad?", "Shops in the EU must give you at least 14 days to withdraw from an online purchase. Return shipping costs differ per shop, so check the shop's return policy before you buy."],
  ["Is the shipping cost exact?", "We show the shipping cost the shop lists. Shops abroad sometimes charge a little more to ship to your country, so check the final amount in the shop's checkout."],
  ["What happens to my screenshots?", "We send them to our recognition services (Google Lens, and Google Gemini or Claude) only to recognise the product. We don't store them ourselves."],
];

export const PLANS = {
  free: { name: "Free", price: "€0", per: "forever", items: ["5 screenshot searches a month", "Prices from shops in 6 countries", "Shipping included in every price"] },
  plus: { name: "Plus", price: "€4.99", per: "per month", items: ["Unlimited screenshot searches", "Price-drop alerts (coming soon)", "Second-hand and outlet offers (coming soon)", "Cancel any time, in one click"] },
};

export const FREE_SEARCHES_PER_MONTH = 5;
export const CONTACT_EMAIL = "hello@snapprice.app";
