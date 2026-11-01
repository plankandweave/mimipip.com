import { prepareNotesUpload } from "@/lib/vault-notes-upload";
import { imageNotesEnabled, MAX_AUDIO_BYTES, pictureBytes, parseImageNotes, TRANSCRIPTION_NOTICE } from "@/lib/vault-image-notes";
import { NextResponse, after } from "next/server";
import { can, canAdministerAccount, isVaultUploadOnly, currentCorporateSession, recordAudit, sessionActor } from "@/lib/corporate-auth";
import { caDownload, caRemove, caSignedUploadUrl, caUpload } from "@/lib/corporate-art-store";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureBlueprint, loadPulse, loadVault, vaultPath, type BlueprintWallRow, type VaultDocumentRow } from "@/lib/vault";
import { loadPresentedProposal } from "@/lib/prism";
import { draftPendingWalks } from "@/lib/pulse-draft";
import { MAX_WALL_HEIGHT_MM, MAX_WALL_WIDTH_MM, MIN_SIDE_MM } from "@/lib/wall-measure";
import {
  guessVaultKind, MAX_VAULT_FILE_BYTES, titleFromFileName, vaultFileExtension, vaultStoredType,
  VAULT_KINDS, type VaultKind,
} from "@/lib/vault-kinds";
import { mintTraceLink, revokeTraceLink } from "@/lib/trace-link";
import { caDownload as readAudio } from "@/lib/corporate-art-store";
import { audioExtension, transcribeAudio } from "@/lib/transcribe";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UPLOAD_TTL_S = 1800;
const KINDS = new Set<string>(VAULT_KINDS.map((k) => k.id));

// The Vault, from inside the portal. Every call here has a signed-in session
// (the college's own people, or our staff) and acts on THAT account's
// Blueprint — the account comes from the session, never from the body.
//
//   GET                       → the drawer: documents, walks, links, Pulse, and the presented proposal (if any)
//   POST action: "sign"       → a signed slot for a file
//   POST action: "commit"     → the file landed; record it
//   POST action: "note"       → a text document (a transcript, a note)
//   POST action: "delete"     → remove a document
//   POST action: "mint-trace" → a no-login walk link (admins and staff)
//   POST action: "walk-remove"   → an admin removes a walk and everything drafted from it
//   POST action: "revoke-trace"
//   POST action: "transcribe" → ask again for a piece's words (fails soft)
//   POST action: "wall-update" → a wall's name, place, size, brief, plan, photo
//   POST action: "wall-add"    → a wall by hand (no walk needed)
//   POST action: "wall-drop" / "wall-restore"
//   POST action: "pulse-draft" → draft the walls of any ended walk still owed
//
// The Pulse board (lib/pulse.ts) is derived from blueprint_walls on every
// read. Opening the Vault also drafts, after the response, any ended walk
// whose taps have not become walls yet — so a walk that ended on a phone with
// no signal left still reaches the board the next time anyone looks.

async function guard() {
  const session = await currentCorporateSession({ allowVaultUploadOnly: true });
  if (!session) return { ok: false as const, status: 401, error: "Not signed in" };
  if (session.agreementPending) return { ok: false as const, status: 403, error: "agreement_required" };
  const sb = supabaseAdmin();
  if (!sb) return { ok: false as const, status: 503, error: "Unavailable" };
  const blueprint = await ensureBlueprint(sb, session.account, session.email);
  if (!blueprint) return { ok: false as const, status: 500, error: "Could not open the project." };
  return { ok: true as const, session, sb, blueprint };
}

