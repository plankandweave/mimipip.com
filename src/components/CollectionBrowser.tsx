import Link from "next/link";
import { InfiniteGrid } from "@/components/InfiniteGrid";
import type { ProductCardData } from "@/lib/types";
import type { MeasurementType } from "@/lib/card-copy";
import type { Sort, FacetOption } from "@/lib/queries";
import { MAX_FILTER_TAGS } from "@/lib/facet-crawler";

export type FacetGroup = { key: "colour" | "mood" | "style" | "subject" | "room"; label: string; options: (FacetOption & { count: number })[] };

const KIND_LABEL: Record<string, string> = {
  room: "Rooms",
  category: "Styles",
  color: "Colours",
  curated: "Collections",
  other: "Browse",
};

// Where "All rooms" / "All styles" leads: the index page for the kind.
const KIND_INDEX: Record<string, string> = {
  room: "/rooms",
  category: "/styles",
  color: "/colours",
  curated: "/collections",
};

function chipLabel(title: string): string {
  return title.replace(/\s*wallpapers?$/i, "").replace(/['’]\s*$/, "").trim() || title;
}

// Newest leads because it is the default — see parseSort in the collection page.
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "featured", label: "Curated" },
];

type State = { sort: Sort; tags: string[]; signature: boolean; newOnly: boolean; childSafe: boolean; page: number };

/** Build a collection URL from a full filter state, omitting defaults. */
function href(handle: string, s: State): string {
  const qs = new URLSearchParams();
  if (s.sort !== "newest") qs.set("sort", s.sort);
  for (const t of s.tags) qs.append("tag", t);
  if (s.signature) qs.set("signature", "1");
  if (s.newOnly) qs.set("new", "1");
  if (s.childSafe) qs.set("child", "1");
  if (s.page > 1) qs.set("page", String(s.page));
  const q = qs.toString();
  return `/collections/${handle}${q ? `?${q}` : ""}`;
}

