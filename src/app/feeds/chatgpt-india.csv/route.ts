// ChatGPT product catalogue feed (OpenAI Ads Manager / ChatGPT shopping).
//
// WHY THIS EXISTS AS A ROUTE, NOT A FILE
// This was a static CSV frozen on 23 Sep 2026 (public/feeds/chatgpt-india.csv).
// A frozen feed means ChatGPT discovers stale prices and a stale set of designs,
// and when it drifts too far ChatGPT stops surfacing the catalogue — which is
// what silenced our biggest *free* traffic source on 24 Sep. This route rebuilds
// the feed from the live catalogue on every fetch, so prices, availability and
// new designs stay current the way the Google Merchant feed already does.
//
// THE LABEL FIX
// The old file hard-coded `utm_medium=paid` on every URL. ChatGPT surfaces this
// catalogue mostly through its FREE shopping/discovery, so those clicks were
// being mislabelled "paid" in our own analytics — inflating paid performance and
// hiding a real free channel. The correct medium for feed-driven discovery is
// `ai_shopping` (classifies as AI-assistant/organic, not Paid AI — see
// docs/campaign-tracking.md). A genuine paid ChatGPT campaign carries its own
// `paid_ai` tag set on the campaign, so the two never collide.
//
// One representative made-to-measure configuration per design (10 ft × 8 ft)
// on its assigned surface. Public and cacheable; register this
// URL as the feed source in ChatGPT Ads Manager.
import { supabase } from "@/lib/supabase";
import { SITE_URL, stripHtml } from "@/lib/seo";
import { WALLPAPER_CATEGORY } from "@/lib/product-category";
import { designOffer } from "@/lib/feeds/design-offer";

export const dynamic = "force-dynamic";

// A 10 × 8 ft wall is above the 20 sq ft billing floor, so its own area is the
// chargeable area and price = area × the design's current catalogue rate.
const ADV_W = 10;
const ADV_H = 8;
const ADV_AREA = ADV_W * ADV_H; // 80 sq ft

type Row = {
  handle: string;
  title: string;
  description: string | null;
  category: string | null;
  flat_verified: boolean | null;
  ready_sizes: [number, number][] | null;
  product_categories: { measurement_type: "area" | "length" | "fixed" | null } | null;
  product_images: { url: string; position: number; is_featured: boolean; is_flat: boolean }[];
  product_tags: { tag: string }[];
  product_materials: {
    price_per_sqft: number;
    available: boolean;
    materials: { slug: string; name: string; coming_soon: boolean } | null;
  }[];
};

/** RFC-4180 CSV field: quote when it holds a comma, quote or newline; double any
 *  internal quotes. A description with a stray comma must never shift columns. */
function csv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const styleGroup = (tags: string[]): string => {
  const t = tags.find((x) => !/^(mood|colour|color):/i.test(x) && x.length > 2);
  return (t ?? "mural").toLowerCase().replace(/\s+/g, "-").slice(0, 40);
};

export async function GET() {
  const rows: Row[] = [];
  const PAGE = 100;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select(
        `handle, title, description, category, flat_verified, ready_sizes,
         product_categories ( measurement_type ),
         product_images ( url, position, is_featured, is_flat ),
         product_tags ( tag ),
         product_materials ( price_per_sqft, available, materials ( slug, name, coming_soon ) )`,
      )
      .eq("status", "active").eq("is_service", false)
      .order("handle")
      .range(from, from + PAGE - 1);
    if (error) return new Response(`feed error: ${error.message}`, { status: 500 });
    const batch = (data ?? []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const header =
    "item_id,title,description,url,brand,seller_name,image_url,availability,price,is_ads_eligible,is_eligible_search,is_eligible_checkout,ads_metadata";
  const lines: string[] = [header];
  const freshness = `live-${new Date().toISOString().slice(0, 7)}`;

  for (const p of rows) {
    // Mural wallpaper designs only — the same product a 10 × 8 ft price is honest
    // for. Ready-size, canvas and border families price differently and are left
    // to the Google feed rather than mis-sold here.
    const family = p.product_categories?.measurement_type ?? "area";
    if (family !== "area" || (p.ready_sizes?.length ?? 0) > 0) continue;
    if (p.category !== WALLPAPER_CATEGORY) continue;

    const offer = designOffer(p.product_materials);
    if (!offer) continue;

    const sorted = [...p.product_images].sort(
      (a, b) => Number(b.is_flat) - Number(a.is_flat) || Number(b.is_featured) - Number(a.is_featured) || a.position - b.position,
    );
    const image = sorted[0]?.url;
    if (!image) continue;

    const price = ADV_AREA * offer.rate;
    const handle = p.handle;
    const tags = p.product_tags.map((t) => t.tag);
    const url =
      `${SITE_URL}/products/${handle}?w=${ADV_W}&h=${ADV_H}` +
      `&utm_source=chatgpt&utm_medium=ai_shopping&utm_campaign=zyvorah_catalogue_india&utm_content=${encodeURIComponent(handle)}`;
    const base = stripHtml(p.description).slice(0, 700) ||
      `${p.title} — a Zyvorah wallpaper mural, prepared for your order in India.`;
    const description =
      `${base} Advertised configuration: ${ADV_W} ft wide by ${ADV_H} ft high (${ADV_AREA} sq ft), with a ${offer.surface}. ` +
      `Price INR ${price.toLocaleString("en-IN")} for this configuration; other wall dimensions change the total. Sized to your wall.`;
    const adsMeta = JSON.stringify({
      custom_label_0: styleGroup(tags),
      custom_label_1: offer.slug,
      custom_label_2: "10x8-ft",
      custom_label_3: freshness,
    });

    lines.push(
      [
        csv(`ZYV-${handle.toUpperCase()}-10X8FT-PNW`),
        csv(`${p.title} Wallpaper Mural – 10 ft x 8 ft`),
        csv(description),
        csv(url),
        "Zyvorah",
        "Zyvorah",
        csv(image),
        "in_stock",
        `${price.toFixed(2)} INR`,
        "true",
        "false",
        "false",
        csv(adsMeta),
      ].join(","),
    );
  }

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
