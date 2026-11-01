import { NextRequest } from "next/server";
import { presVerify, parseRange } from "@/lib/presentation-sign";
import { presHead, presObject } from "@/lib/presentation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signed serving for the PRIVATE presentations store — what Supabase's
// /storage/v1/object/sign/presentations/... URL used to be. Every link is
// minted server-side by presSignedUrl (lib/presentation-store.ts) after the
// caller's own access check (staff key, invite token, portal session); the
// HMAC covers the path and the expiry, so a link opens exactly one object
// until exactly then, the same bearer-URL trust storage's token gave.
//
// Bytes come from the R2 binding, so a deck's pictures and a film's Range
// requests cost no storage egress however often they are opened.
//
// NEVER A DOCUMENT OF OURS. A stored deck is arbitrary uploaded HTML; served
// plainly from this origin its scripts would be same-origin with zyvorah.com.
// So everything here carries `sandbox` (an opaque origin, no scripts) and
// anything that is not a picture or a film is an attachment. Decks are read
// through their own gated frame routes, never through this one.
//
// CORS is open, as storage's was: the studio's wall-mask editor draws these
// pictures onto a canvas, and a deck's frame is an opaque origin. The URL is
// the credential — there is no cookie for a foreign page to ride.

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await context.params;
  let key: string;
  try {
    key = (path ?? []).map(decodeURIComponent).join("/");
  } catch {
    return new Response("Not found.", { status: 404 });
  }
  if (!key || key.split("/").includes("..")) return new Response("Not found.", { status: 404 });

  const q = request.nextUrl.searchParams;
  const exp = Number(q.get("exp") ?? 0);
  const sig = q.get("sig") ?? "";
  if (!Number.isFinite(exp) || exp * 1000 < Date.now() || !sig || !presVerify(key, exp, sig)) {
    return new Response("Forbidden.", { status: 403 });
  }

  let head: Awaited<ReturnType<typeof presHead>>;
  try {
    head = await presHead(key);
  } catch (e) {
    console.error("[files/presentations] read failed:", key, (e as Error)?.message);
    return new Response("Storage unavailable.", { status: 503 });
  }
  if (!head) return new Response("Not found.", { status: 404 });

  const inline = /^(image|video)\//.test(head.contentType);
  const headers: Record<string, string> = {
    "content-type": head.contentType,
    // Private, like every other gated file route here. (The platform turns
    // any private policy into no-store; re-reads come from R2 and are free.)
    "cache-control": "private, no-store",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
    "access-control-allow-origin": "*",
    "referrer-policy": "no-referrer",
    ...(inline ? {} : { "content-disposition": "attachment" }),
  };

  const range = parseRange(request.headers.get("range"), head.size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${head.size}` } });
  }

  const object = await presObject(key, range ?? undefined);
  if (!object) return new Response("Not found.", { status: 404 });

  if (range) {
    return new Response(object.body, {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(range.length),
        "content-range": `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`,
      },
    });
  }
  return new Response(object.body, { headers: { ...headers, "content-length": String(head.size) } });
}
