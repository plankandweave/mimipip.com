import { NextResponse } from "next/server";
import { staffKey } from "@/lib/staff-key";
import { imageMetaRemote } from "@/lib/media-client";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "print-masters";
/** 8 ft in inches — the reference wall print_source_dpi is measured against. */
const REFERENCE_IN = 96;
/** Long enough to push a several-hundred-megabyte Topaz export over a home
 *  connection, short enough that the URL is not a standing write hole. */
const UPLOAD_TTL_S = 60 * 60;

/**
 * The hand-made master path.
 *
 * Most designs get their print master built automatically by the engine's
 * Real-ESRGAN cascade. Some should not: on artwork with fine painterly texture
 * or unusual media, the model smooths what it cannot recover and the result
 * looks synthetic in a client's hand at 30 cm. Those designs are marked
 * 'manual' — which permanently excludes them from automatic builds — and get a
 * master made by hand in Topaz Gigapixel instead.
 *
 * Three steps, because a multi-hundred-megabyte file should not be proxied
 * through a Next route:
 *   mark-manual  — flag the design so no automatic build ever overwrites the
 *                  careful hand work
 *   sign-upload  — get a signed URL and PUT the Topaz export straight to storage
 *   commit       — measure what landed and record it as the design's master
 *
 * Admin-key gated and service-role backed: `print-masters` is private with no
 * policies, so the anon key cannot read or write it at all.
 */

type Body = { key?: unknown; action?: unknown; handle?: unknown };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;

  const { data: ok } = await supabase.rpc("admin_key_ok", { p_key: await staffKey(req) });
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "service_role_not_configured" }, { status: 503 });
  }

  const action = typeof body?.action === "string" ? body.action : "";
  const handle = typeof body?.handle === "string" ? body.handle.trim() : "";
  if (!handle) return NextResponse.json({ error: "missing_handle" }, { status: 400 });

  // The handle becomes a storage path, so it must not be able to climb out of
  // masters/ and overwrite something else in the bucket.
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(handle)) {
    return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  }

  const { data: product } = await supabase
    .from("products")
    .select("handle, master_status")
    .eq("handle", handle)
    .maybeSingle();
  if (!product) return NextResponse.json({ error: "unknown_design" }, { status: 404 });

  const path = `masters/${handle}.jpg`;

  if (action === "mark-manual") {
    // Deliberately a straight write, not an RPC: this is the one transition
    // that must be able to override 'none'/'building'/'ready' — the point is to
    // take a design OUT of the automatic pipeline whatever state it is in.
    const { error } = await admin
      .from("products")
      .update({ master_status: "manual" })
      .eq("handle", handle);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ handle, masterStatus: "manual" });
  }

  if (action === "sign-upload") {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "sign_failed" }, { status: 500 });
    }
    return NextResponse.json({
      handle,
      path,
      signedUrl: data.signedUrl,
      token: data.token,
      expiresInSeconds: UPLOAD_TTL_S,
      // The upload is a PUT of the raw file bytes to signedUrl.
      contentType: "image/jpeg",
    });
  }

  if (action === "commit") {
    // Measure what actually landed rather than trusting a caller-supplied size:
    // print_source_dpi decides whether this design is treated as print-ready, so
    // a wrong number here would let a soft master through as though it were fine.
    //
    // Masters run to hundreds of megapixels, so the bytes never pass through
    // this route (workerd could not hold them anyway): the media container
    // fetches a short-lived signed URL itself and reports the dimensions, and
    // the object's stat gives existence and size without a download.
    const { data: stat, error: statErr } = await admin.storage.from(BUCKET).info(path);
    if (statErr || !stat) {
      return NextResponse.json(
        { error: "no_master_uploaded", detail: statErr?.message ?? `nothing at ${path}` },
        { status: 400 },
      );
    }
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 15 * 60);
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: "no_master_uploaded", detail: signErr?.message ?? `could not sign ${path}` },
        { status: 400 },
      );
    }
    const meta = await imageMetaRemote({ url: signed.signedUrl });
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) {
      return NextResponse.json({ error: "unreadable_master" }, { status: 400 });
    }

    // Short edge, not long: walls are ~8 ft tall, so the short edge is what
    // gets stretched over the height and therefore what limits sharpness.
    const dpi = Math.round(Math.min(w, h) / REFERENCE_IN);

    const { error } = await supabase.rpc("set_print_master", {
      p_handle: handle,
      p_path: path,
      p_dpi: dpi,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      handle,
      path,
      widthPx: w,
      heightPx: h,
      dpiAtReference: dpi,
      masterStatus: "ready",
      sizeMb: Math.round((Number(stat.size ?? 0) / 1024 / 1024) * 10) / 10,
      // Surfaced rather than enforced: a hand-made master is a deliberate human
      // decision, and the operator may knowingly accept a lower DPI for artwork
      // that cannot go higher. They should just never do it unknowingly.
      warning: dpi < 100 ? `master is ${dpi} DPI at 8 ft — below the 100 DPI print minimum` : null,
    });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
