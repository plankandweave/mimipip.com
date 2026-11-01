import { partnerCapabilities } from "@/lib/partner-capabilities";
import { legacyPartnerWorkflowAllowed } from "@/lib/partner-legacy-policy";
import { NextResponse } from "next/server";
import { canAdministerAccount, currentCorporateSession, isAccountAdmin, wallSizeRejection } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { internalTokenOk } from "@/lib/site-batch";
import { caUpload } from "@/lib/corporate-art-store";
import { orderOrigin, wallsStillOpen, type WallScope } from "@/lib/site-batch-rules";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET → every survey on the account, newest first: the board an HQ admin opens
// when a store employee's "ready to release" email lands.
//
// Deliberately thin. The heavy per-batch serialiser (design codes, composed
// artwork, signed previews) lives on /api/corporate/site-batch/[id]; a list of
// forty surveys does not need to sign four hundred URLs to tell you which one
// is waiting on you.
export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const { data, error } = await sb.from("corporate_site_batches")
    .select("id, title, status, created_at, state, ship_city, source, source_ref, created_by, received_from, released_at, released_by_email, store_id, error")
    .eq("account_id", session.account.id)
    .order("created_at", { ascending: false }).limit(100);
  if (error) {
    console.error("[site-batch] list failed:", error.message);
    return NextResponse.json({ error: "Could not load your surveys." }, { status: 500 });
  }
  const batches = data ?? [];

  // Wall counts in one grouped read rather than one query per batch.
  const ids = batches.map((b) => b.id as string);
  const { data: walls } = ids.length
    ? await sb.from("corporate_site_batch_walls")
        .select("batch_id, seq, status, suggested, width_mm, height_mm, photo_path").in("batch_id", ids)
    : { data: [] };
  const tally = new Map<string, { walls: number; sqft: number; noPhoto: number }>();
  const byBatch = new Map<string, WallScope[]>();
  for (const w of walls ?? []) {
    const id = w.batch_id as string;
    const t = tally.get(id) ?? { walls: 0, sqft: 0, noPhoto: 0 };
    byBatch.set(id, [...(byBatch.get(id) ?? []), w as unknown as WallScope]);
    t.walls += 1;
    t.sqft += ((w.width_mm as number) / 304.8) * ((w.height_mm as number) / 304.8);
    if (!w.photo_path) t.noPhoto += 1;
    tally.set(id, t);
  }

  const storeIds = [...new Set(batches.map((b) => b.store_id as string | null).filter(Boolean))] as string[];
  const { data: stores } = storeIds.length
    ? await sb.from("corporate_stores").select("id, name").in("id", storeIds)
    : { data: [] };
  const storeName = new Map((stores ?? []).map((s) => [s.id as string, s.name as string]));

  return NextResponse.json({
    ok: true,
    can: { admin: canAdministerAccount(session) },
    batches: batches.map((b) => {
      const t = tally.get(b.id as string) ?? { walls: 0, sqft: 0, noPhoto: 0 };
      return {
        id: b.id, title: b.title, status: b.status,
        createdAt: b.created_at,
        state: b.state, city: b.ship_city,
        source: b.source, sourceRef: b.source_ref,
        origin: orderOrigin(b),
        storeName: b.store_id ? storeName.get(b.store_id as string) ?? null : null,
        releasedAt: b.released_at, releasedBy: b.released_by_email,
        error: b.error,
        walls: t.walls, sqft: Math.round(t.sqft), wallsWithoutPhoto: t.noPhoto,
        // The one thing the page is really asking: is this waiting on a human?
        awaitingRelease: b.status === "collecting" && !b.released_at && t.walls > 0,
        // The client's own walls still to approve on a proposal — what the
        // dashboard's "Waiting on you" strip leads with. Suggestions are
        // offers and never hold a store open (site-batch-rules).
        awaitingApproval: b.status === "proposed"
          ? wallsStillOpen(byBatch.get(b.id as string) ?? []).length : 0,
      };
    }),
  });
}

