import { currentCorporateSession } from "@/lib/corporate-auth";
import { canReadPartnerDocuments } from "@/lib/partner-documents";
import { privateWorkspaceSession } from "@/lib/partner-private-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextRequest, NextResponse } from "next/server";
import { caVerify } from "@/lib/corporate-art-store";
import { privateBucket } from "@/lib/r2-media";
import { thumbnailBytesRemote } from "@/lib/media-client";
import { parseRange } from "@/lib/presentation-sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signed serving for the PRIVATE corporate-art store — what Supabase's
// /storage/v1/object/sign/... URL used to be. Every link is minted by
// caSignedUrl (lib/corporate-art-store.ts): the HMAC covers the path AND the
// dl/w options, so a view link cannot be edited into a download or resized
// one; expiry is checked here, not in the signature.
//
// `w` is signArtRender's replacement for Supabase's render CDN transform —
// the AI passes attach dozens of wall photos per request, and full-resolution
// photos are >100k image tokens. The downscale runs in the media container
// (sharp cannot run on workerd); if the container is down the ORIGINAL bytes
// are served instead: a heavier request beats a broken one.
//
// Deliberately no CORS wildcard: these are private documents, not storefront
// media.

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "download";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  const key = (path ?? []).map(decodeURIComponent).join("/");
  if (!key || key.split("/").includes("..")) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const q = request.nextUrl.searchParams;
  const exp = Number(q.get("exp") ?? 0);
  const sig = q.get("sig") ?? "";
  const dl = q.get("dl") ?? "";
  const w = q.get("w") ?? "";
  if (
    !Number.isFinite(exp) ||
    exp * 1000 < Date.now() ||
    !sig ||
    !caVerify(key, exp, dl, w, sig)
  ) {
    return new NextResponse("Forbidden.", { status: 403 });
  }

  // File-only Vault uploads remain account-private even if a signed URL is shared.
  const privateVault = key.startsWith("vault-private/");
  if (privateVault) {
    const session = await currentCorporateSession({ allowVaultUploadOnly: true });
    if (!session || session.agreementPending || session.account.slug !== key.split("/")[1])
      return new NextResponse("Account-private Vault document.", { status: 403 });
  }

  if (key.startsWith("partner-documents/")) {
    const session = await currentCorporateSession();
    if (!canReadPartnerDocuments(session, key.split("/")[1]))
      return new NextResponse("Partner-private document.", { status: 403 });
  }

  if (key.startsWith("partner-workspace/")) {
    const accountId = key.split("/")[1];
    let partner = false;
    try {
      const session = await privateWorkspaceSession();
      partner = session.account.id === accountId;
    } catch {}
    if (!partner) {
      // Signed print-source transport to the engine is permitted only after immutable PO acceptance.
      let releasedMaster = false;
      if (key.startsWith(`partner-workspace/${accountId}/masters/`)) {
        const sb = supabaseAdmin();
        if (sb) {
          const { data: options, error: oe } = await sb
            .from("partner_private_options")
            .select("id")
            .eq("account_id", accountId)
            .contains("specification", { masterImage: { path: key } });
          if (!oe)
            for (const option of options ?? []) {
              const { data: confirmation } = await sb
                .from("partner_private_confirmations")
                .select("id")
                .eq("account_id", accountId)
                .not("po_accepted_at", "is", null)
                .contains("option_ids", [option.id])
                .limit(1)
                .maybeSingle();
              if (confirmation) {
                releasedMaster = true;
                break;
              }
            }
        }
      }
      if (!releasedMaster)
        return new NextResponse("Partner-private file.", { status: 403 });
    }
  }

  const bucket = await privateBucket();
  if (!bucket) return new NextResponse("Storage unavailable.", { status: 503 });

  // Video and audio play by Range. A walk recorded on a phone is played back
  // in the Vault on a phone, and iOS Safari will not play a <video> whose
  // server answers a Range request with the whole file. Only a request that
  // ASKS for a range pays for the extra head; everything else keeps the one
  // read below (an image may still be resized there).
  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const head = await bucket.head(`corporate-art/${key}`);
    if (!head) return new NextResponse("Not found.", { status: 404 });
    const headType = head.httpMetadata?.contentType ?? "application/octet-stream";
    if (headType.startsWith("video/") || headType.startsWith("audio/")) {
      const rangeHeaders: Record<string, string> = {
        "content-type": headType,
        "cache-control": privateVault ? "private, no-store" : "private, max-age=300",
        "accept-ranges": "bytes",
        "x-content-type-options": "nosniff",
      };
      const range = parseRange(rangeHeader, head.size);
      if (range === "unsatisfiable") {
        return new NextResponse(null, { status: 416, headers: { ...rangeHeaders, "content-range": `bytes */${head.size}` } });
      }
      const media = await bucket.get(`corporate-art/${key}`, range ? { range } : undefined);
      if (!media) return new NextResponse("Not found.", { status: 404 });
      if (range) {
        return new NextResponse(media.body, {
          status: 206,
          headers: {
            ...rangeHeaders,
            "content-length": String(range.length),
            "content-range": `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`,
          },
        });
      }
      return new NextResponse(media.body, { headers: { ...rangeHeaders, "content-length": String(head.size) } });
    }
  }

  const object = await bucket.get(`corporate-art/${key}`);
  if (!object) return new NextResponse("Not found.", { status: 404 });

  const storedType =
    object.httpMetadata?.contentType ?? "application/octet-stream";
  if ((storedType.startsWith("video/") || storedType.startsWith("audio/")) && object.body) {
    // Streamed, not buffered: a three-minute phone video is tens of
    // megabytes, and it tells the player it may come back for a Range.
    return new NextResponse(object.body, {
      headers: {
        "content-type": storedType,
        "cache-control": privateVault ? "private, no-store" : "private, max-age=300",
        "accept-ranges": "bytes",
        "x-content-type-options": "nosniff",
        ...(object.size ? { "content-length": String(object.size) } : {}),
      },
    });
  }
  let bytes: ArrayBuffer | Buffer = await object.arrayBuffer();
  let contentType = storedType;

  const width = Math.round(Number(w));
  if (width > 0 && storedType.startsWith("image/")) {
    try {
      bytes = await thumbnailBytesRemote(bytes as ArrayBuffer, {
        width,
        quality: 80,
      });
      contentType = "image/jpeg";
    } catch (e) {
      // Container down or image unresizable — serve the original.
      console.error(
        "[files/corporate-art] resize failed, serving original:",
        key,
        (e as Error)?.message,
      );
    }
  }

  const headers: Record<string, string> = {
    "content-type": contentType,
    "cache-control": privateVault ? "private, no-store" : "private, max-age=300",
    "x-content-type-options": "nosniff",
  };
  if (dl) {
    headers["content-disposition"] =
      dl === "1"
        ? "attachment"
        : `attachment; filename="${sanitizeFilename(dl)}"`;
  }
  return new NextResponse(new Uint8Array(bytes as ArrayBuffer), { headers });
}
