import { receiverMobile } from "@/lib/receiver-mobile";
import { NextResponse } from "next/server";
import { resolvePincode } from "@/lib/pincode-resolver";
import {
  canAdministerAccount, currentCorporateSession, recordAudit,
} from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { StoreRow } from "@/lib/measure-link";
import { tier1OnlyPartner, tier1Problem } from "@/lib/tier1-cities";
import { partnerWorkflow } from "@/lib/ai-keys";

export const dynamic = "force-dynamic";

/**
 * The partner's own list of places.
 *
 * A store is a PHYSICAL PLACE — an address, a contact, a standing creative
 * brief — and it is not the same fact as a state's GSTIN, which is why 0101
 * split the two apart. Everything downstream reads the dispatch address off
 * the store, so this list is what stops Bhosari's wallpaper going to
 * Prabhadevi.
 *
 * Reading is open to the whole account (knowing which showrooms exist is not
 * privileged inside the company). Writing is admin-only, because the address
 * saved here is the address a pallet is sent to.
 *
 * `code` is generated once from the name and then frozen: a survey minted six
 * months ago still has to point at the same store.
 */

const CODE_MAX = 40;

function codeFrom(name: string): string {
  return name.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, CODE_MAX) || "store";
}

/** First free suffix. Two showrooms genuinely can share a name in different
 *  cities, and the admin should not have to invent a handle to get past it. */
async function freeCode(accountId: string, base: string): Promise<string> {
  const sb = supabaseAdmin();
  if (!sb) return base;
  const { data } = await sb.from("corporate_stores")
    .select("code").eq("account_id", accountId).like("code", `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.code as string));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`.slice(0, CODE_MAX);
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, CODE_MAX);
}

export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data, error } = await sb.from("corporate_stores")
    .select("*").eq("account_id", session.account.id).eq("active", true)
    .order("state").order("name");
  if (error) {
    console.error("[corporate/stores] list failed:", error.message);
    return NextResponse.json({ error: "Could not load your stores." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    stores: (data ?? []) as StoreRow[],
    can: { admin: canAdministerAccount(session) },
    you: session.email,
  });
}

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  if (!canAdministerAccount(session)) {
    return NextResponse.json({
      error: "Only an account admin can add or change a store.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let b: {
    action?: string; id?: string;
    name?: string; state?: string; city?: string; addressLine?: string; pincode?: string;
    contactName?: string; contactPhone?: string; gps?: string; floors?: number;
    seriesNames?: string[]; notes?: string;
  };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const text = (v: unknown, max: number) => {
    const s = String(v ?? "").trim();
    return s ? s.slice(0, max) : null;
  };

  // ── Deactivate ───────────────────────────────────────────────────────────
  // Never deleted: past surveys and past orders point at this row, and a
  // vanished store would take their address with it.
  if (b.action === "deactivate") {
    const id = String(b.id ?? "");
    const { data: gone } = await sb.from("corporate_stores")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id).eq("account_id", session.account.id)
      .select("id, name").maybeSingle();
    if (!gone) return NextResponse.json({ error: "That store isn't on your account." }, { status: 404 });
    await recordAudit(session, "store.deactivate", { type: "store", id }, { name: gone.name });
    return NextResponse.json({ ok: true, deactivated: true });
  }

  const name = text(b.name, 160);
  const state = text(b.state, 80);
  if (!name) return NextResponse.json({ error: "Give the store a name — 'Pune Bhosari'." }, { status: 400 });
  if (!state) return NextResponse.json({ error: "Which state is it in? The GSTIN is resolved from that." }, { status: 400 });
  // HomeLane's programme is metros only: the form offers a dropdown of the
  // seven tier-1 cities, and this is the same rule applied where it cannot be
  // bypassed. The state is checked against the city because the GSTIN hangs
  // off it (src/lib/tier1-cities.ts).
  if (tier1OnlyPartner(session.account.slug)) {
    const problem = tier1Problem(b.city, state);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  // The courier needs a mobile to ring at the store (founder, 14 October 2026);
  // Vijay Sales may leave it blank, its parcels go to the one receiver the OS knows.
  const mobile = receiverMobile(session.account.slug, b.contactPhone);
  if (!mobile.ok) return NextResponse.json({ error: mobile.error }, { status: 400 });

  const floors = Number.isFinite(Number(b.floors)) && Number(b.floors) > 0
    ? Math.min(20, Math.round(Number(b.floors))) : null;
  // No PIN typed → look it up from the store's name and address (Google /
  // India Post via pincode-resolver.ts). The courier is booked on this
  // number, and a store saved without one used to block every order to it.
  let pincode = text(b.pincode, 12);
  if (!pincode) {
    const found = await resolvePincode({ name, address: text(b.addressLine, 400), city: text(b.city, 120), state }, { workflow: partnerWorkflow(session.account.slug) });
    if (found) pincode = found.pincode;
  }
  const patch = {
    name, state,
    city: text(b.city, 120),
    address_line: text(b.addressLine, 400),
    pincode,
    contact_name: text(b.contactName, 120),
    contact_phone: mobile.value,
    gps: text(b.gps, 120),
    floors,
    series_names: (b.seriesNames ?? []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 8),
    notes: text(b.notes, 2000),
    updated_at: new Date().toISOString(),
  };

  // ── Update ───────────────────────────────────────────────────────────────
  // `code` is deliberately absent from the patch. It is the stable handle.
  if (b.id) {
    const { data: saved, error } = await sb.from("corporate_stores")
      .update(patch).eq("id", b.id).eq("account_id", session.account.id)
      .select("*").maybeSingle();
    if (error || !saved) {
      console.error("[corporate/stores] update failed:", error?.message);
      return NextResponse.json({ error: "Could not save that store." }, { status: error ? 500 : 404 });
    }
    await recordAudit(session, "store.update", { type: "store", id: b.id }, { name });
    return NextResponse.json({ ok: true, store: saved as StoreRow });
  }

  // ── Create ───────────────────────────────────────────────────────────────
  const code = await freeCode(session.account.id, codeFrom(name));
  const { data: created, error } = await sb.from("corporate_stores").insert({
    account_id: session.account.id, code, ...patch,
    created_by_email: session.email,
  }).select("*").single();
  if (error || !created) {
    console.error("[corporate/stores] create failed:", error?.message);
    return NextResponse.json({ error: "Could not add that store." }, { status: 500 });
  }

  await recordAudit(session, "store.create",
    { type: "store", id: (created as StoreRow).id }, { name, code, state });
  return NextResponse.json({ ok: true, store: created as StoreRow });
}
