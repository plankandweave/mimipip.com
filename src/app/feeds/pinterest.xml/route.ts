// Pinterest catalogue feed — what makes every shoppable design a product Pin
// people find while browsing and searching Pinterest. Register this URL in
// Pinterest Business → Catalogues as a data source; Pinterest re-fetches it.
//
// Same products and prices as the Google feed (src/lib/feeds/product-feed.ts) with
// two differences, both deliberate:
// - Room renders only. A flat is never the main picture or an additional one,
//   and a design with no render is left out until it has one — on Pinterest a
//   swatch is the whole impression (the homepage's rule 9, off-site).
// - No ₹200 samples. The catalogue sells walls, not swatches.
import { productFeedResponse } from "@/lib/feeds/product-feed";

// Dynamic for the same reason as the Google feed: ?country=US|AE must not be
// served the first country's cached response.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return productFeedResponse(request, { images: "renders-only", includeSamples: false });
}
