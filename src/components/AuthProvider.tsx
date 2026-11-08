"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";

type AuthState = {
  session: Session | null;
  loading: boolean;
  /** Ensures a `customers` row exists for the current session, returns its id. */
  ensureCustomerId: () => Promise<string | null>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  ensureCustomerId: async () => null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const ensureCustomerId = async (): Promise<string | null> => {
    const uid = session?.user?.id;
    if (!uid) return null;
    // Reconciles the account into the central customer DB by both auth id and
    // email (server-side, SECURITY DEFINER) — merges an existing email-only
    // row rather than colliding with the unique-email index.
    const { data, error } = await supabaseBrowser.rpc("link_auth_customer");
    if (error) {
      console.error("ensureCustomerId failed:", error.message);
      return null;
    }
    return (data as string | null) ?? null;
  };

  return (
    <AuthContext.Provider value={{ session, loading, ensureCustomerId }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
