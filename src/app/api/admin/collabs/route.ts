import { NextResponse } from "next/server";
import { requireStaff, notStaff } from "@/lib/staff-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseCollabFields, instagramHandle } from "@/lib/collab-admin";
import { suggestCode, suggestSlug } from "@/lib/collab-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The creator collaboration desk (/admin/collabs). Staff only.
 *
 *   GET                 → every collaboration, with its deliverables, clicks
 *                         and the order its code bought.
 *   GET ?id=<uuid>      → one, plus its traffic report (admin_collab_report).
 *   GET ?inquiry=<uuid> → a new collaboration prefilled from a pitch on the
 *                         Collabs tab (name, email, handle, city, followers).
 *   POST                → create. Code and link name are minted when not given.
 *   PATCH { id, … }     → edit. A redeemed code cannot be changed: the order
 *                         it bought carries it.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = NonNullable<ReturnType<typeof supabaseAdmin>>;

async function ordersById(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, unknown>();
  const { data } = await db
    .from("orders")
    .select("id, order_number, zvy, subtotal, discount, total, status, payment_status, access_token, created_at")
    .in("id", ids);
  return new Map((data ?? []).map((o: { id: string }) => [o.id, o]));
}

async function titlesFor(db: Db, handles: string[]) {
  if (!handles.length) return {} as Record<string, string>;
  const { data } = await db.from("products").select("handle, title").in("handle", handles);
  return Object.fromEntries((data ?? []).map((p: { handle: string; title: string }) => [p.handle, p.title]));
}

