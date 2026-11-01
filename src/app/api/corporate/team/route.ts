import { NextResponse } from "next/server";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import {
  canManageMembers, currentCorporateSession, isAccountAdmin, recordAudit,
} from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { toIndianMobile } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * Who can walk this portfolio's buildings.
 *
 * A separate door from /api/corporate/members, and it has to be: that route
 * requires an address on the account's OWN email domain, and a portfolio
 * account's domain is a non-resolvable '.invalid' placeholder precisely because
 * its people are reached on a handset rather than at a company inbox. Nobody has
 * an address on it, so nobody could ever be added through that route.
 *
 * So: an admin adds a colleague by MOBILE NUMBER, which is the same thing they
 * sign in with. That is the whole delegation story — the first contact can hand
 * the work to whoever is actually going to walk the building, without us.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT GRANT.
 *
 *   · can_order stays FALSE, always. Adding somebody to walk a lobby must never
 *     be a way to hand out the right to spend money, and an admin doing the one
 *     should not have to know they are not doing the other.
 *   · role stays 'member'. Only we make another admin, because admin is the
 *     right to hand out access itself.
 */

/** corporate_members.email is NOT NULL and is the audit trail's handle for a
 *  person, but a phone-first member may genuinely have no address. A synthetic
 *  one keeps the column honest and unambiguous, follows the '.invalid' pattern
 *  migration 0116 established, and can never collide with a real inbox or be
 *  matched by the domain fallback in accountForEmail(). Replaced by hand if we
 *  ever learn their real address; nothing about the phone door depends on it. */
const placeholderEmail = (slug: string, mobile: string) => `${mobile}@${slug}.invalid`;

/** '98765 43210' — shown back so an admin can check they typed the right one.
 *  Not masked: these are colleagues the reader has just invited, inside their
 *  own company, and hiding the number would only make a typo unfindable. */
const pretty = (m: string | null) => (m ? `${m.slice(0, 5)} ${m.slice(5)}` : "");

export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  // Only the columns this screen shows. Deliberately NOT `select("*")` — the
  // member row also carries the spending permissions, and a list of colleagues
  // has no business shipping those to the browser.
  type Row = {
    id: string; name: string | null; email: string;
    phone: string | null; role: "admin" | "member";
  };
  const { data } = await sb.from("corporate_members")
    .select("id, name, email, phone, role")
    .eq("account_id", session.account.id).eq("active", true)
    .order("created_at");

  const members = ((data ?? []) as Row[]).map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    phone: m.phone,
    phoneLabel: pretty(m.phone),
    // So the list can say "you" rather than making somebody work out which row
    // is theirs before removing the wrong one.
    isYou: m.email === session.email,
  }));

  return NextResponse.json({
    ok: true,
    members,
    can: { manage: canManageMembers(session), admin: isAccountAdmin(session) },
  });
}

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) {
    return NextResponse.json({ error: "Manage verified work-email members from the team access screen." }, { status: 403 });
  }
  if (!canManageMembers(session)) {
    return NextResponse.json({
      error: "Only an account admin can give someone access.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let b: { action?: string; id?: string; name?: string; phone?: string };
  try { b = await req.json(); } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // ── Revoke ───────────────────────────────────────────────────────────────
  // Deactivated, never deleted: the audit trail names this person against
  // everything they captured, and a vanished row would orphan all of it.
  if (b.action === "revoke") {
    const id = String(b.id ?? "");
    const { data: gone } = await sb.from("corporate_members")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", id).eq("account_id", session.account.id)
      .select("id, name, email").maybeSingle();
    if (!gone) return NextResponse.json({ error: "That person isn't on your account." }, { status: 404 });
    if (gone.email === session.email) {
      // Undo it: an admin removing themselves locks the account's own people out
      // of managing it, and there may be no other admin to let them back in.
      await sb.from("corporate_members").update({ active: true }).eq("id", id);
      return NextResponse.json({
        error: "You can't remove your own access. Ask us if you need to hand it over.",
      }, { status: 409 });
    }
    await recordAudit(session, "team.revoke", { type: "member", id }, { name: gone.name });
    return NextResponse.json({ ok: true, revoked: id });
  }

  // ── Add ──────────────────────────────────────────────────────────────────
  const name = String(b.name ?? "").trim().slice(0, 120);
  const mobile = toIndianMobile(b.phone);
  if (!name) return NextResponse.json({ error: "Add their name." }, { status: 400 });
  if (!mobile) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }

  // The phone index is GLOBAL among active members, so a number already in use
  // anywhere would fail with a constraint error. Checked first so the answer is
  // a sentence rather than a violation — and scoped-aware, because "already on
  // your team" and "in use elsewhere" need different answers.
  const { data: clash } = await sb.from("corporate_members")
    .select("id, account_id, name").eq("phone", mobile).eq("active", true).maybeSingle();
  if (clash) {
    return NextResponse.json({
      error: clash.account_id === session.account.id
        ? `${clash.name ?? "That number"} already has access.`
        : "That number is already set up on another account. Use a different one, or contact us.",
    }, { status: 409 });
  }

  const email = placeholderEmail(session.account.slug, mobile);
  const { data: created, error } = await sb.from("corporate_members").insert({
    account_id: session.account.id,
    email,
    name,
    phone: mobile,
    role: "member",
    can_upload: true,
    can_build: true,
    // Never granted here. See the note at the top.
    can_order: false,
    invited_by_email: session.email,
    active: true,
  }).select("id").maybeSingle();

  if (error || !created) {
    console.error("[corporate/team] add failed:", error?.message);
    return NextResponse.json({ error: "Could not give them access." }, { status: 500 });
  }

  await recordAudit(session, "team.add", { type: "member", id: created.id as string },
    { name, phone: mobile });

  return NextResponse.json({
    ok: true,
    member: { id: created.id as string, name, phone: mobile, phoneLabel: pretty(mobile), role: "member", isYou: false },
  });
}
