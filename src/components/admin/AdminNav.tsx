"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The one row of desk links every /admin page wears, rendered once by
// src/app/admin/layout.tsx. It used to live only on the order pipeline, so
// opening a desk (AID Partners, say) stranded you there with a lone "Orders"
// link. A new admin page gets this row for free — add its link here, never a
// hand-rolled row of its own.
//
// Colours are the Navagraha families: one family base per department, the
// current desk tinted ~15% behind its own colour.
//
// WHAT BELONGS HERE (Roheena, 1 October 2026): only the desks that are about
// the website itself and the demand it generates — selling, enquiries,
// partners, marketing, the catalogue. Everything that happens after an order
// exists (production, installers, quality, procurement, finance) is the
// Magnitude OS's (os.magnitudegroup.in), the system of record; this site is
// one showroom among its channels. Operational desks do not get a link here,
// however convenient — a second queue on this side is how two sources of truth
// start.
//
// Already moved, and redirecting from their old paths:
//   Agreements → OS /documents          (src/app/admin/documents/route.ts)
//   Suppliers  → OS /approvals + /supplier portal (src/app/admin/vendors/route.ts)
//   Royalties  → OS /royalties           (src/app/admin/royalties/route.ts)
//   Installers → OS /installer-applications (src/app/admin/installers/route.ts)
//   Quality    → OS /storefront-quality  (src/app/admin/quality/route.ts)
//   Commissions→ OS /design-commissions  (src/app/admin/concepts/route.ts)
//
// The public intakes those desks review — /become-an-installer, the order
// page's quality claim, the concept brief form — stay on this site: they are
// the website's job. Only the staff screens moved.

type Desk = { href: string; label: string };
type Group = { name: string; color: string; tint: string; desks: Desk[] };

const GROUPS: Group[] = [
  {
    name: "Sales",
    color: "#C2185B", // Shukra · Rani Pink
    tint: "rgba(194,24,91,0.12)",
    desks: [
      { href: "/admin", label: "Pipeline" },
      { href: "/admin/orders", label: "All orders" },
      { href: "/admin/enquiries", label: "Website enquiries" },
      { href: "/admin/conversion-diagnostics", label: "Conversion diagnostics" },
      { href: "/admin/trade", label: "AID Partners" },
      { href: "/admin/contacts", label: "Trade contacts" },
      { href: "/admin/partner-features", label: "Partner features" },
      { href: "/admin/marketing", label: "Marketing" },
      { href: "/admin/marketing?tab=collabs", label: "Collabs & press" },
      { href: "/admin/collabs", label: "Creator collaborations" },
    ],
  },
  {
    name: "Design",
    color: "#00875A", // Budha · Jade
    tint: "rgba(0,135,90,0.12)",
    desks: [
      { href: "/admin/designs", label: "Add a design" },
      { href: "/admin/prism", label: "Prism · campus projects" },
      { href: "/admin/timbre", label: "Timbre · house voice" },
      { href: "/admin/sonar", label: "Sonar · talking walls" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.desks.map((d) => d.href));

/** The desk a path belongs to: the longest href it sits under ("/admin" only exactly). */
function currentDesk(path: string): string | null {
  let best: string | null = null;
  for (const href of ALL) {
    const hit = href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/");
    if (hit && (!best || href.length > best.length)) best = href;
  }
  return best;
}

export function AdminNav() {
  const path = (usePathname() ?? "").replace(/\/+$/, "") || "/";
  const active = currentDesk(path);

  return (
    <nav aria-label="Admin desks" className="border-b border-edge bg-surface">
      <div className="container-x flex gap-x-6 gap-y-2 overflow-x-auto py-3 lg:flex-wrap">
        {GROUPS.map((g) => (
          <div key={g.name} className="flex shrink-0 items-center gap-1.5">
            <span
              className="mr-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em]"
              style={{ color: g.color }}
            >
              {g.name}
            </span>
            {g.desks.map((d) => {
              const on = d.href === active;
              return (
                <Link
                  key={d.href}
                  href={d.href}
                  aria-current={on ? "page" : undefined}
                  className="whitespace-nowrap rounded-full px-3 py-1 text-xs transition-colors"
                  style={{
                    color: g.color,
                    background: on ? g.tint : "transparent",
                    border: `1px solid ${on ? g.color : "transparent"}`,
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  {d.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
