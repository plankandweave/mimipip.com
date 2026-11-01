
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/ProductCard";
import { OfficeCostEstimator } from "@/components/OfficeCostEstimator";
import { OfficeSpecActions, OfficeSpecTable } from "@/components/OfficeSpecTable";
import { JsonLd } from "@/components/JsonLd";
import { OFFICE_COLLECTION, WORKSPACES, getWorkspace } from "@/content/workspaces";
import { estimatorRates, getOfficeFinishes, getWorkspaceEdit } from "@/lib/office";
import { officeSpec } from "@/lib/office-spec";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

type Props = { params: Promise<{ space: string }> };

export function generateStaticParams() {
  return WORKSPACES.map((w) => ({ space: w.slug }));
}

 async function buildPageMetadata({ params }: Props): Promise<Metadata> {
  const { space } = await params;
  const w = getWorkspace(space);
  if (!w) return { title: "Not found" };
  return {
    title: w.seoTitle,
    description: w.standfirst,
    alternates: { canonical: `/office/${w.slug}` },
    openGraph: { title: `${w.seoTitle} · Zyvorah`, description: w.standfirst, url: `/office/${w.slug}` },
  };
}

/**
 * One workspace type: the designs, then the four things that actually go wrong
 * in this space, then the price, then the way out.
 *
 * The grid comes FIRST and the argument second — the opposite of /commercial,
 * and deliberately. Someone who arrived here searching "meeting room wallpaper"
 * wants to see whether we have anything for them before they read a word; the
 * considerations are what convert the ones who scroll.
 */
export default async function WorkspacePage({ params }: Props) {
  const { space } = await params;
  const w = getWorkspace(space);
  if (!w) notFound();

  const [edit, finishes] = await Promise.all([getWorkspaceEdit(w, 12), getOfficeFinishes()]);
  const spec = officeSpec({ finishes });
  const others = WORKSPACES.filter((o) => o.slug !== w.slug);

  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Office", item: `${SITE_URL}/office` },
            { "@type": "ListItem", position: 2, name: w.label, item: `${SITE_URL}/office/${w.slug}` },
          ],
        }}
      />

      <div className="mx-4 mt-4 rounded-[32px] bg-sky/40 lg:mx-6">
        <div className="container-x py-14">
          <Link href="/office" className="caps text-slate">
            ← Office wallpaper
          </Link>
          <h1 className="mt-4 max-w-3xl text-[clamp(2rem,4.5vw,3.2rem)] leading-tight">{w.title}</h1>
          <p className="mt-5 max-w-xl text-slate">{w.standfirst}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#designs" className="btn inline-flex h-12 px-6 text-[0.82rem]">
              See the designs
            </a>
            <Link href="/samples" className="btn btn-ghost inline-flex h-12 px-6 text-[0.82rem]">
              Order samples
            </Link>
          </div>
        </div>
      </div>

      <section id="designs" className="container-x py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <span className="caps text-slate">The edit</span>
            <h2 className="mt-3 text-2xl lg:text-3xl">Composed for this space.</h2>
            <p className="mt-3 text-slate">
              Every design is sized to your wall — these are the ones
              that hold up to what {w.label.toLowerCase()} ask of a wall.
            </p>
          </div>
          {edit.total > edit.cards.length && (
            <Link href={edit.allHref} className="btn btn-ghost text-sm">
              All {edit.total} designs for this space →
            </Link>
          )}
        </div>

        {edit.cards.length ? (
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {edit.cards.map((p) => (
              <ProductCard key={p.handle} product={p} />
            ))}
          </div>
        ) : (
          <p className="mt-8 rounded-[22px] bg-wash p-6 text-sm text-slate">
            This edit is being composed. In the meantime,{" "}
            <Link href={`/collections/${OFFICE_COLLECTION}`} className="link-underline">
              browse every office design
            </Link>{" "}
            or{" "}
            <Link href="/design-with" className="link-underline">
              tell us about the space
            </Link>{" "}
            and we&apos;ll shortlist for you.
          </p>
        )}
      </section>

      <section className="container-x pb-16">
        <div className="max-w-2xl">
          <span className="caps text-slate">What to watch for</span>
          <h2 className="mt-3 text-2xl lg:text-3xl">
            What goes wrong on this wall, and how we avoid it.
          </h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {w.considerations.map((c) => (
            <div key={c.t} className="rounded-[22px] bg-wash p-6">
              <p className="font-display text-lg font-bold">{c.t}</p>
              <p className="mt-2 text-sm text-slate">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x pb-16">
        <OfficeCostEstimator
          rates={estimatorRates(finishes)}
          initialWidthFt={w.typicalWall.widthFt}
          initialHeightFt={w.typicalWall.heightFt}
          wallLabel={w.typicalWall.label}
        />
      </section>

      <section className="container-x pb-16">
        <div className="max-w-2xl">
          <span className="caps text-slate">Specification</span>
          <h2 className="mt-3 text-2xl lg:text-3xl">Everything the fit-out will ask for.</h2>
        </div>
        <div className="mt-10">
          <OfficeSpecTable groups={spec} />
          <OfficeSpecActions />
        </div>
      </section>

      <section className="container-x pb-16">
        <h2 className="text-2xl lg:text-3xl">The rest of the floor</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((o) => (
            <Link
              key={o.slug}
              href={`/office/${o.slug}`}
              className="rounded-[22px] border border-edge p-5 transition-colors hover:border-charcoal"
            >
              <p className="font-display text-base font-bold">{o.label}</p>
              <p className="mt-1.5 text-sm text-slate">{o.tease}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-x pb-20">
        <div className="pastel-section bg-sage/40">
          <div className="max-w-xl">
            <h2 className="text-2xl lg:text-3xl">More than a few walls?</h2>
            <p className="mt-4 text-slate">
              Past roughly five walls it stops being a purchase and starts being a project —
              one visual language across the building, artwork built to measured elevations,
              colour-matched across every drop. Tell us about the spaces and we&apos;ll come
              back with an approach and a quotation.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/commercial#enquire" className="btn text-sm">
                Start a project
              </Link>
              <Link href="/trade" className="btn btn-ghost text-sm">
                Designers &amp; architects →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export const generateMetadata = withBrandMetadata(buildPageMetadata);
