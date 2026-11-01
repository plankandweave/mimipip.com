import { supabaseAdmin } from "@/lib/supabase-admin";
import { imageNotesEnabled, MAX_AUDIO_BYTES } from "@/lib/vault-image-notes";
import { NextRequest, NextResponse } from "next/server";
import { can, currentCorporateSession } from "@/lib/corporate-auth";
import { MAX_VAULT_FILE_BYTES } from "@/lib/vault-kinds";
import { verifyUploadToken } from "@/lib/upload-token";
import { putProductImage, productImageExists } from "@/lib/product-images-store";
import { caUpload } from "@/lib/corporate-art-store";
import { privateBucket } from "@/lib/r2-media";
import { CACHE_IMMUTABLE, CACHE_MUTABLE } from "@/lib/storage-body";
import { presUpload } from "@/lib/presentation-store";
import { MAX_VIDEO_BYTES, VIDEO_TYPES, extOf } from "@/lib/presentation-format";

export const runtime = "nodejs";

// Byte intake for browser uploads into `product-images` — what
// `uploadToSignedUrl` against Supabase Storage used to be. The signers
// (/api/admin/sign-upload, /api/custom-upload action:"sign") mint a
// one-path token; this route only ever writes where that token says.
//
// The bytes flow browser → this Worker → R2 binding. The old "body must not
// pass through a route" constraint was Vercel's ~4.5MB cap; the Worker takes
// request bodies far beyond the largest print flat.

/** Admin design flats are print-resolution; customers' phone photos are 25MB
 *  capped upstream. This is the absolute backstop, not the UX limit. */
const MAX_BYTES = 300 * 1024 * 1024;

export async function PUT(req: NextRequest) {
  // Header for the product-images clients (signed-upload.ts); query for the
  // corporate-art flows, whose sign→PUT→commit browser contract is a bare
  // `fetch(signedUrl, {method:"PUT"})` with only a Content-Type — the token
  // rides in the signedUrl itself, exactly as Supabase's did.
  const token = req.headers.get("x-upload-token") ?? req.nextUrl.searchParams.get("token") ?? "";
  const claims = verifyUploadToken(token);
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const privateVault = claims.bucket === "corporate-art" && claims.path.startsWith("vault-private/");
  let vaultAudio = false;
  let immutableVaultType: string | null = null;
  if (privateVault) {
    const session = await currentCorporateSession({ allowVaultUploadOnly: true });
    if (!session || session.agreementPending || !can(session, "vault_upload") || session.account.slug !== claims.path.split("/")[1])
      return NextResponse.json({ error: "Account-private Vault upload." }, { status: 403 });
    if (imageNotesEnabled(session.account.slug)) {
      const sb = supabaseAdmin();
      const {data:slot,error} = sb ? await sb.from("vault_documents").select("uploaded_by_email,deleted_at,parent_document_id,upload_key,content_type")
        .eq("path",claims.path).eq("account_id",session.account.id).maybeSingle() : {data:null,error:true};
      if(error || !slot || slot.uploaded_by_email !== session.email) return NextResponse.json({error:"Upload not yours."},{status:403});
      if(slot.upload_key && !slot.deleted_at) return NextResponse.json({error:"Already saved."},{status:409});
      vaultAudio = Boolean(slot.parent_document_id);
      if (slot.upload_key) immutableVaultType = slot.content_type || "application/octet-stream";
    }
  }
  const limit = vaultAudio ? MAX_AUDIO_BYTES : privateVault ? MAX_VAULT_FILE_BYTES : MAX_BYTES;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > limit) return NextResponse.json({ error: "too_large" }, { status: 413 });

  if (claims.bucket === "presentations") {
    // A client film (the presentation route's `step: "sign"`). The path is a
    // fresh uuid the server minted; the type is decided by its extension, not
    // by what the browser claims, and the size limit is the film's own.
    const type = VIDEO_TYPES[extOf(claims.path)];
    if (!type) return NextResponse.json({ error: "bad_format" }, { status: 415 });
    if (declared > MAX_VIDEO_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
    const film = await req.arrayBuffer();
    if (film.byteLength === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
    if (film.byteLength > MAX_VIDEO_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
    // upsert:false — the token can only ever create its one object.
    const up = await presUpload(claims.path, film, { contentType: type, upsert: false });
    if (up.error) {
      const taken = /already exists/i.test(up.error.message);
      return NextResponse.json({ error: taken ? "exists" : up.error.message }, { status: taken ? 409 : 502 });
    }
    return NextResponse.json({ ok: true, path: claims.path });
  }

  const exists = async () =>
    claims.bucket === "corporate-art"
      ? !!(await (await privateBucket())?.head(`corporate-art/${claims.path}`))
      : await productImageExists(claims.path);
  if (!claims.upsert && (await exists())) {
    // Mirrors storage's `upsert:false` conflict — a NEW admin design must
    // never land on an existing key (see upload-paths.ts).
    return NextResponse.json({ error: "exists" }, { status: 409 });
  }

  const body = await req.arrayBuffer();
  if (body.byteLength === 0) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (body.byteLength > limit) return NextResponse.json({ error: "too_large" }, { status: 413 });

  if (immutableVaultType) {
    // Atomic create-only write: an overlapping PUT that passed the pending
    // row check cannot replace bytes after another PUT or commit completes.
    const bucket = await privateBucket();
    if (!bucket) return NextResponse.json({ error: "Private storage unavailable." }, { status: 503 });
    try {
      const stored = await bucket.put(`corporate-art/${claims.path}`, body, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: immutableVaultType, cacheControl: CACHE_MUTABLE },
      });
      if (!stored) return NextResponse.json({ error: "exists" }, { status: 409 });
      return NextResponse.json({ ok: true, path: claims.path });
    } catch {
      return NextResponse.json({ error: "Upload interrupted. Retry." }, { status: 502 });
    }
  }

  const contentType = req.headers.get("content-type") || "application/octet-stream";
  if (claims.bucket === "corporate-art") {
    // Private-store intake. These keys are fixed, upserted slots (a wall's
    // photo, a study's render) — the mutable class in storage-body.ts's split.
    const up = await caUpload(claims.path, body, {
      contentType,
      upsert: claims.upsert,
      cacheControl: CACHE_MUTABLE,
    });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 502 });
    return NextResponse.json({ ok: true, path: claims.path });
  }
  // Every signed path is content-addressed, UUID- or timestamp-named — the
  // immutable class in storage-body.ts's split.
  await putProductImage(claims.path, body, { contentType, cacheControl: CACHE_IMMUTABLE });

  return NextResponse.json({ ok: true, path: claims.path });
}
