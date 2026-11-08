import type { ImageNotes } from "./vault-image-notes";
import "server-only";
import type { SupabaseClient } from "@/brand/database-types";
import { signArt, DAY } from "@/lib/corporate-files";
import type { CorporateAccount } from "@/lib/corporate-auth";
import type { BlueprintRow, TraceLinkRow, TraceMarkRow, TraceSegmentRow, TraceWalkRow } from "@/lib/trace-link";
import { describeWalk, transcriptCoverage, type PieceSummary } from "@/lib/trace";
import type { VaultKind } from "@/lib/vault-kinds";
import { blueprintReadiness, pulseStatus, wallReadiness, type BlueprintReadiness, type BlueprintStatus, type WallFacts, type WallReadiness } from "@/lib/pulse";

// ─── The Vault: one campus project's drawer ─────────────────────────────────
//
// A Blueprint is the project a college's partner account is running. Its
// Vault is everything the project has gathered: the documents the college
// uploads, the transcripts Zyvorah files, and every Trace walk with its
// pieces and its marks. The Vault is read with a signed-in session (the
// college's own people, or our staff); the Trace link that FILLS it needs no
// login. See docs/campus-blueprint.md.

/** The one Blueprint a signed-in account works on. Created on first need,
 *  named after the account, so a college's first visit to its Vault is not a
 *  form. The language is set by staff afterwards (it decides which tongue the
 *  spoken layer greets in). */
export async function ensureBlueprint(
  sb: SupabaseClient, account: Pick<CorporateAccount, "id" | "name">, byEmail: string | null,
): Promise<BlueprintRow | null> {
  const { data: existing } = await sb.from("campus_blueprints")
    .select("*").eq("account_id", account.id).neq("status", "closed")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) return existing as BlueprintRow;
  const { data: created, error } = await sb.from("campus_blueprints").insert({
    account_id: account.id, name: account.name, created_by_email: byEmail,
  }).select("*").maybeSingle();
  if (error) console.error("[vault] could not open a blueprint:", error.message);
  return (created as BlueprintRow | null) ?? null;
}

export const vaultPath = (slug: string, docId: string, ext: string, sessionOnly = false) => `${sessionOnly ? "vault-private" : "vault"}/${slug}/${docId}.${ext}`;

export type VaultDocumentRow = {
  id: string; blueprint_id: string; account_id: string; kind: VaultKind; title: string;
  path: string | null; content_type: string | null; bytes: number | null; body: string | null;
  source: "upload" | "meeting" | "staff"; observed_on: string | null;
  uploaded_by_email: string | null; uploaded_by_name: string | null;
  created_at: string; deleted_at: string | null;
  image_notes?: ImageNotes | null; parent_document_id?: string | null; upload_key?: string | null;
};

export type VaultDocument = {
  id: string; kind: VaultKind; title: string; source: string; observedOn: string | null;
  contentType: string | null; bytes: number | null; body: string | null;
  canAddAudio?: boolean; imageNotes?: ImageNotes | null; parentDocumentId?: string | null;
  url: string | null; isImage: boolean; uploadedBy: string | null; createdAt: string;
};

export type VaultWalk = {
  id: string; walker: string | null; where: string | null; status: string;
  startedAt: string; endedAt: string | null; summary: string; marks: number;
  transcript: { done: number; total: number; complete: boolean };
  pieces: { seq: number; seconds: number | null; videoUrl: string | null; transcript: string | null; transcriptError: string | null }[];
  walls: { seq: number; walkSeconds: number; stillUrl: string | null; label: string | null }[];
};

export type VaultLink = {
  id: string; ref: string; recipient: string | null; brief: string | null;
  expiresAt: string; revokedAt: string | null; openedAt: string | null; lastSeenAt: string | null;
  createdAt: string; walks: number;
};

export type BlueprintWallRow = {
  id: string; blueprint_id: string; account_id: string; seq: number; name: string; location: string | null;
  source: "trace" | "upload" | "manual"; walk_id: string | null; mark_id: string | null;
  photo_path: string | null; photo_document_id: string | null; plan_document_id: string | null;
  width_mm: number | null; height_mm: number | null; size_source: "spoken" | "plan" | "measured" | null;
  size_estimated: boolean; brief: string | null; status: "candidate" | "dropped"; notes: string | null;
  /** The wall plane on the photograph, found once by Prism and kept (migration 20261012141040). */
  quad_json: unknown | null;
  created_by_email: string | null; created_at: string; updated_at: string;
};

export type PulseWall = {
  id: string; seq: number; name: string; location: string | null; source: string;
  photoUrl: string | null; photoDocumentId: string | null; planDocumentId: string | null;
  widthMm: number | null; heightMm: number | null; sizeSource: "spoken" | "plan" | "measured" | null;
  brief: string | null; dropped: boolean; readiness: WallReadiness;
};

export type Pulse = { readiness: BlueprintReadiness; walls: PulseWall[]; status: BlueprintStatus };

/** The Pulse board: every wall with its four facts, and whether Prism may
 *  start. Also moves the Blueprint's status forward (or back) to match. */