export function CollectionBrowser({
  products,
  siblings,
  currentHandle,
  kind,
  facetGroups,
  selectedTags,
  signature,
  newOnly,
  childSafe,
  flagsAvailable,
  sort,
  page,
  total,
  pageSize,
  family,
  pinnedRow = null,
}: {
  products: ProductCardData[];
  siblings: { handle: string; title: string }[];
  currentHandle: string;
  kind: string;
  facetGroups: FacetGroup[];
  selectedTags: string[];
  signature: boolean;
  newOnly: boolean;
  childSafe: boolean;
  flagsAvailable: { signature: boolean; new: boolean; child: boolean };
  sort: Sort;
  page: number;
  total: number;
  pageSize: number;
  /** The product family this listing belongs to; null = wallpaper. */
  family?: MeasurementType | null;
  /** A row pinned ABOVE the grid, outside its sort, filters and paging — the
   *  Trending pins (src/lib/trending-pins.ts). Rendered as given; the page
   *  decides whether there is one. */
  pinnedRow?: React.ReactNode;
}) {
  const label = KIND_LABEL[kind] ?? KIND_LABEL.other;
  // A border is a horizontal repeat, so its listing is a stack of full-width
  // running strips — one per design — not a grid of square crops.
  const stripLayout = family === "length";
  const base: State = { sort, tags: selectedTags, signature, newOnly, childSafe, page: 1 };
  const anyActive = selectedTags.length > 0 || signature || newOnly || childSafe;

  const toggleTag = (t: string): State => ({
    ...base,
    tags: selectedTags.includes(t) ? selectedTags.filter((x) => x !== t) : [...selectedTags, t],
  });

  return (
    <>
      {/* current collection + link to its kind's index, and sort. */}
      {/* Sits exactly under the header, which publishes its live height (0
          while it is scrolled away on a phone) — see ScrollHeader. The old
          fixed 7.25rem left this bar half under the taller phone header. */}
      <div className="sticky top-[var(--header-offset,7.25rem)] z-30 transition-[top] duration-300 border-b border-edge bg-cloud/90 backdrop-blur-md">
        <div className="container-x flex flex-col gap-2 py-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
          <div className="no-scrollbar -mx-4 flex flex-1 items-center gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
            {siblings.length > 1 && (
              <span className="order-first mr-1 shrink-0 text-[0.72rem] font-semibold uppercase tracking-wide text-mist">{label}</span>
            )}
            {/* The current collection is already chosen, so the rail shows only
                that chip and a link to the kind's index — never the full wall
                of every sibling on a page where one is already selected. */}
            {siblings
              .filter((s) => s.handle === currentHandle)
              .map((s) => (
                <Link
                  key={s.handle}
                  href={`/collections/${s.handle}`}
                  prefetch={false}
                  aria-current="page"
                  className="shrink-0 whitespace-nowrap rounded-[12px] border border-charcoal bg-charcoal px-4 py-1.5 text-[0.72rem] font-semibold text-surface transition-colors"
                >
                  {chipLabel(s.title)}
                </Link>
              ))}
            {siblings.length > 1 && KIND_INDEX[kind] && (
              <Link
                href={KIND_INDEX[kind]}
                prefetch={false}
                className="shrink-0 whitespace-nowrap rounded-[12px] border border-edge px-4 py-1.5 text-[0.72rem] font-semibold text-slate transition-colors hover:border-charcoal hover:text-charcoal"
              >
                All {label.toLowerCase()} →
              </Link>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[0.72rem] font-semibold text-slate">
            <span className="text-mist">Sort</span>
            {SORTS.map((s) => (
              <Link
                key={s.value}
                href={href(currentHandle, { ...base, sort: s.value })}
                aria-current={s.value === sort ? "true" : undefined}
                className={`rounded-[12px] border px-3 py-1.5 transition-colors ${
                  s.value === sort ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal hover:text-charcoal"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <section className="container-x py-6 lg:py-10">
        {/* One line on a phone — the designs are what the page is for, and
            this box sat between the shopper and the first of them. */}
        {family !== "fixed" && family !== "length" && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[14px] bg-sky/40 px-4 py-2.5 lg:mb-6 lg:rounded-[18px] lg:px-5 lg:py-4">
            <div>
              <p className="font-display text-sm font-semibold text-charcoal lg:text-base">Too many designs?</p>
              <p className="mt-1 hidden text-xs text-slate lg:block">Tell us your wall size and budget. See a short list priced for your wall.</p>
            </div>
            <Link href="/design-with" className="text-sm font-semibold text-charcoal underline underline-offset-4">Find my wallpaper →</Link>
          </div>
        )}
        {/* filters */}
        {/* On a phone the filter box folds to one line unless a filter is
            on (6 October 2026): open, its four facets and three flag chips
            held the first design off the first screen. A <details> rather
            than a toggle so it needs no script; from lg up it is always open
            and the summary is hidden. */}
        {(facetGroups.length > 0 || flagsAvailable.signature || flagsAvailable.new) && (() => {
          const body = (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="hidden text-[0.72rem] font-semibold uppercase tracking-wide text-mist lg:inline">Filter</span>

              {facetGroups.map((g) => {
                const selectedInGroup = g.options.filter((o) => selectedTags.includes(o.tag)).length;
                return (
                  <details key={g.key} open={selectedInGroup > 0} className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-charcoal">
                      {g.label}
                      {selectedInGroup > 0 && (
                        <span className="rounded-full bg-charcoal px-1.5 text-[0.62rem] font-bold text-surface">{selectedInGroup}</span>
                      )}
                      <span className="text-mist transition-transform group-open:rotate-180">▾</span>
                    </summary>
                    <div className="mt-2 flex max-w-2xl flex-wrap gap-1.5">
                      {g.options.map((o) => {
                        const on = selectedTags.includes(o.tag);
                        // At the stack limit a further tag is not offered: the
                        // edge sends deeper URLs to the bare collection
                        // (src/lib/facet-crawler.ts), and four ANDed tags is
                        // already a narrow grid. A selected tag stays a link so
                        // it can be removed.
                        if (!on && selectedTags.length >= MAX_FILTER_TAGS) {
                          return (
                            <span
                              key={o.tag}
                              aria-disabled="true"
                              title={`Up to ${MAX_FILTER_TAGS} filters at a time`}
                              className="cursor-not-allowed rounded-[10px] border border-edge px-2.5 py-1 text-xs font-medium text-mist opacity-60"
                            >
                              {o.label} <span className="text-mist">{o.count}</span>
                            </span>
                          );
                        }
                        return (
                          <Link
                            key={o.tag}
                            href={href(currentHandle, toggleTag(o.tag))}
                            className={`rounded-[10px] border px-2.5 py-1 text-xs font-medium transition-colors ${
                              on ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal hover:text-charcoal"
                            }`}
                          >
                            {o.label} <span className={on ? "text-surface/60" : "text-mist"}>{o.count}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </details>
                );
              })}

              {/* editorial + audience flag toggles */}
              <div className="flex flex-wrap items-center gap-1.5">
                {flagsAvailable.signature && (
                  <Link
                    href={href(currentHandle, { ...base, signature: !signature })}
                    className={`rounded-[10px] border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      signature ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal hover:text-charcoal"
                    }`}
                  >
                    ✦ Signature
                  </Link>
                )}
                {flagsAvailable.new && (
                  <Link
                    href={href(currentHandle, { ...base, newOnly: !newOnly })}
                    className={`rounded-[10px] border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      newOnly ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal hover:text-charcoal"
                    }`}
                  >
                    New
                  </Link>
                )}
                {flagsAvailable.child && (
                  <Link
                    href={href(currentHandle, { ...base, childSafe: !childSafe })}
                    className={`rounded-[10px] border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      childSafe ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-charcoal hover:text-charcoal"
                    }`}
                  >
                    Suitable for children
                  </Link>
                )}
              </div>

              {anyActive && (
                <Link href={href(currentHandle, { sort, tags: [], signature: false, newOnly: false, childSafe: false, page: 1 })} className="text-xs font-semibold text-slate underline underline-offset-2 hover:text-charcoal">
                  Clear filters
                </Link>
              )}
            </div>
          );
          return (
            <>
              {/* Phones: folded to one line unless a filter is on — a closed
                  <details> hides its contents whatever CSS says, so the
                  desktop box is its own element rather than a styled state. */}
              <details open={anyActive || undefined} className="group/filters mb-4 rounded-[14px] border border-edge bg-wash/60 p-3 lg:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-charcoal">
                  <span>Filter{anyActive ? " · on" : ""}</span>
                  <span aria-hidden className="text-mist transition-transform group-open/filters:rotate-180">▾</span>
                </summary>
                <div className="mt-3">{body}</div>
              </details>
              <div className="mb-8 hidden rounded-[18px] border border-edge bg-wash/60 p-4 lg:block">{body}</div>
            </>
          );
        })()}

        {/* The pinned row sits between the filters and the grid, and stays
            put when the filters change — it is a shortcut, not a result. */}
        {pinnedRow && <div className="mb-6 lg:mb-10">{pinnedRow}</div>}

        {total === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate">
              {anyActive ? "No designs match these filters." : "No products in this collection yet."}
            </p>
            {anyActive && (
              <Link href={href(currentHandle, { sort, tags: [], signature: false, newOnly: false, childSafe: false, page: 1 })} className="btn mt-5 inline-flex h-11 px-6 text-[0.8rem]">
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <>
            <p className="mb-6 text-xs text-slate">
              {total} {total === 1 ? "design" : "designs"}
            </p>
            <InfiniteGrid
              key={href(currentHandle, { ...base, page })}
              initial={products}
              total={total}
              startPage={page}
              params={{
                collection: currentHandle,
                sort: sort !== "newest" ? sort : undefined,
                tag: selectedTags,
                signature,
                new: newOnly,
                child: childSafe,
              }}
              card={stripLayout ? "border" : "collection"}
              gridClassName={stripLayout ? "grid grid-cols-1 gap-y-12" : "grid grid-cols-2 gap-x-4 gap-y-12 lg:grid-cols-4"}
            />
            {total > pageSize && (
              <nav aria-label="Collection pages" className="mt-8 flex items-center justify-center gap-6 text-sm">
                {page > 1 && <Link prefetch={false} rel="prev" className="underline underline-offset-4" href={href(currentHandle, { ...base, page: page - 1 })}>Previous page</Link>}
                <span>Page {page} of {Math.ceil(total / pageSize)}</span>
                {page * pageSize < total && <Link prefetch={false} rel="next" className="underline underline-offset-4" href={href(currentHandle, { ...base, page: page + 1 })}>Next page</Link>}
              </nav>
            )}
          </>
        )}
      </section>
    </>
  );
}
