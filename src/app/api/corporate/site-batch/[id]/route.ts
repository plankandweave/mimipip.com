import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DAY, signArt } from "@/lib/corporate-files";
import { internalTokenOk, loadBatch } from "@/lib/site-batch";
import { fetchWallLiveStatus } from "@/lib/install-sheet";
import { priceProjectLines } from "@/lib/corporate-project";
import { isSuggested } from "@/lib/site-batch-rules";
import type { CorporateAccount } from "@/lib/corporate-auth";

export const dynamic = "force-dynamic";

// GET → the batch with signed photo + composed-preview URLs: everything the
// review page (or the OS driver) needs to show photo | wall | creative.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const loaded = await loadBatch(sb, id);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!internalTokenOk(req)) {
    const session = await currentCorporateSession();
    if (!session || session.account.id !== loaded.batch.account_id) {
      return NextResponse.json({ error: "Not authorised" }, { status: 401 });
    }
  }

  // Which design (code + series) sits on each wall. The reviewer is signing
  // off a series brief ("ground floor = Series 2 + Pune"), not just pictures,
  // so the series has to be legible on the row itself — one query, not N.
  const allIds = [...new Set(loaded.walls.flatMap((w) => w.design_ids))];
  const { data: designRows } = allIds.length
    ? await sb.from("corporate_designs").select("id, design_code, series_name, status").in("id", allIds)
    : { data: [] };
  const designById = new Map((designRows ?? []).map((d) => [d.id as string, d]));

  // How far each released wall actually got. The wall's own `status` stops at
  // `ordered` forever, so without this the page tells a partner whose walls
  // shipped last week that they are still in production.
  const live = await fetchWallLiveStatus(
    sb,
    loaded.walls.filter((w) => w.status === "ordered").map((w) => ({ seq: w.seq, name: w.name })),
    loaded.batch.account_id,
  );

  const walls = [];
  for (const w of loaded.walls) {
    const picks = w.design_ids.map((id) => designById.get(id)).filter(Boolean);
    const series = [...new Set(picks.map((d) => (d!.series_name as string) ?? "—"))];
    const codes = picks.map((d) => (d!.design_code as string) ?? "");
    // A design still pending in the library cannot legally go to print. A wall
    // already in print is past that question: a design archived later (the
    // duplicate artwork cleared out of the Vijay Sales library on 13 October
    // 2026) must not brand a shipped wall "not approved".
    const unapproved = picks.filter((d) => w.status !== "ordered" && d!.status !== "approved")
      .map((d) => (d!.design_code as string) ?? (d!.id as string));
    const art = (w.art_json ?? []).length
      ? await Promise.all((w.art_json ?? []).map(async (p) => ({
          name: p.name, widthMm: p.widthMm,
          previewUrl: p.path ? await signArt(sb, p.path, DAY) : p.previewUrl,
        })))
      : [];
    walls.push({
      seq: w.seq, name: w.name, room: w.room, widthMm: w.width_mm, heightMm: w.height_mm,
      photoUrl: w.photo_path ? await signArt(sb, w.photo_path, DAY) : null,
      context: w.context_json?.context ?? null, note: w.context_json?.note ?? null,
      quad: w.quad_json ?? null,
      designCount: w.design_ids.length, art, status: w.status, warning: w.warning,
      orderRefs: w.order_refs, series, codes, unapproved,
      live: live[w.seq] ?? null,
      // Zyvorah's suggestion, not the client's drawing: the page badges it,
      // prices it apart and leaves it out of "approve all remaining".
      suggested: isSuggested(w), suggestionReason: w.suggestion_reason ?? null,
      // The artwork carries on round a corner into the next wall.
      turnsIntoNext: w.turns_into_next === true,
    });
  }
  const { batch } = loaded;
  const { data: accountRow } = await sb.from("corporate_accounts").select("*").eq("id", batch.account_id).single();
  const { data: storeRow } = batch.store_id
    ? await sb.from("corporate_stores").select("name").eq("id", batch.store_id).maybeSingle()
    : { data: null };
  /** measuredSqft is the wall as drawn; areaSqft is what is BILLED. They
   *  differ when the media floor applied (floorApplied): a band narrower
   *  than the roll still uses the full web for its whole run, so the bill
   *  covers the web (Roheena, 26 August 2026). The page says so out loud —
   *  a partner billed 1.31 m for a 0.97 m band deserves the arithmetic. */
  type QuoteLine = {
    seq: number; name: string; areaSqft: number; measuredSqft: number; floorApplied: boolean;
    amount: number; gstAmount: number; total: number;
  };
  let quote: {
    available: boolean;
    reason?: string;
    ratePerSqft?: number;
    gstPct?: number;
    /** The client's own walls — what the total is made of. */
    lines?: QuoteLine[];
    /** Walls Zyvorah suggested, priced the same way but OUTSIDE the total:
     *  an optional addition the approver may take up wall by wall. */
    optionalLines?: QuoteLine[];
    optionalTotal?: number;
    /** The billable web width the floor is built on, mm; null = no floor. */
    minBillableWidthMm?: number | null;
    subtotal?: number;
    gstAmount?: number;
    total?: number;
  } = { available: false, reason: "Pricing is unavailable." };
  if (accountRow) {
    const priced = await priceProjectLines(accountRow as CorporateAccount, loaded.walls.map((w) => ({
      designUrl: w.art_json?.[0]?.url ?? "",
      widthMm: w.width_mm,
      heightMm: w.height_mm,
      printName: w.name,
    })));
    if (priced.ok) {
      const all = priced.lines.map((line, index) => ({
        seq: loaded.walls[index]!.seq,
        name: line.printName ?? loaded.walls[index]!.name,
        areaSqft: line.price.areaSqft,
        measuredSqft: line.price.fullAreaSqft,
        floorApplied: line.price.mediaFloorApplied,
        amount: line.price.amount,
        gstAmount: line.price.gstAmount,
        total: line.price.total,
        suggested: isSuggested(loaded.walls[index]!),
      }));
      const strip = (l: (typeof all)[number]): QuoteLine => ({
        seq: l.seq, name: l.name, areaSqft: l.areaSqft, measuredSqft: l.measuredSqft, floorApplied: l.floorApplied,
        amount: l.amount, gstAmount: l.gstAmount, total: l.total,
      });
      const lines = all.filter((l) => !l.suggested).map(strip);
      const optionalLines = all.filter((l) => l.suggested).map(strip);
      const r2 = (n: number) => Math.round(n * 100) / 100;
      quote = {
        available: true,
        ratePerSqft: Number(accountRow.rate_per_sqft),
        gstPct: Number(accountRow.gst_pct),
        lines,
        optionalLines,
        optionalTotal: r2(optionalLines.reduce((s, l) => s + l.total, 0)),
        minBillableWidthMm: priced.lines[0]?.price.minBillableWidthMm ?? null,
        subtotal: r2(lines.reduce((s, l) => s + l.amount, 0)),
        gstAmount: r2(lines.reduce((s, l) => s + l.gstAmount, 0)),
        total: r2(lines.reduce((s, l) => s + l.total, 0)),
      };
    } else {
      quote = { available: false, reason: priced.error };
    }
  }
  return NextResponse.json({
    ok: true,
    batch: {
      id: batch.id, title: batch.title, status: batch.status, seriesNames: batch.series_names,
      revision: batch.revision,
      storeName: (storeRow?.name as string | undefined) ?? null,
      state: batch.state, shipCity: batch.ship_city, shipAddress: batch.ship_address,
      notes: batch.notes, gps: batch.gps,
      warnings: batch.allocation_json?.warnings ?? [], groupRef: batch.group_ref,
      approvedBy: batch.approved_by_email, error: batch.error,
      entranceInScope: batch.entrance_in_scope !== false,
    },
    walls, quote,
  });
}
