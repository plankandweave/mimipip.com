import Link from "next/link";
import { conceptShopUrl, getShopConcept } from "@/lib/shop-concepts";
import { DownloadPdfLink } from "./DownloadPdfLink";
import { BookBackLink } from "./BookBackLink";

/**
 * The book's only persistent chrome: the way back to the index, and the PDF.
 *
 * Sticky, because the PDF is the thing a reader most wants at the moment they
 * decide the study is any good — which is somewhere in the middle, not at the
 * top. Sending them back to the cover to find it loses most of them.
 *
 * Deliberately one appearance rather than two. The obvious design is a bar
 * that is transparent over the cover and takes a background once past it, but
 * that needs a scroll listener, and a bar whose legibility depends on
 * hydration is a bar that is invisible white-on-cream whenever hydration is
 * slow, blocked or broken. This one is readable as static HTML.
 */
export function BookTopBar({ slug, backHref = "/projects", backLabel = "Ideas & Projects", shopHref }: { slug: string; backHref?: string; backLabel?: string; shopHref?: string }) {
  return (
    <div
      className="book-no-print sticky top-0 z-40"
      style={{
        background: "var(--book-ground)",
        borderBottom: "1px solid var(--book-rule)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <BookBackLink href={backHref} label={backLabel} />
        <div className="flex flex-wrap items-center gap-2">
          {shopHref || getShopConcept(slug) ? (
            <a
              href={conceptShopUrl(slug)}
              className="inline-flex min-h-10 items-center rounded-full bg-[#176856] px-4 py-2 text-xs font-semibold text-white sm:text-sm"
            >
              {slug === "the-lives-within" ? "Choose your walls →" : "Buy this look →"}
            </a>
          ) : (
            <span className="text-xs font-semibold">
              Commissioned work · Not for sale
            </span>
          )}
          <Link
            href={`/projects/${slug}/create`}
            className="inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-xs font-semibold sm:text-sm"
          >
            Create a look for your space →
          </Link>
          <DownloadPdfLink slug={slug} />
        </div>
      </div>
    </div>
  );
}
