"use client";

// How a staff page reaches its data now that there is no admin key.
//
// Shape-compatible with the supabaseBrowser.rpc() calls it replaced — the same
// `{ data, error }` back — so the pages read the same, minus the key they used to
// have to pass. Authorisation rides on the Google sign-in: the staff session
// cookie goes with the request, and the server supplies the database key.

type RpcResult<T> = { data: T | null; error: { message: string } | null };

// One bounce per page load. If the sign-in itself is what is failing, a second
// redirect would only start a loop, and a visible error is more use than a
// spinning tab.
let bounced = false;

function signIn(): void {
  if (bounced || typeof window === "undefined") return;
  bounced = true;
  const next = window.location.pathname + window.location.search;
  window.location.href = `/admin/staff-session?next=${encodeURIComponent(next)}`;
}

async function post<T>(url: string, body: unknown): Promise<RpcResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "network error" } };
  }

  // The sign-in has lapsed. Send them back through Google rather than showing a
  // dead page with no way forward.
  if (res.status === 403) {
    signIn();
    return { data: null, error: { message: "unauthorized" } };
  }

  let payload: { data?: T; error?: string | null };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    return { data: null, error: { message: `HTTP ${res.status}` } };
  }
  if (payload.error) return { data: null, error: { message: payload.error } };
  return { data: (payload.data ?? null) as T | null, error: null };
}

/** Call an admin database function as the signed-in staff member. */
export function adminRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcResult<T>> {
  return post<T>("/api/admin/rpc", { fn, args });
}

/**
 * Establish the staff session cookie, and confirm who is signed in.
 *
 * Staff pages call this once on mount. On a page under /admin or /studio
 * Cloudflare Access has already done the work, so this is a single cheap
 * round trip that turns that into the cookie /api/* can verify.
 */
export async function ensureStaffSession(): Promise<{ email: string } | null> {
  try {
    const res = await fetch("/admin/staff-session", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as { email: string };
  } catch {
    return null;
  }
}

/** Where to send someone who is not signed in. */
export function staffSignInHref(next?: string): string {
  const target = next ?? (typeof window === "undefined" ? "/admin" : window.location.pathname);
  return `/admin/staff-session?next=${encodeURIComponent(target)}`;
}
