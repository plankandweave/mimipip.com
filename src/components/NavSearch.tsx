"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { ProductCardData } from "@/lib/types";
import { ProductCard } from "@/components/ProductCard";

/**
 * Inline nav-bar search. Clicking the icon expands a text input right in the
 * header; pressing Enter fetches matches from /api/search and drops the results
 * into a panel anchored under the header — no navigation, the page never moves.
 */
export function NavSearch() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductCardData[] | null>(null);
  const [total, setTotal] = useState(0);
  // The query the results answer when the typed one was corrected ("piano"
  // for "paino"), so the panel can say which word it searched.
  const [corrected, setCorrected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // How tall the results panel may grow: its top edge to the viewport bottom.
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  // Picking a design closes the search. The header outlives a client-side
  // navigation, so the panel used to stay open over the page the shopper had
  // just chosen — the product loaded behind the results with only a sliver of
  // it showing at the bottom of the screen (Roheena, 12 October 2026). Close
  // on any link clicked inside the panel (this also covers picking the design
  // whose page is already open, where the path does not change) and on any
  // change of path.
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Focus the field the moment it opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on Escape or a click outside the search (its input + results panel).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  // Size the results panel to the bottom of what the shopper can SEE. It used to
  // stop at 72vh, which sliced the third row of cards through the middle and let
  // the page underneath (on a product page, the wall builder's measure step)
  // show through below the cut — it read as the builder sitting on top of the
  // results (Roheena, 5 October 2026). Now the only edge the grid scrolls past
  // is the edge of the visible screen. The top is measured rather than assumed
  // because the header is sticky: at the top of the page the shipping strip
  // sits above the bar, and once the page has scrolled it does not.
  //
  // "Visible" is the VISUAL viewport, not window.innerHeight. A phone keyboard
  // covers the bottom of the page without shrinking the layout viewport, so a
  // panel sized to innerHeight ran down behind the keys and its last row could
  // not be scrolled clear of them (8 October 2026). The visual viewport is what
  // the keyboard and the browser's collapsing address bar actually change, and
  // it fires its own resize/scroll events for both.
  const panelShown = open && (loading || results !== null);
  useEffect(() => {
    if (!panelShown) return;
    const vv = window.visualViewport;
    function measure() {
      const el = panelRef.current;
      if (!el) return;
      // Bottom edge of the visible area, in the same client coordinates as the
      // panel's own top. offsetTop is non-zero when the keyboard has pushed the
      // visual viewport down the page.
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      setPanelHeight(Math.max(160, Math.round(visibleBottom - el.getBoundingClientRect().top)));
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [panelShown]);

  async function runSearch() {
    const term = value.trim();
    setQuery(term);
    // On a touch screen the keyboard has done its job once the search is sent:
    // put it away so the results get the whole screen. Tapping the field brings
    // it back for the next search. A mouse user keeps their cursor in the field.
    if (term && window.matchMedia("(pointer: coarse)").matches) inputRef.current?.blur();
    if (!term) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      setResults((data.results ?? []) as ProductCardData[]);
      setTotal(Number(data.total ?? data.results?.length ?? 0));
      setCorrected(typeof data.corrected === "string" ? data.corrected : null);
    } catch {
      setResults([]);
      setCorrected(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={rootRef} className="flex items-center">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        // relative z-10: on a phone the open field reaches left over the
        // centred wordmark, which is absolutely positioned and would otherwise
        // paint on top of it. Only the form — the results panel below must
        // keep anchoring to the header row, not to this wrapper.
        className={`relative z-10 overflow-hidden transition-[width,opacity] duration-300 ${
          open ? "w-40 opacity-100 sm:w-56" : "w-0 opacity-0"
        }`}
      >
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch();
            }
          }}
          placeholder="Search designs…"
          aria-label="Search designs"
          className="h-10 w-full rounded-full border border-line bg-white px-4 text-sm outline-none placeholder:text-slate"
        />
      </form>

      <button
        type="button"
        aria-label={open ? "Close search" : "Search"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-charcoal transition-colors hover:bg-wash"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
        )}
      </button>

      {panelShown && (
        // Opaque, not frosted: on a product page the translucent panel let the
        // page underneath ghost through the results (its title behind the
        // count line, the wall builder behind the cards).
        <div
          ref={panelRef}
          onClick={(e) => {
            // Not the wishlist heart (a button inside the card's link that
            // cancels the navigation), and not a click opening a new tab.
            const t = e.target as HTMLElement;
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || t.closest("button")) return;
            if (t.closest("a")) setOpen(false);
          }}
          className="absolute inset-x-0 top-full z-50 border-b border-edge bg-cloud shadow-sm"
        >
          {/* A ceiling, not a height: a short list stays short, a long one
              runs to the screen edge. 72vh covers the first paint only, before
              the measurement lands. */}
          <div
            className={`container-x overflow-y-auto overscroll-contain py-6 ${panelHeight === null ? "max-h-[72vh]" : ""}`}
            style={panelHeight !== null ? { maxHeight: panelHeight } : undefined}
          >
            {loading ? (
              <p className="text-sm text-slate">Searching…</p>
            ) : results && results.length > 0 ? (
              <>
                <p className="mb-4 text-sm text-slate">
                  {total} {total === 1 ? "design" : "designs"} for “{corrected ?? query}”
                  {corrected && <> · no designs matched “{query}”, so these are for “{corrected}”</>}
                </p>
                {total > results.length && (
                  <a className="mb-4 inline-block text-sm underline" href={`/search?q=${encodeURIComponent(query)}`}>View all {total} designs</a>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
                  {results.map((p) => (
                    <ProductCard key={p.handle} product={p} />
                  ))}
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-slate">No designs matched “{query}”.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
