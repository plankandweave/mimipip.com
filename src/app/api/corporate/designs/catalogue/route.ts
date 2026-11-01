import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { can, currentCorporateSession, recordAudit } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { caUpload } from "@/lib/corporate-art-store";
import { canonicalArtUrl } from "@/lib/corporate-files";
import { getProductByHandle } from "@/lib/queries";
import { searchProducts } from "@/lib/concierge-tools";
import { mediaRendition, toMediaUrl } from "@/lib/media-url";
import { duplicateMessage, liveDuplicate, sha256Hex } from "@/lib/design-fingerprint";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Put a WEBSITE design into a client's library.
 *
 * GET  ?q=…                → search the catalogue, to pick from
 * POST { handles, material } → add those designs to this account's library
 *
 * The point of it, in Roheena's words: "pricing based on the design it is, and
 * all designs are on the website". A library entry added here carries the
 * product handle and the material, so a quote can price it as that design off
 * the live catalogue rather than at the account's commissioned rate.
 *
 * WHY THE IMAGE IS COPIED RATHER THAN LINKED. corporate_designs.design_url must
 * resolve inside the private corporate-art bucket — the watermarking proxy
 * (/api/corporate/designs/[id]/image) matches on exactly that path and refuses
 * anything else, which is what stops a design URL becoming a way to serve an
 * arbitrary image through our watermark. So the product's own picture is copied
 * in once, at the moment of choosing.
 *
 * That copy is DISPLAY ONLY, and it is deliberate rather than lazy: the library
 * should keep showing what was chosen even if the catalogue image is later
 * recropped, while price and print both resolve live through product_handle.
 * The copy is never a print master — see print_source_url, which stays null.
 */

const MAX_ADD = 24;

/** The image to show for a product: its featured flat, else its first flat,
 *  else whatever it has. A flat is the artwork; a scene is a room with the
 *  artwork somewhere in it, which is not what a library tile should hold. */
function pickImage(images: { url: string; is_flat?: boolean | null; is_featured?: boolean | null; position?: number | null }[]) {
  const flats = images.filter((i) => i.is_flat);
  const pool = flats.length ? flats : images;
  return pool.find((i) => i.is_featured) ?? pool.slice().sort(
    (a, b) => (a.position ?? 99) - (b.position ?? 99),
  )[0] ?? null;
}

export async function GET(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease || !partnerCapabilities(session.account).customLibrary) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  if (!can(session, "upload")) {
    return NextResponse.json({ error: "You can't add designs to this library." }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] });

  try {
    const found = await searchProducts(q, 12);
    return NextResponse.json({
      ok: true,
      results: found.map((p) => ({
        handle: p.handle,
        title: p.title,
        // Search-result card: the 480 px rendition, not the 2–3 MB master (see
        // /api/corporate/catalogue for the 28 Sep 2026 broken-tiles incident).
        imageUrl: p.image ? mediaRendition(toMediaUrl(p.image), 480) : null,
      })),
    });
  } catch (e) {
    console.error("[designs/catalogue] search failed:", e);
    return NextResponse.json({ error: "Could not search the catalogue." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease || !partnerCapabilities(session.account).customLibrary) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  if (session.agreementPending) {
    return NextResponse.json({ error: "agreement_required" }, { status: 403 });
  }
  if (!can(session, "upload")) {
    return NextResponse.json({ error: "You can't add designs to this library." }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  let b: { handles?: string[]; material?: string; series?: string };
  try { b = await req.json(); } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const handles = [...new Set((Array.isArray(b.handles) ? b.handles : []).map(String))].slice(0, MAX_ADD);
  if (handles.length === 0) return NextResponse.json({ error: "Choose at least one design." }, { status: 400 });
  const series = String(b.series ?? "").trim().slice(0, 120) || null;
  const wantedMaterial = String(b.material ?? "").trim().toLowerCase() || null;

  const results: { handle: string; ok: boolean; error?: string }[] = [];
  let added = 0;

  for (const handle of handles) {
    try {
      const product = await getProductByHandle(handle);
      if (!product) { results.push({ handle, ok: false, error: "no longer on the website" }); continue; }

      // The material decides the price, so it must exist ON this design rather
      // than being assumed — the same artwork is a different rate on linen and
      // on self-adhesive, and not every design offers every material.
      const materials = (product.product_materials ?? []) as {
        available?: boolean | null;
        materials?: { slug?: string; coming_soon?: boolean | null } | null;
      }[];
      const usable = materials.filter((m) => m.available !== false && m.materials?.slug && !m.materials.coming_soon);
      const chosen = wantedMaterial
        ? usable.find((m) => m.materials?.slug === wantedMaterial)
        : usable[0];
      if (!chosen?.materials?.slug) {
        results.push({
          handle, ok: false,
          error: wantedMaterial ? `not offered on ${wantedMaterial}` : "no material available",
        });
        continue;
      }

      const image = pickImage((product.product_images ?? []) as never[]);
      if (!image?.url) { results.push({ handle, ok: false, error: "has no artwork to show" }); continue; }

      // Already in this library? Adding it twice would put the same design in
      // the picker twice and study it twice on one wall.
      const { data: existing } = await sb.from("corporate_designs")
        .select("id").eq("account_id", session.account.id)
        .eq("product_handle", handle).neq("status", "archived").maybeSingle();
      if (existing) { results.push({ handle, ok: false, error: "already in the library" }); continue; }

      const res = await fetch(image.url);
      if (!res.ok) { results.push({ handle, ok: false, error: "artwork could not be fetched" }); continue; }
      const bytes = Buffer.from(await res.arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      const dup = await liveDuplicate(sb, session.account.id, sha256);
      if (dup) { results.push({ handle, ok: false, error: duplicateMessage(dup) }); continue; }
      const ext = (image.url.split("?")[0].split(".").pop() ?? "jpg").toLowerCase().slice(0, 4);
      const path = `${session.account.slug}/library/catalogue/${handle}.${/^(jpe?g|png|webp)$/.test(ext) ? ext : "jpg"}`;

      const up = await caUpload(
        path, bytes,
        { contentType: res.headers.get("content-type") ?? "image/jpeg", upsert: true, cacheControl: CACHE_MUTABLE },
      );
      if (up.error) {
        console.error("[designs/catalogue] copy failed:", handle, up.error.message);
        results.push({ handle, ok: false, error: "artwork could not be saved" });
        continue;
      }

      const { error } = await sb.from("corporate_designs").insert({
        account_id: session.account.id,
        title: product.title,
        design_url: canonicalArtUrl(sb, path),
        series_name: series,
        product_handle: handle,
        product_material_slug: chosen.materials.slug,
        status: "approved",
        uploaded_by: session.email,
        content_sha256: sha256,
        byte_size: bytes.byteLength,
      });
      if (error) {
        console.error("[designs/catalogue] insert failed:", handle, error.message);
        results.push({ handle, ok: false, error: "could not be added" });
        continue;
      }
      results.push({ handle, ok: true });
      added++;
    } catch (e) {
      console.error("[designs/catalogue]", handle, e);
      results.push({ handle, ok: false, error: "could not be added" });
    }
  }

  if (added) {
    await recordAudit(session, "design.catalogue_add", null, { added, series });
  }
  // 200 even on a partial add: the caller names the ones that failed rather
  // than throwing away the ones that worked.
  return NextResponse.json({ ok: added > 0, added, results });
}
