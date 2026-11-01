
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWrapProduct } from "@/lib/wrap-queries";
import { getWrapContext } from "@/lib/wrap-context";
import { APPLIANCES, APPLIANCE_CATEGORY, wrapDesignPath } from "@/lib/appliances";
import { formatINR } from "@/lib/pricing";
import { stripHtml } from "@/lib/seo";
import { WrapConfigurator } from "@/components/WrapConfigurator";
import { WrapsSubnav } from "@/components/WrapsSubnav";

/**
 * One wrap design.
 *
 * On the retired fridge-wraps branch this was the store's own product page
 * (/products/<handle>) with a wrap branch threaded through it, which worked
 * only because that whole app read the `wraps` schema. Here the store's product
 * page reads the store's catalogue, so a wrap design has its own page, built
 * from the same pieces that branch used: getWrapContext() for every fact, the
 * WrapsSubnav to get back to the range, and the WrapConfigurator — which draws
 * the design ON the appliance (never a bare swatch) and says "coming soon"
 * where a buy button will be.
 */

export const revalidate = 3600;

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ appliance?: string }>;
};

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const product = await getWrapProduct(handle);
  if (!product) return { title: "Design not found" };
  const ctx = await getWrapContext({ handle, category: APPLIANCE_CATEGORY, wrap_format_codes: product.wrapFormatCodes });
  const noun = ctx ? [...new Set(ctx.offered.map((a) => APPLIANCES[a].pickerGroupLabel))].join(", ") : "your appliance";
  return {
    title: { absolute: `${product.title} — Wrap for ${noun} | Zyvorah` },
    description:
      stripHtml(product.description).slice(0, 155) ||
      `${product.title}, printed as a self-adhesive panel set cut to fit and trimmed to your own edge.`,
    alternates: { canonical: wrapDesignPath(handle) },
  };
}

export default async function WrapDesignPage({ params, searchParams }: Props) {
  const [{ handle }, sp] = await Promise.all([params, searchParams]);
  const product = await getWrapProduct(handle);
  if (!product) notFound();
  // A deep link from an appliance landing page (?appliance=) opens on that
  // appliance; anything stale or invented falls back to the design's primary.
  const wrap = await getWrapContext(
    { handle, category: APPLIANCE_CATEGORY, wrap_format_codes: product.wrapFormatCodes },
    sp.appliance ?? null,
  );
  // A wrap with no availability rows is a half-finished upload, not a design
  // anyone can be shown a price for.
  if (!wrap) notFound();

  const primary = wrap.primary;
  const flat = product.images.find((i) => i.isFlat) ?? product.images[0] ?? null;
  const offeredGroups = [...new Set(wrap.offered.map((k) => APPLIANCES[k].pickerGroupLabel))];

  const heading = (
    <>
      <p className="caps text-slate">{offeredGroups.join(" · ")} wrap</p>
      <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-tight">{product.title}</h1>
      {wrap.fromPrice != null && (
        <p className="mt-3 text-sm text-slate">
          From <span className="font-semibold text-charcoal">{formatINR(wrap.fromPrice)}</span> a panel set · GST
          included
        </p>
      )}
    </>
  );

  return (
    <div>
      <WrapsSubnav current={primary.pickerGroup} trail={[{ label: product.title }]} />

      <div className="container-x pt-8 lg:hidden">{heading}</div>
      <div className="container-x grid gap-10 py-10 max-lg:pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-16">
        {/* Phone: name and price, then the picture (the configurator leads with
            it), then the story. A phone that opened on three paragraphs of copy
            showed the design only after a full screen of scrolling. Desktop
            keeps the two columns, so this header lives in the left column there. */}
        <div className="max-w-xl">
          <div className="hidden lg:block">{heading}</div>
          {product.description && (
            <div
              className="prose-sm mt-6 text-[0.95rem] leading-relaxed text-slate"
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          )}

          <div className="mt-8 space-y-6 border-t border-edge pt-8 text-sm text-slate">
            <div>
              <h2 className="font-display text-[1.05rem] font-semibold text-charcoal">{primary.sizing.heading}</h2>
              <p className="mt-2">{primary.sizing.body}</p>
              {offeredGroups.length > 1 && (
                <p className="mt-2">
                  This design is made for {offeredGroups.join(", ")} — choose which in the panel.
                </p>
              )}
              {primary.supportsModelFinder && (
                <p className="mt-2">
                  Not sure which format fits?{" "}
                  <Link href="/fridge-wraps/fit-finder" className="link-underline">
                    Find your fridge
                  </Link>
                  , or{" "}
                  <Link href="/fridge-wraps/made-to-measure" className="link-underline">
                    price sized to your wall
                  </Link>
                  .
                </p>
              )}
            </div>
            <div>
              <h2 className="font-display text-[1.05rem] font-semibold text-charcoal">How it arrives</h2>
              <p className="mt-2">{primary.supplyCopy}</p>
            </div>
          </div>
        </div>

        <div className="max-lg:order-first lg:sticky lg:top-28 lg:self-start">
          <WrapConfigurator
            productHandle={product.handle}
            productTitle={product.title}
            offered={wrap.offered}
            flats={wrap.flats}
            fallbackImage={flat ? { url: flat.url, alt: flat.alt } : null}
            formats={wrap.formats}
            allowedFormatCodes={product.wrapFormatCodes}
            initialAppliance={primary.key}
          />
        </div>
      </div>
    </div>
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
