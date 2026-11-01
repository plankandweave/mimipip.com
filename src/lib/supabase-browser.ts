"use client";

import { requireService, serviceAvailable } from "../brand/services";
import { createBrowserClient } from "@supabase/ssr";

// Session-persisting client for client components (auth, boards). Backed by
// COOKIES, not localStorage, so the server can see the session too: every
// token-spending API route (concierge, curator, visual-search, segment-room)
// gates on it, and a localStorage session is invisible to a route handler.
// Separate from src/lib/supabase.ts (persistSession: false), which is used from
// Server Components for anonymous catalogue reads.
//
// Created LAZILY on first use — the SSR copy of this module is evaluated during
// Cloudflare's deploy-time validation, where no env exists, and an eager
// createBrowserClient(process.env...) fails the deploy at global scope.
const make = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Keep returning shoppers signed in and renew short-lived access tokens.
      // Browser data removal, explicit sign-out and revocation still end a session.
      auth: { persistSession: true, autoRefreshToken: true },
      cookieOptions: { path: "/", sameSite: "lax", maxAge: 400 * 24 * 60 * 60 },
    },
  );
type Browser = ReturnType<typeof make>;
let cached: Browser | null = null;

function client(): Browser {
  if (!serviceAvailable("database")) requireService("database");
  cached ??= make();
  return cached;
}

export const supabaseBrowser: Browser = new Proxy({} as Browser, {
  get(_target, prop) {
    const c = client() as unknown as Record<PropertyKey, unknown>;
    const value = c[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(c) : value;
  },
});
