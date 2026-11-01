import { proposalConfigurationSchema, initialProposalConfiguration, type ProposalConfiguration } from "@/lib/proposal-configuration";
import { NextResponse } from "next/server";
import { caRemove } from "@/lib/corporate-art-store";
import { recordAudit } from "@/lib/corporate-auth";
import { signArt } from "@/lib/corporate-files";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardCapture } from "@/lib/portfolio-capture";
import { detectWallQuad, type Quad } from "@/lib/wall-quad";

export const dynamic = "force-dynamic";
/** Quad detection is a vision call per wall. Comfortably inside a minute,
 *  nowhere near inside the default ten seconds. */
export const maxDuration = 60;

/**
 * Wall studies: this wall, and this wall with a design on it.
 *
 * GET  ?areaId=…              → every wall in the space with its studies
 * POST { action: "create" }   → study this wall wearing this design
 * POST { action: "redetect" } → find the wall surface in the photo again
 * POST { action: "approve" }  → the client says yes to one
 * POST { action: "delete" }   → drop a study
 *
 * The composed picture is NOT made here. WallMockup draws the warp live in the
 * browser from the photo, the artwork and the quad; this route only decides
 * WHICH pairings exist and where the wall sits in each photograph. The image is
 * exported and stored separately (studies/render) and only because a PDF is
 * built on a server that has no canvas to draw it with.
 */

const PREVIEW_TTL_S = 900;

type StudyRow = {
  configuration: ProposalConfiguration | null; revision: number;
  room_photo_path: string | null; room_mids: Quad | null; product_handle: string | null;
  id: string; wall_id: string; design_id: string;
  quad_json: Quad | null; render_path: string | null; render_error: string | null;
  status: "draft" | "approved";
  approved_at: string | null; approved_by_email: string | null;
  sort: number; note: string | null;
};

/** The wall a study is about, proven to be in this account's space.
 *
 *  Walls do not carry an account_id — they hang off a batch — so a wall id from
 *  a request body is checked by walking back to the area the session already
 *  resolved. Without this, a study could be hung on another tenant's wall. */
async function wallInArea(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  areaId: string,
  seq: number,
) {
  const { data: batch } = await sb.from("corporate_site_batches")
    .select("id").eq("area_id", areaId).eq("status", "collecting").maybeSingle();
  if (!batch) return null;
  const { data: wall } = await sb.from("corporate_site_batch_walls")
    .select("id, seq, name, width_mm, height_mm, photo_path, quad_json, brief, voice_transcript")
    .eq("batch_id", batch.id).eq("seq", seq).maybeSingle();
  return wall ?? null;
}

export async function GET(req: Request) {
  const areaId = new URL(req.url).searchParams.get("areaId") ?? "";
  const g = await guardCapture(areaId);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area, session } = g.ctx;

  const { data: batch } = await sb.from("corporate_site_batches")
    .select("id").eq("area_id", area.id).eq("status", "collecting").maybeSingle();
  if (!batch) return NextResponse.json({ ok: true, walls: [] });

  const { data: walls } = await sb.from("corporate_site_batch_walls")
    .select("id, seq, name, width_mm, height_mm, photo_path, quad_json, brief")
    .eq("batch_id", batch.id).order("seq");

  const ids = (walls ?? []).map((w) => w.id as string);
  const { data: studies } = ids.length
    ? await sb.from("corporate_wall_studies")
        .select("*").in("wall_id", ids)
        .eq("account_id", session.account.id)
        .order("sort").order("created_at")
    : { data: [] as StudyRow[] };

  // The artwork is served through the watermarking image route rather than a
  // signed storage URL — the library's own rule, and the warp draws from it
  // just as happily.
  const out = await Promise.all((walls ?? []).map(async (w) => ({
    id: w.id as string,
    seq: w.seq as number,
    name: w.name as string,
    widthMm: w.width_mm as number,
    heightMm: w.height_mm as number,
    brief: (w.brief as string | null) ?? null,
    photoUrl: w.photo_path ? await signArt(sb, w.photo_path as string, PREVIEW_TTL_S) : null,
    quad: (w.quad_json as Quad | null) ?? null,
    studies: await Promise.all(
      ((studies ?? []) as StudyRow[])
        .filter((s) => s.wall_id === w.id)
        .map(async (s) => ({
          id: s.id,
          designId: s.design_id,
          purchasable: Boolean(s.product_handle),
          roomPhotoUrl: s.room_photo_path ? await signArt(sb, s.room_photo_path, PREVIEW_TTL_S) : null,
          roomMids: s.room_mids,
          configuration: s.configuration ?? initialProposalConfiguration(w.width_mm, w.height_mm),
          revision: s.revision,
          quad: s.quad_json,
          status: s.status,
          note: s.note,
          approvedAt: s.approved_at,
          approvedBy: s.approved_by_email,
          artUrl: `/api/corporate/designs/${s.design_id}/image`,
          renderUrl: s.render_path ? await signArt(sb, s.render_path, PREVIEW_TTL_S) : null,
          renderError: s.render_error,
        })),
    ),
  })));

  return NextResponse.json({ ok: true, walls: out });
}

