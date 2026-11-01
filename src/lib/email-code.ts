import type { EventContext } from "./concierge-events";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * The email one-time-code sign-in, shared by the sign-in modal and the
 * concierge's email step so there is exactly one way an address is proved.
 * The code arriving in the inbox is the proof: once it verifies, Supabase
 * marks the address confirmed and getGatedUser (server) accepts the caller.
 */

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type CodeRequestResult =
  | { ok: true }
  | { ok: false; error: string; portal?: string; accountName?: string };

/** Emails a one-time code to `email` (POST /api/auth/request-code). */
export async function requestEmailCode(email: string, concierge?: EventContext): Promise<CodeRequestResult> {
  try {
    const res = await fetch("/api/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ...(concierge ? { concierge } : {}) }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as
      | { error?: string; code?: string; portal?: string; accountName?: string }
      | null;
    return {
      ok: false,
      error: body?.error ?? "Couldn't send your code. Please try again.",
      ...(body?.code === "partner_domain" && body.portal ? { portal: body.portal, accountName: body.accountName } : {}),
    };
  } catch {
    return { ok: false, error: "Couldn't send your code. Please try again." };
  }
}

/** Verifies the emailed code. True once the address is proved and the
 *  browser holds a signed-in session. */
export async function verifyEmailCode(email: string, token: string): Promise<boolean> {
  // A code from generateLink({ type: "magiclink" }) verifies as either type
  // depending on the Supabase version — try the common one, then the other.
  let { error } = await supabaseBrowser.auth.verifyOtp({ email, token, type: "email" });
  if (error) ({ error } = await supabaseBrowser.auth.verifyOtp({ email, token, type: "magiclink" }));
  return !error;
}
