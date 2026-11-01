// Google Merchant Center product feed. Built by src/lib/feeds/product-feed.ts, which
// the Pinterest catalogue feed shares — the flat artwork leads here.
//
// Public and crawlable by design (robots.txt only blocks /api/ and private
// routes) — register this URL in Merchant Center as a scheduled fetch.
import { productFeedResponse } from "@/lib/feeds/product-feed";

// This route serves the India, U.S. and UAE catalogues. It must stay dynamic so
// the framework does not cache the first country requested as the response for
// every query-string variant. The response itself remains publicly cacheable;
// that HTTP cache keys on the complete URL, including ?country=US.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return productFeedResponse(request, { images: "flat-first", includeSamples: true });
}
