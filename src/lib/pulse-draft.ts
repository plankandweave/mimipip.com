import "server-only";
import type { SupabaseClient } from "@/brand/database-types";
import { partnerWorkflow } from "@/lib/ai-keys";
import { draftWallsFromWalkthrough } from "@/lib/walkthrough-draft";
import type { TranscriptSegment } from "@/lib/transcribe";
import type { BlueprintRow, TraceMarkRow, TraceSegmentRow, TraceWalkRow } from "@/lib/trace-link";

// ─── From a walk to candidate walls ─────────────────────────────────────────
//
// Every tap on a Trace walk is a wall somebody wanted. Once the walk has
// ended and its pieces have their words, the taps become rows on the Pulse
// board: one wall per tap, named from what was said around it, with the still
// as its photograph and anything spoken about size kept as a HINT
// (size_source 'spoken', never counted as measured — see lib/pulse.ts).
//
// Reuses the walkthrough drafter (lib/walkthrough-draft.ts), which already
// attaches sentences to taps by time and refuses to invent a dimension. The
// only new work is stitching the pieces into one timeline: piece n's words
// start where the pieces before it ended.
//
// Fails SOFT. A walk whose words are not there yet is drafted from its taps
// alone (named "Wall n", photo attached), and drafted again with names when
// the transcript arrives; a drafter that cannot be reached leaves draft_error
// on the walk and the next open of the Vault, or the next cron, tries again.

/** Draft the walls of one ended walk that have not been drafted yet.
 *  Idempotent per tap: a mark already holding a wall is never duplicated
 *  (unique index on blueprint_walls.mark_id). */
export async function draftWallsForWalk(sb: SupabaseClient, walkId: string): Promise<{ ok: boolean; created: number; error?: string }> {
  const { data: walkRow } = await sb.from("trace_walks").select("*").eq("id", walkId).maybeSingle();
  const walk = walkRow as TraceWalkRow | null;
  if (!walk) return { ok: false, created: 0, error: "no such walk" };
  if (walk.status !== "ended") return { ok: true, created: 0 };

  const [{ data: bpRow }, { data: accountRow }, { data: segRows }, { data: markRows }, { data: existing }] = await Promise.all([
    sb.from("campus_blueprints").select("*").eq("id", walk.blueprint_id).maybeSingle(),
    sb.from("corporate_accounts").select("slug").eq("id", walk.account_id).maybeSingle(),
    sb.from("trace_segments").select("*").eq("walk_id", walk.id).order("seq"),
    sb.from("trace_marks").select("*").eq("walk_id", walk.id).order("seq"),
    sb.from("blueprint_walls").select("mark_id, name").eq("blueprint_id", walk.blueprint_id).not("mark_id", "is", null),
  ]);
  const blueprint = bpRow as BlueprintRow | null;
  if (!blueprint) return { ok: false, created: 0, error: "the walk's project is gone" };
  const segments = (segRows ?? []) as TraceSegmentRow[];
  const marks = (markRows ?? []) as TraceMarkRow[];
  const taken = new Set(((existing ?? []) as { mark_id: string }[]).map((e) => e.mark_id));
  const pending = marks.filter((m) => !taken.has(m.id));
  if (pending.length === 0) {
    await sb.from("trace_walks").update({ drafted_at: new Date().toISOString(), draft_error: null }).eq("id", walk.id);
    return { ok: true, created: 0 };
  }

  // One timeline from many pieces: piece n's words start where the pieces
  // before it ended. A piece with no transcript contributes nothing but its
  // length, so the taps after it still land in the right place.
  let offset = 0;
  const timed: TranscriptSegment[] = [];
  const plain: string[] = [];
  for (const s of segments) {
    const json = Array.isArray(s.transcript_json) ? (s.transcript_json as { start: number; end: number; text: string }[]) : null;
    if (json?.length) {
      for (const t of json) timed.push({ start: offset + Number(t.start), end: offset + Number(t.end), text: String(t.text) });
    } else if (s.transcript) {
      plain.push(s.transcript);
    }
    offset += s.seconds ?? 0;
  }
  const transcript = timed.length ? timed.map((t) => t.text).join(" ") : plain.join("\n");

  // Names from the words where there are words; plain numbers where there
  // are not, so a walk whose transcription failed still lands on the board.
  let names = new Map<number, { name: string; brief: string | null; widthMm: number | null; heightMm: number | null }>();
  let draftError: string | null = null;
  if (transcript.trim()) {
    const draft = await draftWallsFromWalkthrough({
      buildingName: blueprint.name,
      areaLabel: walk.where_label ?? "the campus",
      transcript,
      segments: timed.length ? timed : undefined,
      marks: pending.map((m) => ({ seq: m.seq, atSeconds: Number(m.walk_seconds) })),
      workflow: partnerWorkflow((accountRow as { slug?: string } | null)?.slug ?? null),
    });
    if (draft.ok) names = new Map(draft.marks.map((d) => [d.seq, d]));
    else draftError = draft.error;
  } else {
    draftError = "no words transcribed yet; walls named by number";
  }

  const { data: last } = await sb.from("blueprint_walls").select("seq").eq("blueprint_id", blueprint.id)
    .order("seq", { ascending: false }).limit(1);
  let seq = ((last?.[0]?.seq as number | undefined) ?? 0);
  let created = 0;
  for (const m of pending) {
    const d = names.get(m.seq);
    seq += 1;
    const { error } = await sb.from("blueprint_walls").insert({
      blueprint_id: blueprint.id, account_id: walk.account_id, seq,
      name: d?.name ?? `Wall ${m.seq}${walk.where_label ? ` · ${walk.where_label}` : ""}`,
      location: walk.where_label, source: "trace", walk_id: walk.id, mark_id: m.id,
      photo_path: m.still_path,
      width_mm: d?.widthMm ?? null, height_mm: d?.heightMm ?? null,
      size_source: d?.widthMm != null && d?.heightMm != null ? "spoken" : null,
      size_estimated: d?.widthMm != null && d?.heightMm != null,
      brief: d?.brief ?? null,
      created_by_email: null,
    });
    if (error) {
      if (/duplicate key/i.test(error.message)) { seq -= 1; continue; }
      console.error("[pulse-draft] insert failed:", error.message);
      draftError = draftError ?? error.message;
      seq -= 1;
      continue;
    }
    created++;
  }
  await sb.from("trace_walks").update({
    // A walk drafted by number is drafted again when its words arrive, so
    // drafted_at is only set once the names were real.
    drafted_at: names.size ? new Date().toISOString() : null,
    draft_error: draftError,
  }).eq("id", walk.id);
  return { ok: !draftError, created, error: draftError ?? undefined };
}

/** Every ended walk of a Blueprint that still owes the board its walls. */
export async function draftPendingWalks(sb: SupabaseClient, blueprintId: string): Promise<number> {
  const { data } = await sb.from("trace_walks").select("id, drafted_at").eq("blueprint_id", blueprintId)
    .eq("status", "ended").is("drafted_at", null).limit(10);
  let created = 0;
  for (const w of data ?? []) {
    const r = await draftWallsForWalk(sb, w.id as string);
    created += r.created;
  }
  return created;
}
