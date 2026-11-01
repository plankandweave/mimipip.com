
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWrapCollection, getWrapFormats, getWrapProductsByTag } from "@/lib/wrap-queries";
import {
  APPLIANCES,
  APPLIANCE_KEYS,
  WRAP_HUB_HANDLE,
  wrapCollectionPath,
  type ApplianceKey,
} from "@/lib/appliances";
import { WRAP_COLLECTIONS } from "@/lib/wrap-collections";
import { WrapCard } from "@/components/WrapCard";
import { WrapsSubnav } from "@/components/WrapsSubnav";

/**
 * A wrap listing: an appliance's designs (fridge-wraps, ac-wraps …), one
 * aesthetic row (fridge-florals …) or the whole range (wraps), optionally
 * narrowed to one look with ?tag=.
 *
 * The retired fridge-wraps branch sent these to the store's /collections page,
 * which only worked because that app read the `wraps` schema. Here the store's
 * collection page reads the store's catalogue, so the range lists itself. Only
 * the range's own collections are served: the wraps schema also carries copies
 * of the store's wallpaper collections, and those are not wrap listings.
 */

export const revalidate = 3600;

/** The appliance a listing is ABOUT, or null for a row that spans the range. */
function applianceFor(handle: string): ApplianceKey | null {
  return APPLIANCE_KEYS.find((k) => APPLIANCES[k].collectionHandle === handle) ?? null;
}

function isWrapListing(handle: string): boolean {
  return (
    handle === WRAP_HUB_HANDLE ||
    applianceFor(handle) !== null ||
    WRAP_COLLECTIONS.some((c) => c.handle === handle)
  );
}

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ tag?: string | string[] }>;
};

/** Only a look the range actually has; anything else is ignored, not trusted. */
function lookFrom(tag: string | string[] | undefined): (typeof WRAP_COLLECTIONS)[number] | null {
  const t = Array.isArray(tag) ? tag[0] : tag;
  return WRAP_COLLECTIONS.find((c) => c.key === t) ?? null;
}

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  if (!isWrapListing(handle)) return { title: "Not found" };
  const collection = await getWrapCollection(handle);
  return {
    title: collection ? `${collection.title} | Zyvorah` : "Appliance Wraps | Zyvorah",
    alternates: { canonical: wrapCollectionPath(handle) },
  };
}

export default async function WrapCollectionPage({ params, searchParams }: Props) {
  const [{ handle }, sp] = await Promise.all([params, searchParams]);
  if (!isWrapListing(handle)) notFound();
  const collection = await getWrapCollection(handle);
  if (!collection) notFound();

  const appliance = applianceFor(handle);
  const look = lookFrom(sp.tag);
  const [designs, formats] = await Promise.all([
    getWrapProductsByTag(collection.ruleTag, 96, appliance ?? undefined),
    getWrapFormats().catch(() => []),
  ]);
  const shown = look ? designs.filter((d) => d.tags?.includes(look.key)) : designs;
  // An empty listing is a dead end the landing pages are written never to
  // offer; if one is reached anyway it is a 404, not a blank grid.
  if (!shown.length) notFound();

  const cfg = appliance ? APPLIANCES[appliance] : null;
  // Looks that hold at least one design in THIS listing, for the chips.
  const looks = WRAP_COLLECTIONS.filter((c) => designs.some((d) => d.tags?.includes(c.key)));

  return (
    <div>
      <WrapsSubnav
        current={cfg?.pickerGroup ?? null}
        trail={cfg ? [{ label: look ? look.label : "All designs" }] : undefined}
      />
      <section className="container-x py-10">
        <p className="caps text-slate">{cfg ? `${cfg.pickerGroupLabel} wraps` : "Appliance wraps"}</p>
        <h1 className="mt-2 text-[clamp(1.8rem,4vw,2.8rem)] leading-tight">
          {look ? look.label : collection.title}
        </h1>
        <p className="mt-2 text-sm text-slate">
          {shown.length} design{shown.length === 1 ? "" : "s"}
        </p>

        {cfg && looks.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={wrapCollectionPath(handle)}
              aria-current={!look ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${
                !look ? "border-charcoal bg-charcoal text-surface" : "border-edge bg-surface hover:border-charcoal"
              }`}
            >
              Everything
            </Link>
            {looks.map((l) => (
              <Link
                key={l.key}
                href={wrapCollectionPath(handle, l.key)}
                aria-current={look?.key === l.key ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${
                  look?.key === l.key
                    ? "border-charcoal bg-charcoal text-surface"
                    : "border-edge bg-surface hover:border-charcoal"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
          {shown.map((p) => (
            <WrapCard key={p.handle} product={p} formats={formats} appliance={appliance ?? "fridge"} />
          ))}
        </div>

        {cfg && (
          <p className="mt-14 text-sm text-mist">
            <Link href={cfg.landingPath} className="underline underline-offset-4">
              Back to {cfg.pickerGroupLabel} wraps
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
