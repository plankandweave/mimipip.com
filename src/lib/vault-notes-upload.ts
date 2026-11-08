import "server-only";
import type { SupabaseClient } from "@/brand/database-types";
import type { CorporateSession } from "./corporate-auth";
import { can, sessionActor } from "./corporate-auth";
import { caSignedUploadUrl } from "./corporate-art-store";
import {
  audioType,
  imageNotesEnabled,
  isPicture,
  MAX_AUDIO_BYTES,
  parseImageNotes,
  validUploadKey,
} from "./vault-image-notes";
import {
  MAX_VAULT_FILE_BYTES,
  vaultFileExtension,
  vaultStoredType,
  guessVaultKind,
  titleFromFileName,
} from "./vault-kinds";
import { vaultPath } from "./vault";

/** Own immutable upload only: no wall editing or provider calls. */
export async function prepareNotesUpload(
  sb: SupabaseClient,
  session: CorporateSession,
  blueprintId: string,
  b: Record<string, unknown>,
) {
  const fail = (error: string, status = 400) =>
    Response.json({ ok: false, error }, { status });
  if (!imageNotesEnabled(session.account.slug) || !can(session, "vault_upload"))
    return fail("Upload not permitted.", 403);
  if (!validUploadKey(b.uploadKey))
    return fail("A fresh upload reference is required.");
  const audio = b.action === "audio-sign";
  const name = String(b.fileName ?? ""),
    type = String(b.contentType ?? "");
  const audioFormat = audio ? audioType(type, name) : null;
  const ext = audio ? audioFormat?.ext : vaultFileExtension(type, name);
  if (!ext)
    return fail(
      audio
        ? "Choose MP3, M4A, WAV, OGG or WebM audio."
        : "Unsupported file type.",
    );
  const bytes = Number(b.bytes),
    max = audio ? MAX_AUDIO_BYTES : MAX_VAULT_FILE_BYTES;
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > max)
    return fail(
      audio
        ? "Choose audio between 1 byte and 12 MB."
        : "Choose a file between 1 byte and 120 MB.",
      413,
    );
  let notes = null;
  if (!audio && isPicture(ext)) {
    try {
      notes = parseImageNotes(b.imageNotes);
    } catch (e) {
      return fail((e as Error).message);
    }
  }
  let parentId: string | null = null;
  if (audio) {
    const { data: parent, error } = await sb
      .from("vault_documents")
      .select("id,image_notes,uploaded_by_email")
      .eq("id", String(b.parentId ?? ""))
      .eq("account_id", session.account.id)
      .eq("blueprint_id", blueprintId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !parent?.image_notes)
      return fail("Save a picture in this project first.", 404);
    if (parent.uploaded_by_email !== session.email)
      return fail("Audio can only be added to your own picture.", 403);
    parentId = parent.id;
  }
  const contentType = audioFormat?.type ?? vaultStoredType("", ext);
  const title = audio ? "Audio note" : titleFromFileName(name);
  // Deterministic id and ignoreDuplicates make retries/concurrent clicks the same slot.
  // The unique key also stops a repeated request from manufacturing duplicate rows.
  const id = b.uploadKey;
  const path = vaultPath(session.account.slug, id, ext, true);
  const { error: insertError } = await sb.from("vault_documents").upsert(
    {
      id,
      upload_key: id,
      blueprint_id: blueprintId,
      account_id: session.account.id,
      kind: audio ? "other" : guessVaultKind(type, name),
      title,
      content_type: contentType,
      image_notes: notes,
      parent_document_id: parentId,
      path,
      source: session.staff ? "staff" : "upload",
      uploaded_by_email: session.email,
      uploaded_by_name: sessionActor(session).name,
      deleted_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (insertError)
    return fail("Could not prepare the upload. Retry this file.", 500);
  const { data: row, error } = await sb
    .from("vault_documents")
    .select("*")
    .eq("id", id)
    .eq("account_id", session.account.id)
    .eq("blueprint_id", blueprintId)
    .eq("uploaded_by_email", session.email)
    .maybeSingle();
  if (error || !row) return fail("That upload reference is unavailable.", 409);
  if (
    row.path !== path ||
    row.parent_document_id !== parentId ||
    JSON.stringify(
      row.image_notes ? parseImageNotes(row.image_notes) : null,
    ) !== JSON.stringify(notes)
  )
    return fail(
      "This upload reference belongs to different notes. Choose the file again.",
      409,
    );
  if (!row.deleted_at)
    return Response.json({ ok: true, id, complete: true, contentType });
  return Response.json({
    ok: true,
    id,
    contentType,
    signedUrl: caSignedUploadUrl(path, { upsert: true, ttlSeconds: 1800 })
      .signedUrl,
  });
}
