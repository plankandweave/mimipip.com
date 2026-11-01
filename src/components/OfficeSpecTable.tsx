import Link from "next/link";
import type { SpecGroup } from "@/lib/office-spec";
import { MarketMoney, MarketPricingNote } from "@/components/MarketMoney";

/**
 * The specification block, rendered for reading on a phone and for scanning on
 * a desk. Two columns on desktop because a specifier reads down the left; a
 * stacked pair on mobile because a two-column table at 375 px is unreadable.
 */
export function OfficeSpecTable({ groups }: { groups: SpecGroup[] }) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      {groups.map((g) => (
        <section key={g.heading}>
          <h3 className="font-display text-lg font-bold">{g.heading}</h3>
          <dl className="mt-4 divide-y divide-edge border-t border-edge">
            {g.rows.map((r) => (
              <div key={r.k} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <dt className="text-sm font-semibold text-charcoal">{r.k}</dt>
                <dd className="text-sm text-slate">
                  {r.rateInr != null ? (
                    <>
                      <MarketMoney inr={r.rateInr} /> / sq ft
                      <MarketPricingNote india=", inclusive of GST" international=", international delivery included" />
                      {r.rateSuffix ? ` · ${r.rateSuffix}` : null}
                    </>
                  ) : (
                    r.v
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/**
 * The "take this away with you" pair that always sits under the table.
 *
 * `sheetHref` defaults to the office route; the hospitality section passes its
 * own (/hospitality/spec-sheet) so this stays the one component both sections
 * render rather than two near-identical copies.
 */
export function OfficeSpecActions({ sheetHref = "/office/spec-sheet" }: { sheetHref?: string }) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {/* A route handler streaming a PDF, not a page — Link would prefetch an
          RSC payload that does not exist and hijack the navigation. */}
      <a href={sheetHref} className="btn text-sm">
        Download the spec sheet (PDF)
      </a>
      <Link href="/samples" className="btn btn-ghost text-sm">
        Order design samples
      </Link>
      <Link href="/materials" className="btn btn-ghost text-sm">
        All materials →
      </Link>
    </div>
  );
}
