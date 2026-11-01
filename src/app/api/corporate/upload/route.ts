import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { imageMetaRemote } from "@/lib/media-client";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DAY, canonicalArtUrl, signArt } from "@/lib/corporate-files";
import { caUpload } from "@/lib/corporate-art-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 60 * 1024 * 1024; // 60 MB — corporate art is deliberately big

// Stores the corporate customer's artwork permanently in the corporate-art
// bucket and reports its true pixel size, so the portal can show an honest
// sharpness verdict for the wall BEFORE they commit to printing. The original
// is kept forever — a repeat print years later still has its source.
export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  // Agreement gate (0095): no mutations on an account that has not signed.
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is over 60 MB — please send a smaller export." }, { status: 413 });
  }

  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);
  let width: number | null = null, height: number | null = null;
  try {
    const meta = await imageMetaRemote(ab);
    width = meta.width ?? null;
    height = meta.height ?? null;
  } catch {
    return NextResponse.json({ error: "That file could not be read as an image." }, { status: 400 });
  }
  if (!width || !height) return NextResponse.json({ error: "Unknown image dimensions." }, { status: 400 });

  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  const path = `${session.account.slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await caUpload(path, buf, {
    contentType: file.type || "image/png",
    upsert: false,
  });
  if (up.error) {
    console.error("[corporate/upload]", up.error.message);
    return NextResponse.json({ error: "Upload failed — please try again." }, { status: 502 });
  }
  // `url` is the canonical REFERENCE we store and hand to the OS, which parses
  // the path back out and re-fetches with the service key. It is not fetchable
  // by a browser — the bucket is private — so the form gets a signed
  // `previewUrl` to render, or it would show a broken image on every upload.
  return NextResponse.json({
    ok: true,
    url: canonicalArtUrl(sb, path),
    previewUrl: await signArt(sb, path, DAY),
    width, height, name: file.name,
  });
}