export async function loadPulse(sb: SupabaseClient, blueprint: BlueprintRow): Promise<Pulse> {
  const { data: rows } = await sb.from("blueprint_walls").select("*").eq("blueprint_id", blueprint.id).order("seq");
  const walls = (rows ?? []) as BlueprintWallRow[];
  const facts: WallFacts[] = walls.map((w) => ({
    id: w.id, name: w.name, location: w.location, photo: Boolean(w.photo_path),
    widthMm: w.width_mm, heightMm: w.height_mm, sizeSource: w.size_source,
    plan: Boolean(w.plan_document_id), brief: w.brief, dropped: w.status === "dropped",
  }));
  const readiness = blueprintReadiness(facts);
  const status = pulseStatus(blueprint.status as BlueprintStatus, readiness);
  if (status !== blueprint.status) {
    await sb.from("campus_blueprints").update({ status, updated_at: new Date().toISOString() }).eq("id", blueprint.id);
  }
  return {
    readiness, status,
    walls: await Promise.all(walls.map(async (w, i) => ({
      id: w.id, seq: w.seq, name: w.name, location: w.location, source: w.source,
      photoUrl: w.photo_path ? await signArt(sb, w.photo_path, DAY) : null,
      photoDocumentId: w.photo_document_id, planDocumentId: w.plan_document_id,
      widthMm: w.width_mm, heightMm: w.height_mm, sizeSource: w.size_source,
      brief: w.brief, dropped: w.status === "dropped", readiness: wallReadiness(facts[i]!),
    }))),
  };
}

/** Everything the Vault page shows, signed for a day so a page left open on a
 *  desk still plays its walk. */
export async function loadVault(sb: SupabaseClient, blueprint: BlueprintRow, uploaderEmail?: string): Promise<{
  documents: VaultDocument[]; walks: VaultWalk[]; links: VaultLink[];
}> {
  const [{ data: docRows }, { data: walkRows }, { data: linkRows }] = await Promise.all([
    sb.from("vault_documents").select("*").eq("blueprint_id", blueprint.id)
      .is("deleted_at", null).order("created_at", { ascending: false }).limit(400),
    sb.from("trace_walks").select("*").eq("blueprint_id", blueprint.id)
      .order("started_at", { ascending: false }).limit(100),
    sb.from("trace_links").select("*").eq("blueprint_id", blueprint.id)
      .order("created_at", { ascending: false }).limit(50),
  ]);

  const documents = await Promise.all(((docRows ?? []) as VaultDocumentRow[]).map(async (d) => ({
    canAddAudio: Boolean(uploaderEmail && d.image_notes && d.uploaded_by_email === uploaderEmail),
    imageNotes: d.image_notes ?? null, parentDocumentId: d.parent_document_id ?? null,
    id: d.id, kind: d.kind, title: d.title, source: d.source, observedOn: d.observed_on,
    contentType: d.content_type, bytes: d.bytes, body: d.body,
    url: d.path ? await signArt(sb, d.path, DAY) : null,
    isImage: Boolean(d.content_type?.startsWith("image/")),
    uploadedBy: d.uploaded_by_name ?? d.uploaded_by_email, createdAt: d.created_at,
  })));

  const walks = (walkRows ?? []) as TraceWalkRow[];
  const walkIds = walks.map((w) => w.id);
  const [{ data: segRows }, { data: markRows }] = walkIds.length
    ? await Promise.all([
        sb.from("trace_segments").select("*").in("walk_id", walkIds).order("seq"),
        sb.from("trace_marks").select("*").in("walk_id", walkIds).order("seq"),
      ])
    : [{ data: [] as TraceSegmentRow[] }, { data: [] as TraceMarkRow[] }];
  const segments = (segRows ?? []) as TraceSegmentRow[];
  const marks = (markRows ?? []) as TraceMarkRow[];

  const walksOut: VaultWalk[] = await Promise.all(walks.map(async (w) => {
    const segs = segments.filter((s) => s.walk_id === w.id);
    const wallMarks = marks.filter((m) => m.walk_id === w.id);
    const pieces: PieceSummary[] = segs.map((s) => ({
      seq: s.seq, seconds: s.seconds, hasVideo: Boolean(s.video_path),
      hasAudio: Boolean(s.audio_path), transcribed: Boolean(s.transcript),
    }));
    return {
      id: w.id, walker: w.walker_name, where: w.where_label, status: w.status,
      startedAt: w.started_at, endedAt: w.ended_at,
      summary: describeWalk({ pieces, marks: wallMarks.length }), marks: wallMarks.length,
      transcript: transcriptCoverage(pieces),
      pieces: await Promise.all(segs.map(async (s) => ({
        seq: s.seq, seconds: s.seconds,
        videoUrl: s.video_path ? await signArt(sb, s.video_path, DAY) : null,
        transcript: s.transcript, transcriptError: s.transcript_error,
      }))),
      walls: await Promise.all(wallMarks.map(async (m) => ({
        seq: m.seq, walkSeconds: Number(m.walk_seconds),
        stillUrl: m.still_path ? await signArt(sb, m.still_path, DAY) : null, label: m.label,
      }))),
    };
  }));

  const links: VaultLink[] = ((linkRows ?? []) as TraceLinkRow[]).map((l) => ({
    id: l.id, ref: l.ref, recipient: l.recipient_name ?? l.recipient_email, brief: l.brief,
    expiresAt: l.expires_at, revokedAt: l.revoked_at, openedAt: l.opened_at, lastSeenAt: l.last_seen_at,
    createdAt: l.created_at, walks: walks.filter((w) => w.link_id === l.id).length,
  }));

  return { documents, walks: walksOut, links };
}
