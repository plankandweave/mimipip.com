import {catalogue,card} from "@/brand/review/data";

import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { searchProducts } from "@/lib/queries";
import { ProductCard } from "@/components/ProductCard";
import { SearchBar } from "@/components/SearchBar";
import { isKidsQuery, LORANGE_FAMILY_LINE, LORANGE_NAME, LORANGE_PATH } from "@/lib/lorange-kids";

// Internal search results — noindex (kept out of the sitemap and robots), but a
// real page so the WebSite SearchAction target resolves.
export const metadata: Metadata = brandMetadata({
  title: "Search",
  robots: { index: false, follow: true },
  alternates: { canonical: "/search" },
});

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page: pageParam = "1" } = await searchParams;
  const page = Math.max(1, Math.min(100, Number.parseInt(pageParam, 10) || 1));
  const pageSize = 60;
  const query = q.trim();
  const { results, corrected, total } = query
    ? process.env.MIMIPIP_LOCAL_REVIEW==="1" ? (()=>{const hits=catalogue.filter(p=>(p.name+" "+p.description).toLowerCase().includes(query.toLowerCase()));return {results:hits.slice((page-1)*pageSize,page*pageSize).map(card),total:hits.length,corrected:null};})() : await searchProducts(query, pageSize, (page - 1) * pageSize)
    : { results: [], corrected: null, total: 0 };
  const pageHref = (next: number) => `/search?q=${encodeURIComponent(query)}&page=${next}`;
  // A corrected search ("paino" → "piano") is answered under the word it
  // meant, and says so, so the shopper can see what was searched.
  const shown = corrected ?? query;

  return (
    <div className="container-x py-12">
      <span className="caps text-slate">Search</span>
      <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-tight">
        {query ? `Results for “${shown}”` : "Search wallpaper"}
      </h1>

      <SearchBar initialQuery={query} />

      {query && (
        <p className="mt-2 text-sm text-slate">
          {total} {total === 1 ? "design" : "designs"} · Page {page}
          {corrected && results.length > 0 && <> · showing results for “{corrected}”, as no designs matched “{query}”</>}
        </p>
      )}

      {/* A parent searching for a child's room is shown the sister brand's
          shop first; Zyvorah's own matching designs still follow below. */}
      {process.env.MIMIPIP_LOCAL_REVIEW!=="1" && query && isKidsQuery(query) && (
        <Link
          href={LORANGE_PATH}
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e9e2d7] bg-[#fcfaf5] px-5 py-4 text-[#302b26] hover:border-[#b45d36]"
        >
          <span>
            <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#934728]">{LORANGE_FAMILY_LINE}</span>
            <span className="mt-1 block text-lg">Shop nurseries &amp; children’s rooms at {LORANGE_NAME}</span>
          </span>
          <span className="text-sm font-semibold text-[#934728]">Visit the shop →</span>
        </Link>
      )}

      {query && results.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-slate">No designs matched “{query}”.</p>
          <Link href="/collections/wall-art" className="btn mt-5 inline-flex h-11 px-6 text-[0.8rem]">
            Browse all wallpaper
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4">
            {results.map((p) => <ProductCard key={p.handle} product={p} />)}
          </div>
          {total > pageSize && (
            <nav aria-label="Search result pages" className="mt-12 flex items-center justify-center gap-5 text-sm">
              {page > 1 && <Link className="btn px-5 py-3" href={pageHref(page - 1)}>Previous</Link>}
              <span>Page {page} of {Math.ceil(total / pageSize)}</span>
              {page * pageSize < total && <Link className="btn px-5 py-3" href={pageHref(page + 1)}>Next</Link>}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
