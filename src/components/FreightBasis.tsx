"use client";

import { useEffect, useState } from "react";

// WHO PAYS THE COURIER, on the customer-facing side of the site.
//
// We prepay freight on retail e-commerce deliveries alone; for a reseller or a
// corporate account it is to-pay, always — the consignee settles it with the
// courier on delivery (Roheena 2026-08-12, restated 2026-09-02). The OS derives
// the basis that actually books the docket from the order's channel; everything
// here is wording, so that a dealer is never promised free shipping we were
// never going to honour at the door.
//
// WHY CLIENT-SIDE AND CACHED. The banner sits in the global header, so asking
// this question on the server would put an account lookup on every page render
// for every anonymous visitor — the shape of spend that has bitten this project
// before. Instead: one fetch per browser session, cached in sessionStorage, and
// retail wording renders immediately while it resolves.

// Versioned: v2 (11 October 2026) drops the answers cached while a staff
// portal sign-in still counted as a trade account.
const KEY = "zyv_freight_to_pay_v2";

/** Retail (false) until proven otherwise — a retail customer must never be
 *  shown a freight charge that isn't theirs because a lookup was slow. */
export function useFreightToPay(): boolean {
  const [toPay, setToPay] = useState(false);

  useEffect(() => {
    let live = true;

    try {
      const cached = sessionStorage.getItem(KEY);
      if (cached !== null) {
        if (cached === "1") setToPay(true);
        return;
      }
    } catch {
      /* private mode — fall through and just ask */
    }

    void (async () => {
      try {
        const r = await fetch("/api/account/freight", { cache: "no-store" });
        const j = (await r.json()) as { toPay?: boolean };
        const answer = j.toPay === true;
        try {
          sessionStorage.setItem(KEY, answer ? "1" : "0");
        } catch {
          /* not cacheable here; one fetch per page is still fine */
        }
        if (live && answer) setToPay(true);
      } catch {
        /* retail wording stands */
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  return toPay;
}

/** Worldwide reach is separate from the shopper's selected destination. */
export function ShippingBannerText() {
  const toPay = useFreightToPay();
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <strong>We deliver worldwide</strong>
      <span className="text-charcoal/70">India · USA · UAE · Australia · Canada · Europe &amp; more</span>
      {toPay && <span>· Freight to-pay on your account</span>}
    </span>
  );
}

/** Appended to static shipping copy (product page accordion) — renders nothing
 *  at all for a retail customer, so the marketing copy is untouched for them
 *  and the page stays statically rendered. */
export function FreightToPayNote({ className = "" }: { className?: string }) {
  const toPay = useFreightToPay();
  if (!toPay) return null;
  return (
    <p className={className}>
      Freight on your account is to-pay: the free-shipping line above applies to
      retail orders. Your order ships without a prepaid courier charge and the
      consignee settles freight with the courier on delivery. Express, where
      chosen, still speeds up printing and handover and is billed as usual.
    </p>
  );
}
