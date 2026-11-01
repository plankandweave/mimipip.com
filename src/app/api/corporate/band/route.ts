import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession, sizeRejection, MAX_RUN_MM, MAX_BAND_MM } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { bandComposeInteractiveRemote } from "@/lib/media-client";
import type { InteractiveBandResult } from "@/lib/band-compose-interactive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A showroom's rack band is a long shallow run — 25-30 ft × 2.5 ft — and one
// creative fitted to that height covers only heightFt × aspect of it, so the
// band is composed: designs A, B, C… from the approved library laid left to
// right, each fitted to the band's height. This route builds the PRINT MASTER
// for that composition from the CLEAN originals (the browser only ever sees
// watermarked previews, so client-side stitching is impossible by design),
// stores it as a permanent corporate-art file, and hands back a normal
// art-slot payload — downstream (DPI verdict, order routes, OS push,
// panelization) treats it as one wide image, which is the truth of the print.

const MAX_SEGMENTS = 12;
// The sharp pipeline itself (canvas ceilings and all) moved verbatim to
// src/lib/band-compose-interactive.ts, which runs in the media container —
// workerd cannot load sharp. This route keeps auth, validation and the
// response contract.

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let b: { designIds?: unknown; widthMm?: unknown; heightMm?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const widthMm = Math.round(Number(b.widthMm) || 0);
  const heightMm = Math.round(Number(b.heightMm) || 0);
  // No CREATIVE runs past 39 m (a full roll), but a band may: it splits into
  // equal pieces, one order line each — a 78 m run becomes two 39 m pieces
  // that butt-join on site exactly like panels within a piece do.
  if (widthMm > MAX_BAND_MM) {
    return NextResponse.json({ error: `Band length must be ${MAX_BAND_MM / 1000} m or less.` }, { status: 400 });
  }
  const nPieces = Math.max(1, Math.ceil(widthMm / MAX_RUN_MM));
  const bad = sizeRejection(Math.floor(widthMm / nPieces), heightMm);
  if (bad) return NextResponse.json({ error: `Band ${bad}.` }, { status: 400 });

  const ids = Array.isArray(b.designIds) ? b.designIds.filter((x): x is string => typeof x === "string") : [];
  if (ids.length < 1) return NextResponse.json({ error: "Pick at least one design for the band." }, { status: 400 });
  if (ids.length > MAX_SEGMENTS) {
    return NextResponse.json({ error: `A band carries at most ${MAX_SEGMENTS} designs.` }, { status: 400 });
  }

  // Approved library designs of THIS account only — someone else's design id,
  // or a pending one the owner hasn't ticked, is a 400 not a print.
  const { data: rows, error } = await sb
    .from("corporate_designs")
    .select("id, title, design_url, design_code, status, print_type")
    .in("id", [...new Set(ids)])
    .eq("account_id", session.account.id);
  if (error) return NextResponse.json({ error: "Could not load the designs." }, { status: 500 });
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  for (const id of ids) {
    const d = byId.get(id);
    if (!d) return NextResponse.json({ error: "One of the designs is not in your library." }, { status: 400 });
    if (d.status !== "approved") {
      return NextResponse.json({ error: `“${d.title}” is not approved yet — only approved designs can print.` }, { status: 400 });
    }
  }

  // A band is ONE continuous printed run, so it prints under one set of rules —
  // it cannot be half wrap and half wallpaper. Mixing types would silently give
  // one of the segments the other's seam overlap, which is the confusion the
  // print_type axis exists to end, so it is refused here rather than resolved
  // by picking a winner.
  const segTypes = new Set(ids.map((id) => String(byId.get(id)?.print_type ?? "wallpaper")));
  if (segTypes.size > 1) {
    return NextResponse.json({
      error: `A band has to be one kind of product — this one mixes ${[...segTypes].join(" and ")}. Split it into a band per type.`,
    }, { status: 400 });
  }
  const bandType = [...segTypes][0] ?? "wallpaper";

  // The compose itself runs in the media container (see
  // band-compose-interactive.ts). {error, status} unions come back as data so
  // the original HTTP statuses survive the hop.
  let out: InteractiveBandResult;
  try {
    out = (await bandComposeInteractiveRemote({
      accountSlug: session.account.slug,
      designs: ids.map((id) => {
        const d = byId.get(id)!;
        return {
          id,
          title: (d.title as string | null) ?? null,
          design_url: String(d.design_url),
          design_code: (d.design_code as string | null) ?? null,
        };
      }),
      ids,
      widthMm,
      heightMm,
      nPieces,
    })) as InteractiveBandResult;
  } catch (e) {
    console.error("[corporate/band] compose transport failed:", e);
    return NextResponse.json({ error: "Could not build the band — please try again." }, { status: 502 });
  }
  if ("error" in out) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }

  // Every piece of the band inherits the segments' type, so the wall the
  // partner adds from it carries the right print rules even though a composed
  // band has no library row and no catalogue handle of its own.
  return NextResponse.json({ ok: true, pieces: out.pieces, tiles: out.tiles, passes: out.passes, printType: bandType });
}
