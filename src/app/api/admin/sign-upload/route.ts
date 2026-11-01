import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildUploadPath } from "@/lib/upload-paths";
import { staffKey } from "@/lib/staff-key";
import { mintUploadToken } from "@/lib/upload-token";
import { productImagePublicUrl } from "@/lib/product-images-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Signed upload URLs for the two staff uploaders, so neither needs write
 * access to `product-images` as `anon`.
 *
 * Both /studio and /admin/designs used to upload straight from the browser
 * with the anon key. That only worked because the bucket's insert/update
 * policies applied to PUBLIC with no path scope — which meant the anon key
 * shipped in every page's JS could also OVERWRITE any live catalogue image.
 * Cloudflare Access gates those PAGES, but Supabase never sees a session, so
 * the bucket was open to anyone who read the JS. This is the same three-step
 * shape /api/admin/print-master already uses for `print-masters`:
 * sign here with the service role, PUT the bytes straight to storage.
 *
 * The bytes still never pass through this route — a print-resolution flat is
 * far over Vercel's ~4.5MB request-body cap, which is why these uploads went
 * direct in the first place.
 *
 * THE PATH IS BUILT HERE, NEVER ACCEPTED. A caller-supplied key is precisely
 * how you would climb out of the upload folders and sign a write over
 * `<design>/hero.jpg`. Callers send intent; the shapes below are the only
 * paths this route will ever sign.
 */

/** Long enough for a big flat over a home connection, short enough that a
 *  leaked URL is not a standing write hole. Mirrors print-master's window. */
const UPLOAD_TTL_S = 60 * 60;

type Body = { key?: unknown; kind?: unknown; ext?: unknown; hash?: unknown; folder?: unknown };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  // Through the one reader like every other admin route. This route always
  // took the key from the JSON body, which is fine — a POST body does not land
  // in logs, Referer headers or history the way `?key=` did — but going
  // through readAdminKey means the header works here too, so there is one
  // answer to "how does a staff caller authenticate" rather than two.
  const { data: ok } = await supabase.rpc("admin_key_ok", {
    p_key: await staffKey(req),
  });
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // The path is BUILT, never accepted — see lib/upload-paths and its test.
  const target = buildUploadPath(body);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: 400 });

  // R2 migration: the token authorises a PUT to /api/media-upload for this
  // one path — same one-path/one-hour shape the Supabase signed URL had.
  let token: string;
  try {
    token = mintUploadToken(target.path, { upsert: target.upsert, ttlSeconds: UPLOAD_TTL_S });
  } catch {
    return NextResponse.json({ error: "signing_not_configured" }, { status: 503 });
  }

  return NextResponse.json({
    path: target.path,
    token,
    publicUrl: productImagePublicUrl(target.path),
    expiresInSeconds: UPLOAD_TTL_S,
  });
}
