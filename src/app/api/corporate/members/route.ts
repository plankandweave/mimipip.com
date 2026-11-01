import { NextResponse } from "next/server";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import {
  can, canManageMembers, currentCorporateSession, isAccountAdmin, normaliseEmail,
  recordAudit, type CorporateMember,
} from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * The partner runs their own access.
 *
 * Vijay Sales asked to stop waiting on us to let a colleague in, so their
 * admins add and remove people themselves. We are not in that loop at all —
 * there is no request, no approval, no email to hello@.
 *
 * Two hard rules the admins cannot talk their way past:
 *
 *   · the address must be on the account's OWN email domain. An admin adding
 *     someone's personal Gmail would hand a stranger the company's artwork and
 *     the ability to spend its money, and "the admin meant to" is not a
 *     defence we could offer afterwards.
 *   · an account cannot be left with no admins. Demoting the last one locks
 *     the company out of its own access list and puts us back in the loop we
 *     just removed.
 */

const ROLES = new Set(["admin", "member"]);

export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  // Everyone on the account may SEE the team — knowing who can order on the
  // company's behalf is not privileged information inside that company.
  const { data, error } = await sb.from("corporate_members")
    .select("*").eq("account_id", session.account.id).eq("active", true)
    .order("role").order("email");
  if (error) {
    console.error("[corporate/members] list failed:", error.message);
    return NextResponse.json({ error: "Could not load the team." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    members: (data ?? []) as CorporateMember[],
    you: session.email,
    emailDomain: session.account.email_domain,
    can: {
      upload: can(session, "upload"),
      build: can(session, "build"),
      order: can(session, "order"),
      admin: isAccountAdmin(session),
    },
  });
}

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const privatePurchasing = partnerCapabilities(session.account).poRequiredRelease;
  if (privatePurchasing && session.staff) {
    return NextResponse.json({ error: "The partner's own admins manage purchasing access." }, { status: 403 });
  }
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  if (!canManageMembers(session)) {
    return NextResponse.json({
      error: "Only an account admin can change who has access.",
    }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let body: {
    action?: string; email?: string; role?: string; name?: string;
    can_upload?: boolean; can_build?: boolean; can_order?: boolean;
    notify_dispatch?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  for (const key of ["can_upload", "can_build", "can_order", "notify_dispatch"] as const) {
    if (body[key] !== undefined && typeof body[key] !== "boolean") {
      return NextResponse.json({ error: `Invalid permission: ${key}` }, { status: 400 });
    }
  }

  const email = normaliseEmail(String(body.email ?? ""));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid work email address." }, { status: 400 });
  }

  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (domain !== session.account.email_domain.trim().toLowerCase()) {
    return NextResponse.json({
      error: `Only @${session.account.email_domain} addresses can be given access.`,
    }, { status: 400 });
  }

  const { data: existing } = await sb.from("corporate_members")
    .select("*").eq("account_id", session.account.id).eq("email", email).maybeSingle();
  const current = (existing as CorporateMember | null) ?? null;

  // ── Revoke ───────────────────────────────────────────────────────────────
  if (body.action === "revoke") {
    if (!current || !current.active) return NextResponse.json({ ok: true, revoked: true });
    if (email === session.email) {
      return NextResponse.json({ error: "You can't remove your own access." }, { status: 400 });
    }
    if (current.role === "admin" && (await activeAdminCount(session.account.id)) <= 1) {
      return NextResponse.json({ error: "That's the last admin — promote someone else first." }, { status: 400 });
    }
    const { error } = await sb.from("corporate_members")
      .update({ active: false, updated_at: new Date().toISOString() }).eq("id", current.id);
    if (error) return NextResponse.json({ error: "Could not remove that person." }, { status: 500 });

    await recordAudit(session, "member.revoke", { type: "member", id: current.id }, { email });
    return NextResponse.json({ ok: true, revoked: true });
  }

  // ── Grant / update ───────────────────────────────────────────────────────
  const role = ROLES.has(String(body.role)) ? String(body.role) : (current?.role ?? "member");
  const perms = {
    can_upload: body.can_upload ?? current?.can_upload ?? true,
    can_build: body.can_build ?? current?.can_build ?? true,
    // Legacy admins retain their existing default. Private purchasing is
    // explicitly assigned separately from managing access.
    can_order: body.can_order ?? current?.can_order ?? (!privatePurchasing && role === "admin"),
  };
  if (privatePurchasing && email === session.email && perms.can_order && !current?.can_order) {
    return NextResponse.json({ error: "Another partner admin must assign your purchasing permission." }, { status: 403 });
  }
  // The person's name (how a dispatch email greets them — without it the OS
  // falls back to a plain "Hello"), and whether they are told about every
  // shipment on the account. 0111.
  const name = body.name !== undefined
    ? (String(body.name).trim().slice(0, 80) || null)
    : (current?.name ?? null);
  const notifyDispatch = body.notify_dispatch ?? current?.notify_dispatch ?? false;

  if (current?.role === "admin" && role !== "admin" && (await activeAdminCount(session.account.id)) <= 1) {
    return NextResponse.json({ error: "That's the last admin — promote someone else first." }, { status: 400 });
  }

  const row = {
    account_id: session.account.id,
    email,
    role,
    ...perms,
    name,
    notify_dispatch: notifyDispatch,
    active: true,
    updated_at: new Date().toISOString(),
    ...(current ? {} : { invited_by_email: session.email }),
  };

  const { data: saved, error } = current
    ? await sb.from("corporate_members").update(row).eq("id", current.id).select("*").single()
    : await sb.from("corporate_members").insert(row).select("*").single();
  if (error || !saved) {
    console.error("[corporate/members] save failed:", error?.message);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }

  const isNew = !current || !current.active;
  await recordAudit(session, isNew ? "member.grant" : "member.update",
    { type: "member", id: (saved as CorporateMember).id }, { email, role, ...perms, name, notify_dispatch: notifyDispatch });

  // Tell the person they're in. Otherwise the grant is invisible until someone
  // thinks to mention it over WhatsApp, which is the thing we're replacing.
  if (isNew) {
    const allowed = [
      perms.can_upload ? "add designs to the library" : null,
      perms.can_build ? "prepare orders" : null,
      perms.can_order ? "place orders" : null,
    ].filter(Boolean);
    void sendEmail({
      to: email,
      subject: `You have access to the ${session.account.name} print portal`,
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px">
        <p style="font-size:15px;color:#0f172a">${session.email} has given you access to the ${session.account.name} print portal.</p>
        <p style="font-size:14px;color:#334155">You can ${allowed.length ? allowed.join(", ") : "browse the design library"}${role === "admin" ? ", and give access to colleagues" : ""}.</p>
        <p style="font-size:14px;color:#334155">Sign in with this email address — we'll send a 6-digit code to your inbox:</p>
        <p style="margin:18px 0"><a href="https://zyvorah.com/partners/${session.account.slug}" style="background:#0f172a;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Open the portal</a></p>
        <p style="font-size:12px;color:#94a3b8;margin-top:22px">Zyvorah · made-to-order wallpaper</p>
      </div>`,
    });
  }

  return NextResponse.json({ ok: true, member: saved });
}

async function activeAdminCount(accountId: string): Promise<number> {
  const sb = supabaseAdmin();
  if (!sb) return 0;
  const { count } = await sb.from("corporate_members")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId).eq("active", true).eq("role", "admin");
  return count ?? 0;
}
