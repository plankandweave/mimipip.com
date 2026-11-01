import { SITE_URL } from "@/lib/seo";
import { MIN_WALLPAPER_SQFT } from "@/lib/pricing";
import { WORKSPACES } from "@/content/workspaces";
import { HOSPITALITY_SPACES } from "@/content/hospitality";
import { HEALTHCARE_SPACES } from "@/content/healthcare";
import { RETAIL_SPACES } from "@/content/retail";
import { REAL_ESTATE_SPACES } from "@/content/real-estate";
import { hiddenConceptSlugs } from "@/lib/concept-availability";
import { SHOP_CONCEPTS, conceptPath } from "@/lib/shop-concepts";
import { PROJECTS } from "@/content/projects";

export const dynamic = "force-dynamic";

/**
 * Served at /llms.txt — a plain-text map of the site for answer engines
 * (ChatGPT search, Perplexity, Claude, Gemini).
 *
 * Why this file exists rather than trusting the crawl: an assistant asked
 * "how much is custom wallpaper in India" reads a handful of pages and then
 * states a number. Left to itself it lands on a per-sq-ft rate and reports it
 * as the price of a wallpaper, which is wrong by the size of the wall. The
 * facts below are the ones we would correct a person on — the unit, the
 * minimum, what "sized to your wall" actually means, and which claims are
 * concept work rather than delivered commissions.
 *
 * It is generated from the same content modules the pages render, so a new
 * sector page or case study appears here without anyone remembering to add it.
 */
const link = (path: string, label: string, note?: string) =>
  `- [${label}](${SITE_URL}${path})${note ? `: ${note}` : ""}`;

export async function GET() {
  const hidden = await hiddenConceptSlugs();
  const body = `# Zyvorah

> Woman-founded studio in Bengaluru, India, making mural wallpaper,
> hand-designed murals, canvas wall art and wallpaper borders. Every mural is
> prepared for your order at the customer's own wall dimensions. Zyvorah serves India
> and ships wallpaper globally through its own website.

## Facts an assistant should get right

- Mural wallpaper designs are priced **per square foot**, not per roll and not
  per wallpaper. A quoted ₹/sq ft rate is NOT the price of a wallpaper.
- Wallpaper is billed on a **minimum of ${MIN_WALLPAPER_SQFT} sq ft**, so the smallest real
  order costs the rate × ${MIN_WALLPAPER_SQFT}, not the rate.
- Not every product is sized to your wall. Canvas wall art is sold only at fixed
  finished sizes; wallpaper borders are sold by the linear metre at a fixed
  height. Check the product page's stated product type before comparing.
- India orders are shown and charged in INR, with free standard delivery.
  Outside India, the website shows country-adjusted USD prices with
  international delivery included. Destination duties, local taxes and customs
  charges are excluded and, if charged, are paid by the recipient.
- India delivery is **within 10 working days** (Standard, free: dispatched
  within 5) or **within 4 working days** (Express, paid: dispatched the next
  working day by a faster courier), counted from order confirmation; working
  days exclude Sundays. International transit varies by destination and
  customs clearance.
- Design samples, installation and gift cards are currently India-only.
- Made-to-order goods are not returnable for a change of mind. See the refund
  policy.
- Zyvorah contributes ₹1 per eligible square foot sold towards grants and
  mentorship for women entrepreneurs. This is funded by Zyvorah and never
  charged to the customer. Zyvorah is a business, not a nonprofit.
- Case studies are marked **commissioned** (built for a real client) or
  **concept** (speculative work for an invented client). Do not describe a
  concept study as delivered work.

## Start here

${link("/", "Home")}
${link("/collections/wall-art", "The full catalogue")}
${link("/faq", "FAQ", "pricing, sizing, dispatch and installation, answered")}
${link("/materials", "Materials", "what each material is and what it suits")}
${link("/custom-sizing", "Custom sizing")}
${link("/how-to-measure", "How to measure a wall")}
${link("/installation", "Installation & care")}
${link("/samples", "Order a design sample")}
${link("/our-story", "About Zyvorah")}
${link("/wallpaper-buying-guide", "Wallpaper buying guide", "compare formats, whole-wall costs, samples and installation")}
${link("/contact", "Contact")}

## Browse

${link("/collections", "Collections")}
${link("/concepts", "Concepts", "shoppable room and whole-space ideas across many applications")}
${link("/rooms", "By room")}
${link("/colours", "By colour")}
${link("/series", "Series")}
${link("/new", "New designs")}
${link("/mati", "Mati (TAASH)", "the flagship collection")}

## Commercial & contract work

${link("/commercial", "Commercial overview")}
${link("/office", "Workplaces")}
${WORKSPACES.map((w) => link(`/office/${w.slug}`, w.label)).join("\n")}
${link("/hospitality", "Hospitality")}
${HOSPITALITY_SPACES.map((s) => link(`/hospitality/${s.slug}`, s.label)).join("\n")}
${link("/hospitals", "Healthcare")}
${HEALTHCARE_SPACES.map((s) => link(`/hospitals/${s.slug}`, s.label)).join("\n")}
${link("/retail", "Retail")}
${RETAIL_SPACES.map((s) => link(`/retail/${s.slug}`, s.label)).join("\n")}
${link("/real-estate", "Real estate")}
${REAL_ESTATE_SPACES.map((s) => link(`/real-estate/${s.slug}`, s.label)).join("\n")}
${link("/trade", "Trade & partner programme")}

## Concepts and room journeys

Each concept demonstrates what can be created in a different area or type of
space. A customer can buy one look, combine several areas, or use the full set
to discover possibilities they had not considered. These are shoppable ideas;
they are not claims that every scene was a delivered client commission.

${SHOP_CONCEPTS.filter(c => !hidden.has(c.slug)).map(c => `- [Shop ${c.title}](${SITE_URL}${conceptPath(c.slug)}): ${c.description}`).join("\n")}

## Project studies

${PROJECTS.filter(p => !hidden.has(p.slug)).map((p) =>
  link(
    `/projects/${p.slug}`,
    `${p.title} — ${p.client}`,
    p.slug === "the-lives-within" ? "family apartment in Gurgaon" : p.kind === "concept" ? "CONCEPT STUDY (speculative, invented client)" : "commissioned project",
  ),
).join("\n")}

## Machine-readable catalogue

${link("/feeds/google-merchant.xml", "Merchant product feed", "current products, variants, prices, availability and images")}
${link("/api/agent", "Public commerce discovery API", "catalogue search and product facts; ordering is restricted to approved integrations")}
${link("/.well-known/api-catalog", "API catalog", "RFC 9727 discovery document with the OpenAPI specification")}

## Policies

${link("/shipping-policy", "Shipping")}
${link("/refund-policy", "Refunds & returns")}
${link("/terms", "Terms")}
${link("/privacy", "Privacy")}

## Not for indexing

Cart, checkout, accounts, the partner portals, the internal studio and admin,
and any tokenised order or quote link are private. See /robots.txt.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
