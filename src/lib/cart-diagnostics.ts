import "server-only";
import { supabaseAdmin } from "./supabase-admin";

/** Diagnostic ledger only. No email, personalisation, or conversion is sent. */
export async function recordCartFailure(input: {
  stage: "cart_add_rpc" | "cart_read_after_add";
  handle: string;
  databaseCode?: string;
}): Promise<void> {
  try {
    const db = supabaseAdmin();
    if (!db) return;
    const { error } = await db.rpc("log_checkout_failure", {
      p_stage: input.stage,
      // Codes and catalogue handles only; no raw request, cookie or SQL error.
      p_detail: input.databaseCode?.slice(0, 20) ?? "unavailable",
      p_meta: { product_handle: input.handle.slice(0, 120), diagnostic: "cart" },
    });
    if (error) console.error("[cart-diagnostics] write failed:", error.code);
  } catch {
    console.error("[cart-diagnostics] write unavailable");
  }
}
