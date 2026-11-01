"use client";

import { createContext, useContext, useEffect, useState } from "react";

// The storefront's view of a partner session (see src/lib/partner-mode.ts).
// Fetched once per page load from /api/corporate/session because the pages
// themselves are cached and shared — the chrome and the buttons branch here,
// the server-rendered page never does.
export type PartnerMode = {
  slug: string;
  name: string;
  email: string;
  role: "designer" | "purchaser" | "staff";
  home: string;
  canBuild: boolean;
};

type State = { partner: PartnerMode | null; loading: boolean };

const PartnerContext = createContext<State>({ partner: null, loading: true });

export function PartnerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ partner: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/corporate/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((mode: PartnerMode | null) => {
        if (!cancelled) setState({ partner: mode, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ partner: null, loading: false });
      });
    return () => { cancelled = true; };
  }, []);

  return <PartnerContext.Provider value={state}>{children}</PartnerContext.Provider>;
}

export function usePartner() {
  return useContext(PartnerContext);
}
