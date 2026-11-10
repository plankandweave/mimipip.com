# MimiPip in ChatGPT and other assistants

Founder, 10 November 2026: "If we need to be in ChatGPT, we need to be there."
What OpenAI, Anthropic, Perplexity, Google and Microsoft publish (read
10 November 2026, with links), and the decision to refuse training crawlers,
are in `docs/ai-assistant-visibility.md` in plankandweave/Zyvorah.com. They
apply to MimiPip unchanged. **Re-check on 10 December 2026.**

## What mimipip.com serves to assistants

| What | URL | Made by |
|---|---|---|
| robots.txt (search and user-fetch crawlers invited, training refused, OAI-AdsBot named) | https://mimipip.com/robots.txt | `src/lib/robots-policy.ts` |
| llms.txt: what MimiPip sells, to whom, delivery, pricing, returns, where to buy, and every design on sale | https://mimipip.com/llms.txt | `src/brand/seo/llms.ts` |
| OpenAI product feed, U.S. (USD) | https://mimipip.com/feeds/openai-products.jsonl | `src/brand/seo/openai-feed.ts` |
| OpenAI product feed, India (INR) | https://mimipip.com/feeds/openai-products.jsonl?country=IN | same |
| What the feed check refused, and why | https://mimipip.com/feeds/openai-products.jsonl?report=1 | same |
| Product and Offer data on each product page | e.g. https://mimipip.com/products/almond-blossom | `src/brand/seo/head.ts`, written by `worker/public-page.ts` |

Rules:
- **Only designs on sale.** The feed, llms.txt and the sitemap are made from
  `sellable` (`src/brand/seo/site.ts`): a design with a price in `prices.json`
  AND a print file. On 10 November 2026 that is 89 of the catalogue's 182
  records (86 wallpapers, 3 hopscotch colourways); the rest are hidden by the
  owner's rule and appear nowhere.
- **Only what the site already says.** Prices are read back from the checkout's
  own price functions (₹200/sq ft + 18% GST in India, US$10/sq ft including
  delivery abroad, 20 sq ft minimum). Delivery, cancellation and returns are
  the words of `/guides/shipping-returns`. No safety or material claim appears
  (the site makes none); `ai-visibility.test.ts` fails if one is added.
- **One Product per page.** On a page MimiPip writes the head for, the
  inherited structured data (relative pictures, another shop's ids) is removed
  and MimiPip's own `OnlineStore` and `Product` are written in its place.
- **Every feed row is checked** (`openAiRowProblems` plus the Google feed's
  `feedProblems`): a missing required field, a price in the wrong currency, a
  URL off mimipip.com, a non-JPEG/PNG picture or a checkout claim is refused,
  never patched. Zero valid rows answers 500.

`node scripts/verify-ai-visibility.mjs` fetches the live site as OAI-SearchBot,
ChatGPT-User, Claude-User, PerplexityBot and others and fails on anything that
keeps MimiPip out of an answer. It runs after every deploy (`deploy.yml`). On
10 November 2026, before this change, it failed 11 checks on production.

## Still open

1. **The OpenAI merchant application** at https://chatgpt.com/merchants:
   Roheena's to submit (it asks for her name, work email and LinkedIn). Feed
   size: under 1,000 SKUs. ChatGPT shopping is U.S.-only today, and MimiPip
   sells to the U.S. in USD, so the U.S. feed is eligible.
2. After approval OpenAI issues SFTP credentials; a daily push of the feed is
   built then. Ask at onboarding about India/INR.
