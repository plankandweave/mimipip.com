import { isolatedStorageClient } from "@/brand/storage";
import { backendUrl, backendPublicKey, MIMIPIP_SCHEMA } from "@/brand/backend";
import "server-only";
import { serviceAvailable, requireService } from "../brand/services";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { currentPartnerMode } from "./partner-mode";

// Server-side view of the retail customer session.
//
// The gate this backs is a cost control, not a nicety: /api/concierge (Sonnet 5,
// up to 6 calls per message, vision), /api/curator (Sonnet 5 + Haiku vision,
// self-chaining) and /api/visual-search (Haiku vision) are all reachable by
// anyone with curl, and the codebase has no rate limiting anywhere. Client-side
// checks don't survive a terminal, so enforcement lives in the route handlers
// and reads the session from cookies via these helpers.

const url = backendUrl;
const anonKey = backendPublicKey;

/** Supabase client bound to the request cookie jar, for Server Components and
 *  route handlers. Cookie writes are no-ops in contexts that forbid them. */
export async function supabaseServerAuth() {
  if (!serviceAvailable("database")) requireService("database");
  const store = await cookies();
  return isolatedStorageClient(createServerClient(url(), anonKey(), {
    db: { schema: MIMIPIP_SCHEMA },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component render — refresh is handled by proxy.
        }
      },
    },
  }));
}

export type GatedUser = { id: string; email: string };

/**
 * The single source of truth for "is this caller allowed to spend our tokens".
 *
 * Requires a signed-in user with a CONFIRMED email address — signing in via
 * email OTP is itself the confirmation, so this is the "validated their email
 * ID" rule the storefront gate is built on.
 */
export async function getGatedUser(): Promise<GatedUser | null> {
  if (!serviceAvailable("database")) return null;
  const supabase = await supabaseServerAuth();
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (!error && user?.email && (user.email_confirmed_at || user.confirmed_at)) {
    return { id: user.id, email: user.email };
  }
  // A partner's person signed in through their portal has already proved
  // their work address — a HomeLane designer using the curator or the room
  // visualiser is exactly who these tools are for, and must not be asked to
  // make a second, retail account to use them. The id is namespaced so it can
  // never collide with an auth.users uuid where one is persisted.
  const partner = await currentPartnerMode();
  if (partner) return { id: `partner:${partner.slug}:${partner.email}`, email: partner.email };
  return null;
}

/** Stable body for a blocked call. The client detects `code` and opens the
 *  auth modal rather than showing a raw error. */
export const AUTH_REQUIRED_BODY = {
  error: "Please verify your email to use this feature.",
  code: "auth_required",
} as const;

/** Guard for route handlers: returns either the user or the 401 to return. */
export async function requireGatedUser(): Promise<
  { user: GatedUser; blocked: null } | { user: null; blocked: NextResponse }
> {
  const user = await getGatedUser();
  if (user) return { user, blocked: null };
  return { user: null, blocked: NextResponse.json(AUTH_REQUIRED_BODY, { status: 401 }) };
}

/**
 * Refreshes the auth cookies on a request passing through the proxy. Per the
 * Next 16 proxy docs this is deliberately NOT authorization — it only keeps the
 * session alive so route handlers and Server Components read a fresh token.
 */
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!serviceAvailable("database")) return response;

  // No auth cookie means there is no session to refresh — getUser() would just
  // burn a ~240ms Supabase round-trip per request, and crawlers (the bulk of
  // traffic) never carry one. @supabase/ssr names the cookie
  // sb-<project-ref>-auth-token, chunked as .0/.1 when large.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasAuthCookie) return response;

  const supabase = createServerClient(url(), anonKey(), {
    db: { schema: MIMIPIP_SCHEMA },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // Touching getUser() is what triggers the refresh-and-set-cookie cycle.
  await supabase.auth.getUser();
  return response;
}