export async function GET() {
  const g = await guard();
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const [vault, pulse, proposal] = await Promise.all([loadVault(g.sb, g.blueprint, imageNotesEnabled(g.session.account.slug) && can(g.session, "vault_upload") ? g.session.email : undefined), loadPulse(g.sb, g.blueprint), loadPresentedProposal(g.sb, g.blueprint)]);
  const { sb, blueprint } = g;
  if (can(g.session, "build")) after(() => draftPendingWalks(sb, blueprint.id).catch((e) => console.error("[vault] draft pending walks:", (e as Error)?.message)));
  return NextResponse.json({
    ok: true,
    blueprint: { id: g.blueprint.id, name: g.blueprint.name, city: g.blueprint.city, language: g.blueprint.language, status: pulse.status },
    pulse,
    proposal,
    canUpload: can(g.session, "vault_upload"),
    canEdit: can(g.session, "build"),
    canManage: canAdministerAccount(g.session),
    staff: g.session.staff,
    imageNotesEnabled: imageNotesEnabled(g.session.account.slug),
    transcriptionNotice: TRANSCRIPTION_NOTICE,
    ...vault,
  });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({})) as {
    action?: string; id?: string; kind?: string; title?: string; fileName?: string; contentType?: string;
    uploadKey?: string; imageNotes?: unknown; parentId?: string;
    bytes?: number; body?: string; observedOn?: string; source?: string;
    recipientName?: string; recipientEmail?: string; brief?: string; days?: number;
    walkId?: string; seq?: number;
    name?: string; location?: string; widthMm?: number | null; heightMm?: number | null;
    sizeSource?: string | null; planDocumentId?: string | null; photoDocumentId?: string | null;
  };
  const action = String(b.action ?? "");
  const g = await guard();
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { session, sb, blueprint } = g;
  const slug = session.account.slug;
  const actor = sessionActor(session);

  if (["sign", "commit"].includes(action) && !can(session, "vault_upload")) {
    return NextResponse.json({ ok: false, error: "You don't have permission to upload files." }, { status: 403 });
  }
  if (["note", "delete", "wall-update", "wall-add", "wall-drop", "wall-restore", "pulse-draft", "transcribe"].includes(action)) {
    if (!can(session, "build")) return NextResponse.json({ ok: false, error: "You don't have permission to add to this project." }, { status: 403 });
  }

  if (action === "audio-transcribe") return NextResponse.json({ ok: false, error: TRANSCRIPTION_NOTICE }, { status: 403 });
  if (action === "audio-sign" || (action === "sign" && imageNotesEnabled(slug))) {
    return prepareNotesUpload(sb, session, blueprint.id, b);
  }

  if (action === "sign") {
    const ext = vaultFileExtension(String(b.contentType ?? ""), String(b.fileName ?? ""));
    if (!ext) return NextResponse.json({ ok: false, error: "That file type isn't one we can take. PDF, images, DWG/DXF, Word, PowerPoint and Excel are fine." }, { status: 400 });
    if ((Number(b.bytes) || 0) > MAX_VAULT_FILE_BYTES) return NextResponse.json({ ok: false, error: "That file is over 120 MB. Split it, or send it to us another way." }, { status: 413 });
    const kind = KINDS.has(String(b.kind)) ? String(b.kind) as VaultKind : guessVaultKind(String(b.contentType ?? ""), String(b.fileName ?? ""));
    const contentType = vaultStoredType(String(b.contentType ?? ""), ext);
    // The row exists before the bytes do, addressed by its own id, so the
    // path is never anything a caller sent.
    const { data: row, error } = await sb.from("vault_documents").insert({
      blueprint_id: blueprint.id, account_id: session.account.id, kind,
      title: String(b.title ?? "").trim().slice(0, 140) || titleFromFileName(String(b.fileName ?? "")),
      content_type: contentType, source: session.staff ? "staff" : "upload",
      uploaded_by_email: session.email, uploaded_by_name: actor.name,
      deleted_at: new Date().toISOString(), // hidden until commit proves the file landed
    }).select("id").single();
    if (error || !row) return NextResponse.json({ ok: false, error: "Could not prepare the upload." }, { status: 500 });
    const path = vaultPath(slug, row.id as string, ext, isVaultUploadOnly(session));
    await sb.from("vault_documents").update({ path }).eq("id", row.id);
    const signed = caSignedUploadUrl(path, { upsert: true, ttlSeconds: UPLOAD_TTL_S });
    return NextResponse.json({ ok: true, id: row.id, signedUrl: signed.signedUrl, contentType });
  }

  if (action === "commit") {
    const { data: row } = await sb.from("vault_documents").select("*")
      .eq("id", String(b.id ?? "")).eq("blueprint_id", blueprint.id).maybeSingle();
    const doc = row as VaultDocumentRow | null;
    if (doc && isVaultUploadOnly(session) && doc.uploaded_by_email !== session.email) return NextResponse.json({ ok: false, error: "That upload is not yours." }, { status: 403 });
    if (!doc?.path) return NextResponse.json({ ok: false, error: "That upload isn't in this project." }, { status: 404 });
    if (doc.upload_key) {
      if (doc.uploaded_by_email !== session.email) return NextResponse.json({ ok: false, error: "That upload is not yours." }, { status: 403 });
      if (doc.image_notes) {
        try { parseImageNotes(doc.image_notes); } catch { return NextResponse.json({ ok: false, error: "Space and wall labels are required." }, { status: 400 }); }
      }
      if (!doc.deleted_at) return NextResponse.json({ ok: true });
    }
    const { data: file } = await caDownload(doc.path);
    const raw = file ? await file.arrayBuffer() : null;
    if (doc.upload_key && (!raw || raw.byteLength === 0)) return NextResponse.json({ ok: false, error: "The file has not arrived. Retry this upload." }, { status: 409 });
    if (!raw || raw.byteLength === 0 || raw.byteLength > (doc.parent_document_id ? MAX_AUDIO_BYTES : MAX_VAULT_FILE_BYTES)) {
      if (raw) await caRemove([doc.path]);
      await sb.from("vault_documents").delete().eq("id", doc.id);
      return NextResponse.json({ ok: false, error: raw ? "That file is too large." : "That didn't arrive. Try again." }, { status: 400 });
    }
    if (doc.upload_key && raw && pictureBytes(raw) && !doc.image_notes) return NextResponse.json({ ok: false, error: "This is a picture. Choose it again with space and wall labels." }, { status: 400 });
    if (!doc.upload_key && doc.content_type && file && file.type !== doc.content_type) {
      // Re-label with the type the row decided, so a PDF is served as a PDF
      // whatever header the browser sent.
      const up = await caUpload(doc.path, raw, { contentType: doc.content_type, upsert: true, cacheControl: CACHE_MUTABLE });
      if (up.error) console.error("[vault] relabel failed:", up.error.message);
    }
    const { error: savedError } = await sb.from("vault_documents").update({ bytes: raw.byteLength, deleted_at: null }).eq("id", doc.id);
    if (savedError) return NextResponse.json({ ok: false, error: "Could not confirm the save. Retry this upload." }, { status: 500 });
    await recordAudit(session, "vault.upload", { type: "vault_document", id: doc.id }, { kind: doc.kind, bytes: raw.byteLength });
    return NextResponse.json({ ok: true });
  }

  if (action === "note") {
    const body = String(b.body ?? "").trim();
    if (!body) return NextResponse.json({ ok: false, error: "Write something first." }, { status: 400 });
    const kind = KINDS.has(String(b.kind)) ? String(b.kind) as VaultKind : "note";
    const observedOn = /^\d{4}-\d{2}-\d{2}$/.test(String(b.observedOn ?? "")) ? String(b.observedOn) : null;
    const { data: row, error } = await sb.from("vault_documents").insert({
      blueprint_id: blueprint.id, account_id: session.account.id, kind,
      title: String(b.title ?? "").trim().slice(0, 140) || (kind === "transcript" ? "Meeting notes" : "Note"),
      body: body.slice(0, 200_000), observed_on: observedOn,
      source: kind === "transcript" ? "meeting" : session.staff ? "staff" : "upload",
      uploaded_by_email: session.email, uploaded_by_name: actor.name,
    }).select("id").single();
    if (error || !row) return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 500 });
    await recordAudit(session, "vault.note", { type: "vault_document", id: row.id as string }, { kind });
    return NextResponse.json({ ok: true, id: row.id });
  }

  if (action === "delete") {
    const { data: row } = await sb.from("vault_documents").select("id, path, uploaded_by_email")
      .eq("id", String(b.id ?? "")).eq("blueprint_id", blueprint.id).is("deleted_at", null).maybeSingle();
    if (!row) return NextResponse.json({ ok: false, error: "That document isn't in this project." }, { status: 404 });
    // A member removes what they put in; admins and staff remove anything.
    if (!canAdministerAccount(session) && row.uploaded_by_email !== session.email) {
      return NextResponse.json({ ok: false, error: "Only the person who added it, or an admin, can remove it." }, { status: 403 });
    }
    await sb.from("vault_documents").update({ deleted_at: new Date().toISOString() }).eq("id", row.id);
    if (row.path) await caRemove([row.path as string]);
    await recordAudit(session, "vault.delete", { type: "vault_document", id: row.id as string });
    return NextResponse.json({ ok: true });
  }

  if (action === "walk-remove") {
    // A walk recorded by mistake, or a test, goes with everything drafted from
    // it: its walls on the board, its marks, its pieces and their files. Only
    // an admin or our staff, and never a walk still recording.
    if (!canAdministerAccount(session)) return NextResponse.json({ ok: false, error: "Only an admin can remove a walk." }, { status: 403 });
    const walkId = String(b.walkId ?? "");
    const { data: walk } = await sb.from("trace_walks").select("id, status").eq("id", walkId).eq("blueprint_id", blueprint.id).maybeSingle();
    if (!walk) return NextResponse.json({ ok: false, error: "That walk isn't in this project." }, { status: 404 });
    if (walk.status === "recording") return NextResponse.json({ ok: false, error: "That walk is still recording. End it on the phone first." }, { status: 409 });
    const [{ data: segs }, { data: marks }] = await Promise.all([
      sb.from("trace_segments").select("video_path, audio_path").eq("walk_id", walkId),
      sb.from("trace_marks").select("still_path").eq("walk_id", walkId),
    ]);
    await sb.from("blueprint_walls").delete().eq("walk_id", walkId).eq("blueprint_id", blueprint.id);
    await sb.from("trace_marks").delete().eq("walk_id", walkId);
    await sb.from("trace_segments").delete().eq("walk_id", walkId);
    const { error } = await sb.from("trace_walks").delete().eq("id", walkId);
    if (error) return NextResponse.json({ ok: false, error: "Could not remove that walk." }, { status: 500 });
    const paths = [
      ...((segs ?? []) as { video_path: string | null; audio_path: string | null }[]).flatMap((s) => [s.video_path, s.audio_path]),
      ...((marks ?? []) as { still_path: string | null }[]).map((m) => m.still_path),
    ].filter((x): x is string => Boolean(x));
    if (paths.length) await caRemove(paths);
    await recordAudit(session, "trace.walk-remove", { type: "trace_walk", id: walkId });
    return NextResponse.json({ ok: true });
  }

  if (action === "mint-trace" || action === "revoke-trace") {
    if (!canAdministerAccount(session)) return NextResponse.json({ ok: false, error: "Only an admin can issue walk links." }, { status: 403 });
    if (action === "revoke-trace") {
      const done = await revokeTraceLink(String(b.id ?? ""), session.account.id, session.email);
      if (done) await recordAudit(session, "trace.revoke", { type: "trace_link", id: String(b.id) });
      return NextResponse.json({ ok: done });
    }
    const minted = await mintTraceLink({
      accountId: session.account.id, blueprintId: blueprint.id,
      refPrefix: session.account.ref_prefix || slug.toUpperCase().slice(0, 6),
      recipientName: b.recipientName, recipientEmail: b.recipientEmail, brief: b.brief,
      days: Number(b.days) || undefined, byEmail: session.email,
    });
    if (!minted) return NextResponse.json({ ok: false, error: "Could not issue a link." }, { status: 500 });
    await recordAudit(session, "trace.mint", { type: "trace_link", id: minted.id }, { ref: minted.ref, recipient: b.recipientName ?? null });
    // The plaintext link goes back exactly once; it is never stored.
    return NextResponse.json({ ok: true, id: minted.id, ref: minted.ref, url: minted.url, expiresAt: minted.expiresAt });
  }

  if (action === "transcribe") {
    const { data: walk } = await sb.from("trace_walks").select("id").eq("id", String(b.walkId ?? "")).eq("blueprint_id", blueprint.id).maybeSingle();
    if (!walk) return NextResponse.json({ ok: false, error: "That walk isn't in this project." }, { status: 404 });
    const { data: seg } = await sb.from("trace_segments").select("id, audio_path, transcript")
      .eq("walk_id", walk.id).eq("seq", Math.round(Number(b.seq))).maybeSingle();
    if (!seg?.audio_path) return NextResponse.json({ ok: false, error: "That piece has no narration to transcribe." }, { status: 409 });
    if (seg.transcript) return NextResponse.json({ ok: true, already: true });
    const { data: file } = await readAudio(seg.audio_path as string);
    if (!file) return NextResponse.json({ ok: false, error: "Could not read the narration." }, { status: 500 });
    const type = file.type || "audio/webm";
    const result = await transcribeAudio(await file.arrayBuffer(), `piece.${audioExtension(type) ?? "webm"}`, type, {
      segments: true, prompt: `A walk through ${blueprint.name}, describing walls and spaces for wall art. Indian English.`,
    });
    if (!result.ok) {
      await sb.from("trace_segments").update({ transcript_error: result.error }).eq("id", seg.id);
      return NextResponse.json({ ok: false, error: result.error }, { status: 503 });
    }
    await sb.from("trace_segments").update({
      transcript: result.text, transcript_json: result.segments ?? null, transcript_error: null, transcribed_at: new Date().toISOString(),
    }).eq("id", seg.id);
    return NextResponse.json({ ok: true });
  }

  // ── Pulse: the walls ──────────────────────────────────────────────────────
  if (action === "wall-add") {
    const name = String(b.name ?? "").trim().slice(0, 160);
    if (!name) return NextResponse.json({ ok: false, error: "Give the wall a name." }, { status: 400 });
    const { data: last } = await sb.from("blueprint_walls").select("seq").eq("blueprint_id", blueprint.id)
      .order("seq", { ascending: false }).limit(1);
    const seq = ((last?.[0]?.seq as number | undefined) ?? 0) + 1;
    const { data: row, error } = await sb.from("blueprint_walls").insert({
      blueprint_id: blueprint.id, account_id: session.account.id, seq, name,
      location: String(b.location ?? "").trim().slice(0, 200) || null, source: "manual",
      created_by_email: session.email,
    }).select("id").single();
    if (error || !row) return NextResponse.json({ ok: false, error: "Could not add that wall." }, { status: 500 });
    await recordAudit(session, "pulse.wall_add", { type: "blueprint_wall", id: row.id as string });
    return NextResponse.json({ ok: true, id: row.id });
  }

  if (action === "wall-update" || action === "wall-drop" || action === "wall-restore") {
    const { data: row } = await sb.from("blueprint_walls").select("*")
      .eq("id", String(b.id ?? "")).eq("blueprint_id", blueprint.id).maybeSingle();
    const wall = row as BlueprintWallRow | null;
    if (!wall) return NextResponse.json({ ok: false, error: "That wall isn't in this project." }, { status: 404 });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (action === "wall-drop") patch.status = "dropped";
    if (action === "wall-restore") patch.status = "candidate";
    if (action === "wall-update") {
      if (b.name !== undefined) {
        const name = String(b.name).trim().slice(0, 160);
        if (!name) return NextResponse.json({ ok: false, error: "A wall needs a name." }, { status: 400 });
        patch.name = name;
      }
      if (b.location !== undefined) patch.location = String(b.location ?? "").trim().slice(0, 200) || null;
      if (b.body !== undefined) patch.brief = String(b.body ?? "").trim().slice(0, 4000) || null;
      if (b.planDocumentId !== undefined) patch.plan_document_id = await ownDocument(sb, blueprint.id, b.planDocumentId, "plan");
      if (b.photoDocumentId !== undefined) {
        const id = await ownDocument(sb, blueprint.id, b.photoDocumentId, "photo");
        patch.photo_document_id = id;
        if (id) {
          const { data: doc } = await sb.from("vault_documents").select("path").eq("id", id).maybeSingle();
          if (doc?.path) patch.photo_path = doc.path;
        }
      }
      if (b.widthMm !== undefined || b.heightMm !== undefined) {
        const w = b.widthMm == null ? null : Math.round(Number(b.widthMm));
        const h = b.heightMm == null ? null : Math.round(Number(b.heightMm));
        if (w == null && h == null) {
          patch.width_mm = null; patch.height_mm = null; patch.size_source = null; patch.size_estimated = false;
        } else {
          if (w == null || h == null || !Number.isFinite(w) || !Number.isFinite(h)) {
            return NextResponse.json({ ok: false, error: "Give both the width and the height." }, { status: 400 });
          }
          if (w < MIN_SIDE_MM || h < MIN_SIDE_MM || w > MAX_WALL_WIDTH_MM || h > MAX_WALL_HEIGHT_MM) {
            return NextResponse.json({ ok: false, error: "That size doesn't look like a wall. Check the width and height." }, { status: 400 });
          }
          // A size typed by a person is a measurement; a size read off a plan
          // says so. A spoken hint can be confirmed either way.
          const source = b.sizeSource === "plan" ? "plan" : "measured";
          patch.width_mm = w; patch.height_mm = h; patch.size_source = source; patch.size_estimated = false;
        }
      } else if (b.sizeSource === "plan" || b.sizeSource === "measured") {
        if (wall.width_mm != null && wall.height_mm != null) { patch.size_source = b.sizeSource; patch.size_estimated = false; }
      }
    }
    const { error } = await sb.from("blueprint_walls").update(patch).eq("id", wall.id);
    if (error) return NextResponse.json({ ok: false, error: "Could not save that wall." }, { status: 500 });
    await recordAudit(session, `pulse.${action.replace("wall-", "wall_")}`, { type: "blueprint_wall", id: wall.id }, { keys: Object.keys(patch) });
    return NextResponse.json({ ok: true });
  }

  if (action === "pulse-draft") {
    const created = await draftPendingWalks(sb, blueprint.id);
    return NextResponse.json({ ok: true, created });
  }

  return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
}

/** A document id from the body is accepted only if it is this project's and
 *  of the kind asked for. Null clears the link. */
async function ownDocument(sb: Awaited<ReturnType<typeof supabaseAdmin>>, blueprintId: string, id: unknown, kind: "plan" | "photo"): Promise<string | null> {
  if (!sb) return null;
  const docId = String(id ?? "").trim();
  if (!docId) return null;
  const { data } = await sb.from("vault_documents").select("id").eq("id", docId).eq("blueprint_id", blueprintId)
    .eq("kind", kind).is("deleted_at", null).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