// POST → create a site batch: the measured walls of one store, photos included,
// awaiting allocation. Called by the OS (Wallpaper Calculator export) with the
// shared token, or by an account admin. Photos arrive as base64 JPEGs and are
// stored beside the artwork so signed previews work the same way everywhere.
export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let accountId: string | null = null;
  let createdBy = "os-bridge";
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  if (internalTokenOk(req)) {
    const slug = String(b.accountSlug ?? "").trim();
    const { data: acc } = await sb.from("corporate_accounts").select("*").eq("slug", slug).single();
    if (!acc) return NextResponse.json({ error: `No account “${slug}”` }, { status: 404 });
    if (!legacyPartnerWorkflowAllowed(acc)) return NextResponse.json({ error: "Use the private customer workspace." }, { status: 403 });
    accountId = acc.id as string;
    createdBy = String(b.createdBy ?? "os-bridge").slice(0, 120);
  } else {
    const session = await currentCorporateSession();
    // Account admins run their own store, and OUR OWN STAFF run the pipeline
    // they built — `can()` has always granted staff everything, but this gate
    // asked isAccountAdmin, which is member?.role and therefore NULL for
    // staff. That locked Zyvorah out of allocate/compose on every account
    // (live 401, 19 Aug 2026). Client sign-off (approve) and the client's own
    // member list stay account-admin only.
    if (!session || (!isAccountAdmin(session) && !session.staff)) {
      return NextResponse.json({ error: "Not authorised" }, { status: 401 });
    }
    if (!legacyPartnerWorkflowAllowed(session.account)) return NextResponse.json({ error: "Use the private customer workspace." }, { status: 403 });
    accountId = session.account.id;
    createdBy = session.email;
  }

  const walls = Array.isArray(b.walls) ? b.walls as Record<string, unknown>[] : [];
  if (walls.length < 1 || walls.length > 40) {
    return NextResponse.json({ error: "A batch carries 1–40 walls." }, { status: 400 });
  }

  // Validate EVERY wall before writing ANYTHING. This route is not
  // transactional — a failure part-way through the insert loop used to leave an
  // orphaned 'collecting' batch with some of its walls, and there is no listing
  // UI to find one. Checking first means the common failure (a bad measurement)
  // never creates a half-batch at all.
  //
  // The dimension check is the one that matters: `Math.round(Number(x) || 0)`
  // silently turned a blank height into 0, and a 0-height wall makes the
  // allocator drain the entire approved design library into it.
  const prepared = walls.map((w, i) => {
    const seq = Number(w.seq) || i + 1;
    return {
      seq,
      name: String(w.name ?? `Wall ${seq}`).slice(0, 160),
      room: w.room ? String(w.room).slice(0, 120) : null,
      widthMm: Math.round(Number(w.widthMm) || 0),
      heightMm: Math.round(Number(w.heightMm) || 0),
      notes: w.notes ? String(w.notes).slice(0, 500) : null,
      b64: typeof w.photoBase64 === "string" ? w.photoBase64.replace(/^data:image\/\w+;base64,/, "") : null,
      // Carries on round a corner into the next wall (serial-run-rules.ts).
      turnsIntoNext: w.turnsIntoNext === true,
    };
  });
  for (const p of prepared) {
    const bad = wallSizeRejection(p.widthMm, p.heightMm);
    if (bad) {
      return NextResponse.json({
        error: `Wall ${p.seq} (“${p.name}”): ${bad}. Measured ${p.widthMm}×${p.heightMm} mm.`,
      }, { status: 400 });
    }
  }
  const seqs = new Set(prepared.map((p) => p.seq));
  if (seqs.size !== prepared.length) {
    return NextResponse.json({ error: "Two walls share the same position number." }, { status: 400 });
  }

  const { data: batch, error } = await sb.from("corporate_site_batches").insert({
    account_id: accountId,
    title: String(b.title ?? "Site batch").slice(0, 160),
    series_names: Array.isArray(b.seriesNames) ? (b.seriesNames as unknown[]).map(String).slice(0, 8) : [],
    state: b.state ? String(b.state) : null,
    ship_address: b.shipAddress ? String(b.shipAddress).slice(0, 400) : null,
    ship_city: b.shipCity ? String(b.shipCity).slice(0, 120) : null,
    gps: b.gps ? String(b.gps).slice(0, 60) : null,
    source_ref: b.sourceRef ? String(b.sourceRef).slice(0, 80) : null,
    notes: b.notes ? String(b.notes).slice(0, 1000) : null,
    created_by: createdBy,
    received_from: b.receivedFrom ? String(b.receivedFrom).trim().slice(0, 160) || null : null,
  }).select().single();
  if (error || !batch) return NextResponse.json({ error: "Could not create the batch." }, { status: 500 });

  const photosFailed: number[] = [];
  for (const p of prepared) {
    let photoPath: string | null = null;
    let photoError: string | null = null;
    if (p.b64 && p.b64.length < 16_000_000) {
      const path = `site/${batch.id}/w${String(p.seq).padStart(2, "0")}.jpg`;
      const up = await caUpload(path, Buffer.from(p.b64, "base64"), {
        contentType: "image/jpeg", upsert: true,
      });
      // A dropped photo is NOT a cosmetic loss. This used to do
      // `if (up.error) photoPath = null` and insert the wall regardless: the
      // allocator then wrote "— no photo" into the prompt, judged a wall it
      // could not see, and produced a degraded allocation on a chain that ends
      // at a printer — with nobody told, because the response never mentioned
      // it. Now the failure is recorded on the wall and reported to the caller.
      if (up.error) {
        photoError = up.error.message?.slice(0, 300) ?? "upload failed";
        photosFailed.push(p.seq);
      } else {
        photoPath = path;
      }
    } else if (p.b64) {
      photoError = "photo too large to accept";
      photosFailed.push(p.seq);
    }
    const { error: we } = await sb.from("corporate_site_batch_walls").insert({
      batch_id: batch.id, seq: p.seq,
      name: p.name, room: p.room,
      width_mm: p.widthMm, height_mm: p.heightMm,
      notes: p.notes,
      photo_path: photoPath,
      photo_error: photoError,
      turns_into_next: p.turnsIntoNext,
    });
    if (we) {
      // Don't hand a Postgres message to the caller — log it, return the wall.
      console.error("[site-batch] wall insert failed:", batch.id, p.seq, we.message);
      return NextResponse.json({ error: `Wall ${p.seq} could not be saved.` }, { status: 500 });
    }
  }
  return NextResponse.json({
    ok: true, id: batch.id, walls: prepared.length,
    ...(photosFailed.length ? { photosFailed } : {}),
  });
}