export async function GET(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const url = new URL(req.url);

  const inquiry = url.searchParams.get("inquiry");
  if (inquiry) {
    if (!UUID_RE.test(inquiry)) return NextResponse.json({ error: "Unknown pitch." }, { status: 400 });
    const { data: q } = await db
      .from("outreach_inquiries")
      .select("id, name, email, handle, links, fields")
      .eq("id", inquiry)
      .maybeSingle();
    if (!q) return NextResponse.json({ error: "Unknown pitch." }, { status: 404 });
    const row = q as { id: string; name: string; email: string; handle: string | null; links: string[] | null; fields: Record<string, unknown> | null };
    const followers = Number(String(row.fields?.followers ?? "").replace(/[^0-9]/g, "")) || null;
    const onInstagram = (row.fields?.platform ?? "instagram") === "instagram";
    const ig = onInstagram ? instagramHandle(row.handle) : null;
    return NextResponse.json(
      {
        prefill: {
          inquiry_id: row.id,
          name: row.name,
          email: row.email?.toLowerCase(),
          instagram: ig,
          city: typeof row.fields?.city === "string" ? row.fields.city : null,
          followers,
          other_links: (row.links ?? []).filter((l) => !/instagram\.com/i.test(l)),
          slug: suggestSlug(ig ?? row.name),
          code: suggestCode(row.name),
        },
      },
      { headers: NO_STORE },
    );
  }

  const id = url.searchParams.get("id");
  if (id) {
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Unknown collaboration." }, { status: 400 });
    const { data: c } = await db.from("collaborations").select("*").eq("id", id).maybeSingle();
    if (!c) return NextResponse.json({ error: "Unknown collaboration." }, { status: 404 });
    const collab = c as { order_id: string | null; allowed_handles: string[] | null; inquiry_id: string | null };
    const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 90, 1), 730);
    const [{ data: deliverables }, report, orders, titles, pitch] = await Promise.all([
      db.from("collaboration_deliverables").select("*").eq("collaboration_id", id).order("due_on", { ascending: true, nullsFirst: false }).order("created_at"),
      db.rpc("admin_collab_report", { p_collaboration_id: id, p_days: days }),
      ordersById(db, collab.order_id ? [collab.order_id] : []),
      titlesFor(db, collab.allowed_handles ?? []),
      collab.inquiry_id
        ? db.from("outreach_inquiries").select("reference, status, created_at").eq("id", collab.inquiry_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (report.error) console.error("admin_collab_report failed:", report.error.message);
    return NextResponse.json(
      {
        collaboration: c,
        deliverables: deliverables ?? [],
        report: report.data ?? null,
        order: collab.order_id ? orders.get(collab.order_id) ?? null : null,
        designTitles: titles,
        pitch: (pitch as { data: unknown }).data ?? null,
      },
      { headers: NO_STORE },
    );
  }

  const [{ data: rows, error }, { data: dels }, { data: clicks }] = await Promise.all([
    db.from("collaborations").select("*").order("created_at", { ascending: false }).limit(500),
    db.from("collaboration_deliverables").select("collaboration_id, kind, status, due_on, url, views"),
    db
      .from("collaboration_clicks")
      .select("collaboration_id")
      .eq("is_bot", false)
      .gte("created_at", new Date(Date.now() - 365 * 86400_000).toISOString())
      .limit(100000),
  ]);
  if (error) return NextResponse.json({ error: "Could not load collaborations." }, { status: 500 });
  const list = (rows ?? []) as { id: string; order_id: string | null }[];
  const orders = await ordersById(db, list.map((r) => r.order_id).filter((x): x is string => !!x));
  const clickCount = new Map<string, number>();
  for (const k of (clicks ?? []) as { collaboration_id: string }[]) clickCount.set(k.collaboration_id, (clickCount.get(k.collaboration_id) ?? 0) + 1);
  const delsBy = new Map<string, unknown[]>();
  for (const d of (dels ?? []) as { collaboration_id: string }[]) delsBy.set(d.collaboration_id, [...(delsBy.get(d.collaboration_id) ?? []), d]);
  return NextResponse.json(
    {
      collaborations: list.map((r) => ({
        ...r,
        deliverables: delsBy.get(r.id) ?? [],
        clicks: clickCount.get(r.id) ?? 0,
        order: r.order_id ? orders.get(r.order_id) ?? null : null,
      })),
    },
    { headers: NO_STORE },
  );
}

async function unknownHandles(db: Db, handles: string[] | null | undefined): Promise<string[]> {
  if (!handles?.length) return [];
  const { data } = await db.from("products").select("handle").in("handle", handles).eq("status", "active");
  const found = new Set((data ?? []).map((p: { handle: string }) => p.handle));
  return handles.filter((h) => !found.has(h));
}

function conflictMessage(message: string): string | null {
  if (/collaborations_code_key/.test(message)) return "That code is already in use — choose another.";
  if (/collaborations_slug_key/.test(message)) return "That link name is already in use — choose another.";
  return null;
}

export async function POST(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return notStaff();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Nothing was sent." }, { status: 400 });
  const parsed = parseCollabFields(body, false);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const f = parsed.value;
  const bad = await unknownHandles(db, f.allowed_handles);
  if (bad.length) return NextResponse.json({ error: `No live design with the handle ${bad.join(", ")}.` }, { status: 400 });

  // Mint what was not given; retry once on the vanishingly rare collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = {
      ...f,
      code: f.code ?? suggestCode(f.name!),
      slug: f.slug ?? `${suggestSlug(f.instagram ?? f.name!)}${attempt ? `-${attempt + 1}` : ""}`.slice(0, 40),
      created_by: staff.email,
    };
    const { data, error } = await db.from("collaborations").insert(row).select("id").single();
    if (!error) return NextResponse.json({ id: (data as { id: string }).id }, { headers: NO_STORE });
    const conflict = conflictMessage(error.message);
    if (!conflict) {
      console.error("collaboration create failed:", error.message);
      return NextResponse.json({ error: "Could not save the collaboration." }, { status: 500 });
    }
    if ((conflict.includes("code") && f.code) || (conflict.includes("link") && f.slug)) {
      return NextResponse.json({ error: conflict }, { status: 409 });
    }
  }
  return NextResponse.json({ error: "Could not mint a free code — please set one." }, { status: 409 });
}

export async function PATCH(req: Request) {
  if (!(await requireStaff(req))) return notStaff();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "The desk is unavailable." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Unknown collaboration." }, { status: 400 });
  const { id: _id, ...rest } = body!;
  void _id;
  const parsed = parseCollabFields(rest, true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const f = parsed.value;
  if (Object.keys(f).length === 0) return NextResponse.json({ ok: true });

  const { data: current } = await db.from("collaborations").select("code, order_id").eq("id", id).maybeSingle();
  if (!current) return NextResponse.json({ error: "Unknown collaboration." }, { status: 404 });
  const cur = current as { code: string; order_id: string | null };
  if (cur.order_id && ((f.code && f.code !== cur.code) || f.email || f.discount_pct != null || f.max_value_inr !== undefined || f.allowed_handles !== undefined)) {
    return NextResponse.json({ error: "This code has already bought its order — the offer can no longer change." }, { status: 409 });
  }
  const bad = await unknownHandles(db, f.allowed_handles);
  if (bad.length) return NextResponse.json({ error: `No live design with the handle ${bad.join(", ")}.` }, { status: 400 });

  const { error } = await db.from("collaborations").update(f).eq("id", id);
  if (error) {
    const conflict = conflictMessage(error.message);
    if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });
    console.error("collaboration update failed:", error.message);
    return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
