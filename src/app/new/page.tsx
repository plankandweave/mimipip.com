
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { getJustInPage } from "@/lib/queries";
import { InfiniteGrid } from "@/components/InfiniteGrid";
import { BadgeIcon } from "@/components/BadgeIcon";
import { SITE_URL } from "@/lib/seo";

const PAGE_SIZE = 24;

// Static by default (frozen at build time) otherwise — this page exists
// specifically to reflect whatever published most recently, so it has to
// regenerate on a schedule rather than only on the next deploy.
export const revalidate = 3600;

const title = "New Wallpapers — Just In";
const description = "The newest designs to join the Zyvorah collection, fresh off the studio — each one made to your exact wall size.";

export const metadata: Metadata = brandMetadata({
  title,
  description,
  alternates: { canonical: "/new" },
  openGraph: { type: "website", title, description, url: `${SITE_URL}/new`, siteName: "Zyvorah" },
  twitter: { card: "summary_large_image", title, description },
});

export default async function NewArrivalsPage() {
  const { cards: products, total } = await getJustInPage(1, PAGE_SIZE);

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl text-center">
        <span className="caps flex items-center justify-center gap-1.5 text-slate">
          <BadgeIcon badgeKey="new" className="h-3.5 w-3.5" /> Fresh off the studio
        </span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-tight">New wallpapers.</h1>
        <p className="mt-4 text-slate">
          The newest designs to join the collection, in the order they went live — each one made
          to measure for your exact wall.
        </p>
      </div>

      {products.length > 0 ? (
        <InfiniteGrid
          initial={products}
          total={total}
          params={{ feed: "new" }}
          card="product"
          gridClassName="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4"
        />
      ) : (
        <p className="mt-12 text-center text-sm text-slate">
          Nothing published yet — check back soon, or{" "}
          <Link href="/collections/wall-art" className="underline underline-offset-2">explore the full collection</Link>.
        </p>
      )}

      <div className="mt-14 text-center">
        <Link href="/collections/wall-art" className="btn btn-ghost">Explore all wallpapers</Link>
      </div>
    </div>
  );
}
