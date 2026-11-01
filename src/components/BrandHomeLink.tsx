"use client";
import { brand } from "@/brand/current";

import Link from "next/link";
import { useMemo } from "react";

/** On the casestudy.zyvorah.com outreach host the wordmark is the header's only
 *  control — the shop nav is stripped there (see StorefrontOnly) — so it must go
 *  to that site's own home: /projects, the case-study index its root redirects to.
 *  On the storefront it points at "/" as normal.
 *
 *  Read directly rather than via effect+setState: hostname is fixed for the life
 *  of the page, so there's nothing to resynchronize on and no render to save by
 *  deferring it. Falls back to "/" during SSR/hydration, where window is absent —
 *  the link briefly renders the storefront's own home before the client value
 *  resolves, which is correct everywhere except a first paint on the outreach
 *  host, where it self-corrects instantly. */
const CASE_STUDY_HOST = "casestudy.mimi-pip.invalid";
const OUTREACH_HOME = "/projects";

export function BrandHomeLink({
  className,
  onClick,
  children,
}: {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const href = useMemo(
    () => (typeof window !== "undefined" && window.location.hostname === CASE_STUDY_HOST ? OUTREACH_HOME : "/"),
    [],
  );

  return (
    <Link href={href} className={className} onClick={onClick} aria-label={`${brand.name} — home`}>
      {children}
    </Link>
  );
}
