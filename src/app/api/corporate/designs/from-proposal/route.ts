import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { can, currentCorporateSession, recordAudit } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CACHE_MUTABLE } from "@/lib/storage-body";
import { presDownload } from "@/lib/presentation-store";
import { caUpload } from "@/lib/corporate-art-store";
import { canonicalArtUrl } from "@/lib/corporate-files";
import { duplicateMessage, liveDuplicate, sha256Hex } from "@/lib/design-fingerprint";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Bring the directions we proposed into the client's own library.
 *
 * GET  → the directions on this account's proposals, and whether each is in
 * POST { optionIds } → copy their artwork in, one SERIES per direction
 *
 * A curated proposal is already organised the way a library wants to be: three
 * named directions, five designs each. "Bengal, Becoming" is a series. So the
 * import preserves that grouping rather than flattening fifteen images into an
 * undifferentiated pile — which is exactly what the library's contact sheet was
 * built to avoid.
 *
 * THESE ARE COMMISSIONED, and product_handle stays NULL to say so. They were
 * drawn for this client and exist nowhere on the website, so they price at the
 * account's own rate (₹300 incl GST) rather than as a catalogue design. If one
 * of them later becomes a website design, it is added again from the catalogue
 * and priced as itself — the two are different rows because they are genuinely
 * different things to buy.
 *
 * THE COPY IS NECESSARY, not lazy. Proposal artwork lives in the `presentations`
 * bucket; the watermarking proxy that serves every library image resolves paths
 * inside `corporate-art` and refuses anything else — which is what stops a
 * design URL becoming a way to serve an arbitrary object through our watermark.
 * Copying at the moment of choosing also freezes what was shown: re-cropping a
 * deck later must not silently restyle a library somebody has been choosing
 * from.
 */

const MAX_IMPORT = 60;

/** The company this account was promoted from — the same join the Proposals tab
 *  follows, so a client can only ever import their own directions. */
async function companyIdFor(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, accountId: string) {
  const { data } = await sb.from("crm_companies")
    .select("id").eq("corporate_account_id", accountId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function GET() {
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease || !partnerCapabilities(session.account).customLibrary) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });
  if (!can(session, "upload")) {
    return NextResponse.json({ error: "You can't add designs to this library." }, { status: 403 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const companyId = await companyIdFor(sb, session.account.id);
  if (!companyId) return NextResponse.json({ ok: true, directions: [] });

  const { data: proposals } = await sb.from("crm_proposals")
    .select("id, title").eq("company_id", companyId);
  const ids = (proposals ?? []).map((p) => p.id as string);
  if (ids.length === 0) return NextResponse.json({ ok: true, directions: [] });

  const { data: options } = await sb.from("crm_proposal_options")
    .select("id, title, tagline, position, proposal_id")
    .in("proposal_id", ids).order("position");

  // Which are already in — matched on series name, because that is what the
  // import writes and what the client sees. Re-importing would duplicate a
  // whole direction, which is a much louder mistake than a duplicate design.
  const { data: existing } = await sb.from("corporate_designs")
    .select("series_name").eq("account_id", session.account.id).neq("status", "archived");
  const already = new Set((existing ?? []).map((d) => (d.series_name as string | null) ?? ""));

  const directions = await Promise.all((options ?? []).map(async (o) => {
    const { count } = await sb.from("crm_proposal_option_images")
      .select("id", { count: "exact", head: true }).eq("option_id", o.id as string);
    return {
      id: o.id as string,
      title: o.title as string,
      tagline: (o.tagline as string | null) ?? null,
      designs: count ?? 0,
      imported: already.has(o.title as string),
    };
  }));

  return NextResponse.json({ ok: true, directions: directions.filter((d) => d.designs > 0) });
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

  let b: { optionIds?: string[] };
  try { b = await req.json(); } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const wanted = [...new Set((Array.isArray(b.optionIds) ? b.optionIds : []).map(String))];
  if (wanted.length === 0) {
    return NextResponse.json({ error: "Choose at least one direction." }, { status: 400 });
  }

  const companyId = await companyIdFor(sb, session.account.id);
  if (!companyId) {
    return NextResponse.json({ error: "This account has no proposals to import from." }, { status: 404 });
  }

  // Scoped through the account's own company, so an option id from another
  // client's proposal simply is not found.
  const { data: proposals } = await sb.from("crm_proposals")
    .select("id").eq("company_id", companyId);
  const proposalIds = (proposals ?? []).map((p) => p.id as string);
  const { data: options } = proposalIds.length
    ? await sb.from("crm_proposal_options")
        .select("id, title").in("id", wanted).in("proposal_id", proposalIds)
    : { data: [] as { id: string; title: string }[] };
  if (!options?.length) {
    return NextResponse.json({ error: "Those directions aren't on your account." }, { status: 404 });
  }

  let added = 0;
  const results: { direction: string; added: number; skipped: string[] }[] = [];

  for (const option of options) {
    const series = String(option.title);
    const skipped: string[] = [];
    let n = 0;

    const { data: images } = await sb.from("crm_proposal_option_images")
      .select("id, storage_path, label, sort")
      .eq("option_id", option.id as string).order("sort").limit(MAX_IMPORT);

    for (const img of images ?? []) {
      const source = img.storage_path as string | null;
      if (!source) { skipped.push("no artwork"); continue; }
      try {
        const { data: file } = await presDownload(source);
        if (!file) { skipped.push("artwork could not be read"); continue; }
        const bytes = Buffer.from(await file.arrayBuffer());
        const sha256 = await sha256Hex(bytes);
        const dup = await liveDuplicate(sb, session.account.id, sha256);
        if (dup) { skipped.push(duplicateMessage(dup)); continue; }
        const type = file.type || "image/jpeg";
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
        const path = `${session.account.slug}/library/proposal/${option.id}/${img.id}.${ext}`;

        const up = await caUpload(
          path, bytes,
          { contentType: type, upsert: true, cacheControl: CACHE_MUTABLE },
        );
        if (up.error) { skipped.push("artwork could not be saved"); continue; }

        const { error } = await sb.from("corporate_designs").insert({
          account_id: session.account.id,
          // The direction's own name, numbered — the deck showed these as a set
          // and the library should read the same way.
          title: `${series} ${(img.sort as number) ?? n + 1}`,
          design_url: canonicalArtUrl(sb, path),
          series_name: series,
          // Commissioned: drawn for this client, on the website nowhere.
          product_handle: null,
          status: "approved",
          uploaded_by: session.email,
          content_sha256: sha256,
          byte_size: bytes.byteLength,
        });
        if (error) { skipped.push("could not be added"); continue; }
        n++; added++;
      } catch {
        skipped.push("could not be added");
      }
    }
    results.push({ direction: series, added: n, skipped });
  }

  if (added) {
    await recordAudit(session, "design.proposal_import", null,
      { added, directions: results.map((r) => r.direction) });
  }
  return NextResponse.json({ ok: added > 0, added, results });
}
