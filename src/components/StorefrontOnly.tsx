"use client";

import { useSyncExternalStore } from "react";

/**
 * Renders its children everywhere EXCEPT the casestudy.zyvorah.com outreach host,
 * where the shop does not exist and the header is stripped to just the wordmark.
 *
 * Client-side on purpose, exactly like BrandHomeLink. The host cannot be read
 * server-side here: the storefront homepage is ISR (revalidate = 3600) and the
 * /projects index is served to BOTH hosts from one cached render, so a
 * server-side host branch would either force those pages dynamic or cache one
 * host's chrome for the other.
 *
 * useSyncExternalStore gives the server snapshot (false → children) during SSR
 * and hydration, then the real host after mount — reconciling the two without a
 * setState inside an effect (which cascades renders) or a hydration mismatch. On
 * the outreach host that means a brief flicker of the shop chrome before it
 * unmounts, the same tradeoff BrandHomeLink documents.
 */
const CASE_STUDY_HOST = "casestudy.mimi-pip.invalid";

// The hostname is fixed for the life of the page, so there is nothing to
// subscribe to — the store never changes after the first client read.
const subscribe = () => () => {};
const onOutreachHost = () => window.location.hostname === CASE_STUDY_HOST;

export function StorefrontOnly({ children }: { children: React.ReactNode }) {
  const onOutreach = useSyncExternalStore(subscribe, onOutreachHost, () => false);
  if (onOutreach) return null;
  return <>{children}</>;
}