export async function POST(req: Request) {
  let b: {
    action?: string; areaId?: string; seq?: number;
    designId?: string; studyId?: string; note?: string; configuration?: unknown; revision?: number;
  };
  try { b = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const g = await guardCapture(String(b.areaId ?? ""));
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { sb, area, session } = g.ctx;
  const action = String(b.action ?? "");

  // ── Approve / unapprove / delete: addressed by study id ──────────────────
  if (action === "configure" || action === "approve" || action === "unapprove" || action === "delete") {
    const studyId = String(b.studyId ?? "");
    const { data: study } = await sb.from("corporate_wall_studies")
      .select("id, wall_id, render_path, revision, configuration").eq("id", studyId)
      .eq("account_id", session.account.id).maybeSingle();
    if (!study) return NextResponse.json({ ok: false, error: "That study isn't on your account." }, { status: 404 });

    // Resolve the study back to this space, not just the same account.
    const { data: ownerWall } = await sb.from("corporate_site_batch_walls")
      .select("batch_id, width_mm, height_mm").eq("id", study.wall_id).maybeSingle();
    const { data: ownerBatch } = ownerWall ? await sb.from("corporate_site_batches")
      .select("id").eq("id", ownerWall.batch_id).eq("area_id", area.id)
      .eq("status", "collecting").maybeSingle() : { data: null };
    if (!ownerBatch) return NextResponse.json({ ok: false, error: "That proposal isn't in this space." }, { status: 404 });
    if (!Number.isInteger(b.revision) || b.revision !== study.revision) {
      return NextResponse.json({ ok: false, error: "This proposal changed. Reload it before saving or approving." }, { status: 409 });
    }
    if (action === "configure") {
      const parsed = proposalConfigurationSchema.safeParse(b.configuration);
      if (!parsed.success) return NextResponse.json({ ok: false, error: "Check the dimensions and composition." }, { status: 400 });
      const { data: saved, error } = await sb.from("corporate_wall_studies").update({
        configuration: parsed.data, revision: study.revision + 1,
        status: "draft", approved_at: null, approved_by_email: null,
        render_path: null, render_error: null, updated_at: new Date().toISOString(),
      }).eq("id", studyId).eq("account_id", session.account.id)
        .eq("revision", b.revision).select("id").maybeSingle();
      if (error || !saved) return NextResponse.json({ ok: false, error: "Could not save. Reload this proposal and try again." }, { status: 409 });
      await recordAudit(session, "proposal.configure", { type: "area", id: area.id },
        { studyId, revision: study.revision + 1, configuration: parsed.data });
      return NextResponse.json({ ok: true, note: "Changes saved. Review this version before approving. Production remains on hold." });
    }

    if (action === "delete") {
      const { data: removed, error } = await sb.from("corporate_wall_studies").delete().eq("id", studyId).eq("revision", b.revision).select("id").maybeSingle();
      if (error || !removed) return NextResponse.json({ ok: false, error: "This proposal changed. Reload it." }, { status: 409 });
      if (study.render_path) {
        await caRemove([study.render_path as string]);
      }
      await recordAudit(session, "study.delete", { type: "area", id: area.id }, { studyId });
      return NextResponse.json({ ok: true, deleted: studyId });
    }

    const approving = action === "approve";
    const { data: saved, error } = await sb.from("corporate_wall_studies").update({
      configuration: study.configuration ?? initialProposalConfiguration(ownerWall!.width_mm, ownerWall!.height_mm),
      status: approving ? "approved" : "draft",
      revision: study.revision + 1,
      // Cleared on unapprove: a name and a timestamp left behind would say
      // somebody approved this, and they have just taken that back.
      approved_at: approving ? new Date().toISOString() : null,
      approved_by_email: approving ? session.email : null,
      updated_at: new Date().toISOString(),
    }).eq("id", studyId).eq("revision", b.revision).select("id, status").maybeSingle();
    if (error || !saved) return NextResponse.json({ ok: false, error: "This proposal changed. Reload it before approving." }, { status: 409 });

    await recordAudit(session, approving ? "study.approve" : "study.unapprove",
      { type: "area", id: area.id }, { studyId });
    return NextResponse.json({ ok: true, status: saved?.status });
  }

  // ── Everything below is about one wall ───────────────────────────────────
  const seq = Math.round(Number(b.seq));
  if (!Number.isFinite(seq)) {
    return NextResponse.json({ ok: false, error: "Which wall?" }, { status: 400 });
  }
  const wall = await wallInArea(sb, area.id, seq);
  if (!wall) return NextResponse.json({ ok: false, error: "That wall isn't in this space." }, { status: 404 });
  if (!wall.photo_path) {
    return NextResponse.json({
      ok: false, error: "Photograph the wall first — a study is drawn on its photo.",
    }, { status: 409 });
  }

  // ── Re-find the wall surface in the photograph ───────────────────────────
  // Deliberately does NOT touch existing studies: their geometry is frozen, so
  // a re-detect changes what the NEXT study is drawn on, and an approved study
  // keeps looking exactly as it did when it was approved.
  if (action === "redetect") {
    const quad = await detectWallQuad(sb, wall.photo_path as string, wall.name as string, "commercial");
    await sb.from("corporate_site_batch_walls")
      .update({ quad_json: quad }).eq("id", wall.id as string);
    await recordAudit(session, "study.redetect", { type: "area", id: area.id }, { seq, found: Boolean(quad) });
    return NextResponse.json({
      ok: true, quad,
      // A null quad is a real answer, not a failure: the study falls back to
      // photograph beside artwork, which beats a mockup on an imagined plane.
      note: quad ? null : "We couldn't pick out the wall surface in that photo. The design is shown beside it instead — a straight-on shot usually fixes this.",
    });
  }

  // ── Study this wall wearing this design ──────────────────────────────────
  if (action !== "create") {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const designId = String(b.designId ?? "");
  const { data: design } = await sb.from("corporate_designs")
    .select("id, title").eq("id", designId)
    .eq("account_id", session.account.id).maybeSingle();
  if (!design) {
    return NextResponse.json({ ok: false, error: "That design isn't in your library." }, { status: 404 });
  }

  // Detected once per wall and cached on it, because it is a fact about the
  // PHOTOGRAPH, not about the design — studying a second direction on the same
  // wall must not pay for vision twice.
  let quad = (wall.quad_json as Quad | null) ?? null;
  if (!quad) {
    quad = await detectWallQuad(sb, wall.photo_path as string, wall.name as string, "commercial");
    if (quad) {
      await sb.from("corporate_site_batch_walls")
        .update({ quad_json: quad }).eq("id", wall.id as string);
    }
  }

  const { data: created, error } = await sb.from("corporate_wall_studies").insert({
    account_id: session.account.id,
    wall_id: wall.id as string,
    design_id: designId,
    // Copied, not referenced — see the migration's note.
    quad_json: quad,
    note: String(b.note ?? "").trim().slice(0, 500) || null,
    created_by_email: session.email,
  }).select("*").maybeSingle();

  if (error && /duplicate key/i.test(error.message)) {
    return NextResponse.json({
      ok: false, error: "That design is already being studied on this wall.",
    }, { status: 409 });
  }
  if (error || !created) {
    console.error("[studies] create failed:", error?.message);
    return NextResponse.json({ ok: false, error: "Could not start that study." }, { status: 500 });
  }

  await recordAudit(session, "study.create", { type: "area", id: area.id },
    { seq, design: design.title, quad: Boolean(quad) });

  return NextResponse.json({
    ok: true,
    study: {
      id: (created as StudyRow).id,
      designId,
      quad,
      status: "draft",
      artUrl: `/api/corporate/designs/${designId}/image`,
      renderUrl: null,
      renderError: null,
    },
    note: quad ? null : "We couldn't pick out the wall surface in that photo, so this is shown as the wall beside the design rather than on it.",
  });
}
