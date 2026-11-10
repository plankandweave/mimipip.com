"use client";

import Link from "next/link";
import { usePartner } from "@/components/PartnerProvider";
import { CartNavIcon } from "@/components/CartNavIcon";
import { useAuth } from "@/components/AuthProvider";

/**
 * The header's cart slot. A retail visitor gets the cart; a partner's person
 * gets their account instead — a badge naming the account, linking back to
 * the portal where saved walls and procurement live. There is no cart for
 * them to open: a designer never buys here (src/lib/partner-mode.ts).
 *
 * Until the session answer arrives the cart renders as before, so the
 * hydrated first paint matches the server's.
 */
export function CartOrPartnerIcon() {
  const { partner } = usePartner();
  const { session } = useAuth();
  const websiteEmail = session?.user?.email;
  const email = partner?.email ?? websiteEmail;
  if (!email) return <CartNavIcon />;
  const person = email.split("@")[0].split(/[._-]/)[0];
  const name = person ? person[0].toUpperCase() + person.slice(1) : email;
  if (!partner) return (
    <Link href="/account" title={`Signed in to MimiPip as ${email}`} className="header-account-badge flex h-9 shrink-0 items-center gap-2 rounded-full border border-edge bg-surface px-3 text-[0.72rem] font-semibold text-charcoal hover:bg-wash">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-charcoal text-[0.6rem] text-surface">{name[0]}</span>
      <span className="header-account-label">{name}</span>
    </Link>
  );
  const label =
    partner.role === "purchaser" ? "Procurement" : partner.role === "staff" ? "Staff" : "Designer";
  return (
    <Link
      href={`${partner.home}/projects`}
      title={`Signed in as ${partner.email} through ${partner.name} (${label})${websiteEmail ? `; retail account ${websiteEmail}` : ""}`}
      className="header-account-badge ml-1 flex h-9 shrink-0 items-center gap-2 rounded-full border border-edge bg-surface px-3 text-[0.72rem] font-semibold leading-none text-charcoal transition-colors hover:bg-wash"
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-charcoal text-[0.6rem] text-surface">
        {name[0]}
      </span>
      <span className="header-account-label">{name}</span>
    </Link>
  );
}
