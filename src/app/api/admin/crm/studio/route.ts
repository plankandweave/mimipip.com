import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mintToken } from "@/lib/presentation";
import { sendEmail } from "@/lib/email";
import {
  identifySpace, runCreative, runResearch, renderConcept, composeDeck, reviewDeck,
  studioUpload, studioUploadBinary, studioSignedUrl, imageForModel,
  parseCurated, composeCuratedDeck, conceptRendition, presentablePalette, paletteStripHtml,
  ensureChapterPalettes, ensureChapterHeroes, captureChapterHeroes, heroHtml,
  galleryHtml, shortlistButtonHtml, renderInSitu, restyleDeck, repairComparisonBases,
  CURATED_REVIEW_RULES,
  type CreativeDirection, type SpaceAnalysis, type ResearchFindings, type PaletteSwatch,
} from "@/lib/proposal-studio";
import { staffKey } from "@/lib/staff-key";
import { presDownload } from "@/lib/presentation-store";
import { currentStaff } from "@/lib/staff-access";
import { adminRpcKey } from "@/lib/elevated-key";
import { internalTokenOk } from "@/lib/site-batch";
import {
  resolveStudioCaller, readCompanyAsk, companyLookupPlan, currentDeckPath,
  readRecipientAsk, presentationLink, tokenStrongEnough, type StudioCaller,
} from "@/lib/studio-os-door";

export const runtime = "nodejs";
// The presenter and reviewer are long single calls; same ceiling as the
// catalogue scene generator.
export const maxDuration = 300;

// The Proposal Studio's one endpoint. GET returns full state; POST dispatches
// on `action`. Admin-key-gated before anything else — every action spends
// either storage or AI tokens.
//
// TWO KINDS OF CALLER. A staff member (Google sign-in / Cloudflare Access,
// turned into the admin key by staffKey) — and, since 26 October 2026, the OS's
// Zyvorah design agent on the shared server secret `x-zyvorah-token`, the same
// header /api/corporate/site-batch takes from it. The OS is a staff-equivalent
// caller named "OS design agent" (lib/studio-os-door.ts); it gets the same key
// from admin_config, so every RPC gate below still holds for it. What it may do
// beyond a staff member: `create` from a `company` description rather than an
// id, `recipient` to mint a /p link without emailing, and a GET that carries a
// `preview_url` a director can open. Every other caller is exactly as before.
//
// Image URLs embedded in decks are signed for ten years, not an hour: the
// approved deck lives in the portal indefinitely, and a proposal whose
// pictures die after lunch is worse than no proposal.

const TEN_YEARS = 315_360_000;
const MAX_IMG = 8 * 1024 * 1024;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// The email a preview reuses. Never a real inbox — a preview mints no send, it
// only needs a recipient row so the deck opens in the client's own /p chrome.
const PREVIEW_EMAIL = "preview@internal.zyvorah";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

async function keyOk(key: string): Promise<boolean> {
  if (!key) return false;
  const { data, error } = await supabase.rpc("admin_key_ok", { p_key: key });
  return !error && data === true;
}

/** Who is asking: the OS on its token, else the signed-in staff member. */
function studioCaller(req: Request): Promise<StudioCaller> {
  return resolveStudioCaller(req, {
    internalTokenOk,
    staffKey,
    adminRpcKey,
    staffEmail: async (r) => (await currentStaff(r))?.email ?? null,
  });
}

type SbAdmin = NonNullable<ReturnType<typeof supabaseAdmin>>;

/** The crm_companies row the OS describes — found by a contact on its domain,
 *  then by name (the dictation box's own match_key), else filed now with the
 *  OS named as its source. A contact is filed under it when the OS gave an
 *  email and no contact with that address exists yet. */
async function findOrCreateCompany(
  sb: SbAdmin, ask: NonNullable<ReturnType<typeof readCompanyAsk>>, actor: string,
): Promise<{ id: string; name: string; created: boolean }> {
  const plan = companyLookupPlan(ask);
  let found: { id: string; name: string } | null = null;

  if (plan.domain) {
    const { data: byContact } = await sb.from("crm_contacts")
      .select("company_id, crm_companies(id, name)")
      .ilike("email", `%@${plan.domain}`)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    const c = byContact?.crm_companies as { id: string; name: string } | { id: string; name: string }[] | null | undefined;
    const row = Array.isArray(c) ? c[0] : c;
    if (row) found = { id: row.id, name: row.name };
    if (!found) {
      const { data: byWebsite } = await sb.from("crm_companies")
        .select("id, name").ilike("website", `%${plan.domain}%`)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (byWebsite) found = byWebsite as { id: string; name: string };
    }
  }
  if (!found) {
    const { data: byName } = await sb.from("crm_companies")
      .select("id, name").eq("match_key", plan.matchKey).maybeSingle();
    if (byName) found = byName as { id: string; name: string };
  }

  let created = false;
  if (!found) {
    const { data: ins, error } = await sb.from("crm_companies").insert({
      name: ask.name, kind: ask.kind, city: ask.city, website: plan.domain,
      status: "lead", source: `os:${actor}`,
    }).select("id, name").single();
    if (error) {
      // Two OS calls racing on one new name: the unique match_key refuses the
      // second insert, and the row the first made is the answer.
      const { data: again } = await sb.from("crm_companies")
        .select("id, name").eq("match_key", plan.matchKey).maybeSingle();
      if (!again) throw new Error(`company insert failed: ${error.message}`);
      found = again as { id: string; name: string };
    } else {
      found = ins as { id: string; name: string };
      created = true;
    }
  }

  if (plan.contact) {
    const { data: existing } = await sb.from("crm_contacts")
      .select("id").eq("company_id", found.id).ilike("email", plan.contact.email).limit(1).maybeSingle();
    if (!existing) {
      const { data: anyContact } = await sb.from("crm_contacts")
        .select("id").eq("company_id", found.id).limit(1).maybeSingle();
      const { error } = await sb.from("crm_contacts").insert({
        company_id: found.id, name: plan.contact.name, email: plan.contact.email,
        is_primary: !anyContact,
      });
      // A contact that could not be filed is not a reason to refuse the deck:
      // the proposal hangs off the company, and the contact can be added later.
      if (error) console.error("[studio] contact insert failed:", error.message);
    }
  }
  return { ...found, created };
}

/** One internal presentation per proposal (audience='internal', never in the
 *  client list), aimed at whichever deck file is current. Shared by the
 *  studio's internal_share panel and the OS's GET, which both need a /p link
 *  that shows exactly what would go out. Null when nothing is composed. */
async function ensureInternalPresentation(
  sb: SbAdmin, key: string, p: Record<string, unknown>, proposalId: string,
): Promise<{ id: string; deckPath: string } | null> {
  const deckPath = currentDeckPath({
    status: String(p.status), deck_path: (p.deck_path as string | null) ?? null,
    reviewed_deck_path: (p.reviewed_deck_path as string | null) ?? null,
  });
  if (!deckPath) return null;
  let internalId = (p.internal_presentation_id as string | null) ?? null;
  if (internalId) {
    const { data: still } = await sb.from("crm_presentations")
      .select("id, storage_path").eq("id", internalId).maybeSingle();
    if (!still) internalId = null;
    else if (still.storage_path !== deckPath) {
      await sb.from("crm_presentations").update({ storage_path: deckPath }).eq("id", internalId);
    }
  }
  if (!internalId) {
    const { data: pres, error: presErr } = await supabase.rpc("crm_presentation_create", {
      p_key: key, p_company_id: p.company_id, p_deal_id: p.deal_id,
      p_title: `${p.title} — internal review`, p_format: "html",
      p_storage_path: deckPath, p_require_code: false,
    });
    if (presErr) throw new Error(presErr.message);
    internalId = (pres as { id: string }).id;
    await sb.from("crm_presentations").update({ audience: "internal" }).eq("id", internalId);
    await sb.from("crm_proposals").update({ internal_presentation_id: internalId }).eq("id", proposalId);
  }
  return { id: internalId, deckPath };
}

/** The one labelled preview recipient on an internal presentation, minted
 *  once and reused: a preview sends nothing, it only needs a recipient row so
 *  the deck opens in the client's own /p chrome. */
async function previewTokenFor(sb: SbAdmin, key: string, internalId: string): Promise<string> {
  const { data: existing } = await sb.from("crm_presentation_recipients")
    .select("token").eq("presentation_id", internalId).eq("email", PREVIEW_EMAIL).maybeSingle();
  let token = (existing?.token as string | undefined) ?? null;
  if (!token) {
    token = mintToken();
    const { error: addErr } = await supabase.rpc("crm_presentation_add_recipient", {
      p_key: key, p_presentation_id: internalId, p_email: PREVIEW_EMAIL, p_name: "Preview", p_token: token,
    });
    if (addErr) throw new Error(addErr.message);
  }
  return token;
}

type ImageRow = {
  id: string; storage_path: string; label: string | null;
  analysis_json: SpaceAnalysis | null; sort: number;
  situ_base_path: string | null; mask_path: string | null;
};

type OptionRow = {
  id: string; position: number; title: string; tagline: string;
  body_md: string; palette: PaletteSwatch[];
};
type RenderRow = {
  id: string; option_id: string; image_id: string; storage_path: string;
  render_path: string | null; source: "ai" | "upload"; status: "draft" | "approved";
};
type OptionImageRow = {
  id: string; option_id: string; storage_path: string;
  render_path: string | null; caption: string | null; sort: number;
};

async function loadProposal(id: string) {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("service role unavailable");
  const { data: p } = await sb.from("crm_proposals").select("*").eq("id", id).maybeSingle();
  if (!p) return null;
  const { data: images } = await sb
    .from("crm_proposal_images").select("*").eq("proposal_id", id).order("sort");

  // Curated rows are only fetched for curated proposals: a studio proposal must
  // cost exactly the queries it cost before this mode existed.
  let options: OptionRow[] = [];
  let optionImages: OptionImageRow[] = [];
  let renders: RenderRow[] = [];
  if (p.mode === "curated") {
    const { data: opts } = await sb
      .from("crm_proposal_options").select("*").eq("proposal_id", id).order("position");
    options = (opts ?? []) as OptionRow[];
    if (options.length) {
      const { data: oims } = await sb
        .from("crm_proposal_option_images")
        .select("*")
        .in("option_id", options.map((o) => o.id))
        .order("sort");
      optionImages = (oims ?? []) as OptionImageRow[];
      const { data: rs } = await sb
        .from("crm_proposal_renders").select("*").eq("proposal_id", id);
      renders = (rs ?? []) as RenderRow[];
    }
  }
  return { p, images: (images ?? []) as ImageRow[], options, optionImages, renders };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const caller = await studioCaller(req);
  const key = caller.key;
  const id = url.searchParams.get("proposal_id") ?? "";
  const companyId = url.searchParams.get("company_id") ?? "";
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  // List mode for the company page.
  if (!id && companyId) {
    const { data } = await sb
      .from("crm_proposals")
      .select("id, title, status, mode, updated_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    return NextResponse.json({ proposals: data ?? [] });
  }

  const loaded = await loadProposal(id);
  if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { p, images, options, optionImages, renders } = loaded;

  // For the OS: links a director can open. The deck file itself is served as
  // an attachment behind the files route (a stored deck is arbitrary HTML), so
  // the only viewable form of a deck is a /p page — `preview_url` is the
  // proposal's internal preview (minted once, re-aimed at the current file),
  // `deck_url` the customer's own link once a recipient has been added to the
  // approved presentation. Staff callers get the body exactly as before.
  const osLinks: { preview_url?: string | null; deck_url?: string | null; actor?: string } = {};
  if (caller.os) {
    osLinks.actor = caller.actor;
    try {
      const internal = await ensureInternalPresentation(sb, key, p as Record<string, unknown>, id);
      osLinks.preview_url = internal
        ? presentationLink(process.env.NEXT_PUBLIC_SITE_URL, await previewTokenFor(sb, key, internal.id))
        : null;
    } catch (e) {
      console.error("[studio] preview link for the OS failed:", e);
      osLinks.preview_url = null;
    }
    osLinks.deck_url = null;
    if (p.presentation_id) {
      const { data: rec } = await sb.from("crm_presentation_recipients")
        .select("token").eq("presentation_id", p.presentation_id).is("revoked_at", null)
        .neq("email", PREVIEW_EMAIL).order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (rec?.token) osLinks.deck_url = presentationLink(process.env.NEXT_PUBLIC_SITE_URL, rec.token as string);
    }
  }

  return NextResponse.json({
    ...p,
    ...osLinks,
    images: await Promise.all(images.map(async (im) => ({
      id: im.id, label: im.label, analysis: im.analysis_json, sort: im.sort,
      url: await studioSignedUrl(im.storage_path, 3600),
      // The wall, once prepared: the model and the deck both use the base, and
      // the mask decides where a mural may go.
      hasMask: Boolean(im.mask_path),
      baseUrl: im.situ_base_path ? await studioSignedUrl(im.situ_base_path, 3600) : null,
      maskUrl: im.mask_path ? await studioSignedUrl(im.mask_path, 3600) : null,
    }))),
    options: await Promise.all(options.map(async (o) => ({
      id: o.id, position: o.position, title: o.title, tagline: o.tagline,
      body_md: o.body_md, palette: o.palette ?? [],
      images: await Promise.all(
        optionImages
          .filter((oi) => oi.option_id === o.id)
          .map(async (oi) => ({
            id: oi.id, caption: oi.caption, sort: oi.sort,
            // The thumbnail the studio shows is the rendition where one exists;
            // the original is only ever downloaded to make a rendition.
            url: await studioSignedUrl(oi.render_path ?? oi.storage_path, 3600),
          })),
      ),
      // Her walls, wearing this direction. Drafts come back too — the studio is
      // exactly where a draft is meant to be looked at.
      renders: await Promise.all(
        renders
          .filter((r) => r.option_id === o.id)
          .map(async (r) => ({
            id: r.id, image_id: r.image_id, source: r.source, status: r.status,
            url: await studioSignedUrl(r.render_path ?? r.storage_path, 3600),
          })),
      ),
    }))),
  });
}

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";

  /* ---- image upload is multipart; everything else is JSON ---- */
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "bad_form" }, { status: 400 });
    if (!(await keyOk((await studioCaller(req)).key)))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const proposalId = String(form.get("proposal_id") ?? "");
    const label = String(form.get("label") ?? "").trim() || null;
    const optionId = String(form.get("option_id") ?? "").trim();
    const file = form.get("file");
    if (!proposalId || !(file instanceof File))
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    if (file.size > MAX_IMG) return NextResponse.json({ error: "too_large" }, { status: 413 });
    const mime = file.type || "image/jpeg";
    if (!/^image\/(jpeg|png|webp)$/.test(mime))
      return NextResponse.json({ error: "bad_format" }, { status: 415 });

    const bytes = Buffer.from(await file.arrayBuffer());

    /* ---- the prepared wall: the 3:2 base and the mask, both made in the
           browser because sharp cannot run on the deployed runtime ---- */
    const prepFor = String(form.get("prepare_image_id") ?? "").trim();
    const prepKind = String(form.get("prepare_kind") ?? "").trim();
    if (prepFor && (prepKind === "base" || prepKind === "mask")) {
      const sbp = supabaseAdmin()!;
      const { data: photo } = await sbp
        .from("crm_proposal_images").select("id")
        .eq("id", prepFor).eq("proposal_id", proposalId).maybeSingle();
      if (!photo) return NextResponse.json({ error: "no_such_image" }, { status: 400 });

      const path = `studio/${proposalId}/prep/${prepFor}-${prepKind}-${crypto.randomUUID()}.png`;
      await studioUploadBinary(path, bytes, prepKind === "mask" ? "image/png" : mime);
      const { error } = await sbp.from("crm_proposal_images")
        .update(prepKind === "mask" ? { mask_path: path } : { situ_base_path: path })
        .eq("id", prepFor);
      if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
      return NextResponse.json({ url: await studioSignedUrl(path, 3600) });
    }

    /* ---- the browser's rendition of a render it just triggered ---- */
    const renditionFor = String(form.get("rendition_for_image_id") ?? "").trim();
    if (optionId && renditionFor) {
      const sbr = supabaseAdmin()!;
      const { data: row } = await sbr
        .from("crm_proposal_renders").select("id")
        .eq("option_id", optionId).eq("image_id", renditionFor)
        .eq("proposal_id", proposalId).maybeSingle();
      if (!row) return NextResponse.json({ error: "no_such_render" }, { status: 400 });
      const path = `studio/${proposalId}/situ/${optionId}/${renditionFor}-${crypto.randomUUID()}-render.jpg`;
      await studioUploadBinary(path, bytes, "image/jpeg");
      const { error } = await sbr.from("crm_proposal_renders")
        .update({ render_path: path }).eq("id", row.id);
      if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    /* ---- her own render of a wall, replacing whatever the AI made ---- */
    const situFor = String(form.get("render_for_image_id") ?? "").trim();
    if (optionId && situFor) {
      const sbc = supabaseAdmin()!;
      const { data: opt } = await sbc
        .from("crm_proposal_options").select("id")
        .eq("id", optionId).eq("proposal_id", proposalId).maybeSingle();
      const { data: photo } = await sbc
        .from("crm_proposal_images").select("id")
        .eq("id", situFor).eq("proposal_id", proposalId).maybeSingle();
      if (!opt || !photo) return NextResponse.json({ error: "no_such_pair" }, { status: 400 });

      const base = `studio/${proposalId}/situ/${optionId}/${situFor}-${crypto.randomUUID()}`;
      const originalPath = `${base}-original`;
      const renderPath = `${base}-render.jpg`;
      await studioUploadBinary(originalPath, bytes, mime);
      let render: string | null = null;
      try {
        await studioUploadBinary(renderPath, await conceptRendition(bytes), "image/jpeg");
        render = renderPath;
      } catch (e) {
        console.error("[studio] situ rendition failed:", e);
      }
      // Hers, so it is approved on arrival — she is the approval step, and
      // asking her to approve her own work would be theatre.
      const { error } = await sbc.from("crm_proposal_renders").upsert({
        proposal_id: proposalId, option_id: optionId, image_id: situFor,
        storage_path: originalPath, render_path: render, source: "upload", status: "approved",
      }, { onConflict: "option_id,image_id" });
      if (error) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
      return NextResponse.json({ url: await studioSignedUrl(render ?? originalPath, 3600) });
    }

    /* ---- a curated concept board: it belongs to an option, not the site ---- */
    if (optionId) {
      const sbc = supabaseAdmin()!;
      // The option must belong to this proposal — option_id arrives from the
      // browser and cannot be allowed to reach across proposals.
      const { data: opt } = await sbc
        .from("crm_proposal_options").select("id")
        .eq("id", optionId).eq("proposal_id", proposalId).maybeSingle();
      if (!opt) return NextResponse.json({ error: "no_such_option" }, { status: 400 });

      const base = `studio/${proposalId}/options/${optionId}/${crypto.randomUUID()}`;
      const originalPath = `${base}-original`;
      const renderPath = `${base}-render.jpg`;
      await studioUploadBinary(originalPath, bytes, mime);
      // A rendition failure must not lose the upload: the original is already
      // stored, and the deck falls back to it until a rendition exists.
      let render: string | null = null;
      try {
        await studioUploadBinary(renderPath, await conceptRendition(bytes), "image/jpeg");
        render = renderPath;
      } catch (e) {
        console.error("[studio] conceptRendition failed:", e);
      }

      const { data: maxRow } = await sbc
        .from("crm_proposal_option_images").select("sort")
        .eq("option_id", optionId).order("sort", { ascending: false }).limit(1).maybeSingle();
      const { data, error } = await sbc.from("crm_proposal_option_images").insert({
        option_id: optionId,
        storage_path: originalPath,
        render_path: render,
        caption: label,
        sort: ((maxRow?.sort as number | undefined) ?? 0) + 1,
      }).select().single();
      if (error) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
      return NextResponse.json({ ...data, url: await studioSignedUrl(render ?? originalPath, 3600) });
    }

    const path = `studio/${proposalId}/${crypto.randomUUID()}`;
    await studioUpload(path, bytes, mime);

    // The surveyor's read, at upload time. A vision failure must not block the
    // upload — the label alone is enough to proceed, and analysis can be
    // re-derived later.
    let analysis: SpaceAnalysis | null = null;
    try {
      analysis = await identifySpace(bytes, mime, label);
    } catch (e) {
      console.error("[studio] identifySpace failed:", e);
    }

    const sb = supabaseAdmin()!;
    const { data, error } = await sb.from("crm_proposal_images").insert({
      proposal_id: proposalId, storage_path: path, label, analysis_json: analysis,
      sort: Date.now() % 1_000_000,
    }).select().single();
    if (error) return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    return NextResponse.json({ ...data, url: await studioSignedUrl(path, 3600) });
  }

  const body = await req.json().catch(() => null);
  const caller = await studioCaller(req);
  const key = caller.key;
  const action = String(body?.action ?? "");
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  try {
    if (action === "create") {
      const mode = body.mode === "curated" ? "curated" : "studio";
      // The OS knows a customer, not a crm_companies id: `company` {name,
      // domain?, email?, contact_name?} finds the company by a contact's
      // domain or by name, else files it (and the contact) now.
      let companyId = String(body.company_id ?? "").trim();
      let company: { id: string; name: string; created: boolean } | null = null;
      if (!companyId) {
        const ask = readCompanyAsk(body.company);
        if (!ask) return NextResponse.json({ error: "company_required" }, { status: 400 });
        company = await findOrCreateCompany(sb, ask, caller.actor || "studio");
        companyId = company.id;
      }
      const { data, error } = await sb.from("crm_proposals").insert({
        company_id: companyId,
        deal_id: body.deal_id || null,
        title: String(body.title ?? "Untitled proposal").trim(),
        briefing: String(body.briefing ?? ""),
        mode,
        curated_md: mode === "curated" ? String(body.curated_md ?? "") : null,
      }).select().single();
      if (error) throw new Error(error.message);
      return NextResponse.json(company ? { ...data, company } : data);
    }

    if (action === "recipient") {
      // A recipient on a presentation — the customer's /p link — WITHOUT the
      // email the admin panel's invite sends: the OS writes that mail itself,
      // in the director's voice, for her tap. The presentation is marked sent
      // and the recipient invited here, because the link has left the store.
      const ask = readRecipientAsk(body);
      if (!ask) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
      const { data: pres } = await sb.from("crm_presentations")
        .select("id, status").eq("id", ask.presentationId).maybeSingle();
      if (!pres) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const onProposal = String(body.proposal_id ?? "").trim();
      if (onProposal) {
        // Named a proposal too? Then the presentation must be that proposal's.
        const { data: owner } = await sb.from("crm_proposals")
          .select("presentation_id, internal_presentation_id").eq("id", onProposal).maybeSingle();
        if (!owner || (owner.presentation_id !== ask.presentationId && owner.internal_presentation_id !== ask.presentationId))
          return NextResponse.json({ error: "presentation_not_on_proposal" }, { status: 400 });
      }
      const token = mintToken();
      if (!tokenStrongEnough(token)) throw new Error("token minting failed");
      const { data: rec, error: addErr } = await supabase.rpc("crm_presentation_add_recipient", {
        p_key: key, p_presentation_id: ask.presentationId, p_email: ask.email, p_name: ask.name, p_token: token,
      });
      if (addErr) throw new Error(addErr.message);
      await sb.from("crm_presentation_recipients")
        .update({ invited_at: new Date().toISOString() }).eq("token", token);
      if (pres.status === "draft") {
        await supabase.rpc("crm_presentation_set_status", { p_key: key, p_id: ask.presentationId, p_status: "sent" });
      }
      return NextResponse.json({
        token, url: presentationLink(process.env.NEXT_PUBLIC_SITE_URL, token),
        presentation_id: ask.presentationId, recipient_id: (rec as { id?: string } | null)?.id ?? null,
      });
    }

    const proposalId = String(body?.proposal_id ?? "");
    const loaded = await loadProposal(proposalId);
    if (!loaded) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const { p, images, options, optionImages, renders } = loaded;

    if (action === "brief") {
      // Editing the brief resets the pipeline: everything downstream was built
      // on the old contract.
      const { error } = await sb.from("crm_proposals").update({
        briefing: String(body.briefing ?? ""),
        title: String(body.title ?? p.title).trim() || p.title,
        status: "draft",
      }).eq("id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    /* ------------------------- curated mode ------------------------- */

    if (action === "curated_doc") {
      // Her document is the contract in curated mode, so editing it invalidates
      // everything downstream exactly as editing the briefing does.
      const { error } = await sb.from("crm_proposals").update({
        curated_md: String(body.curated_md ?? ""),
        title: String(body.title ?? p.title).trim() || p.title,
        status: "draft",
      }).eq("id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "parse_curated") {
      const doc = String(p.curated_md ?? "");
      if (!doc.trim()) return NextResponse.json({ error: "document_empty" }, { status: 400 });
      const parsed = await parseCurated(doc);
      if (!parsed.length) return NextResponse.json({ error: "no_options_found" }, { status: 422 });

      // Upsert by position rather than wiping the table: the option ids are what
      // her uploaded concept boards hang off, and a re-parse must not orphan
      // twenty-five images because the prose was re-read.
      for (const o of parsed) {
        const existing = options.find((x) => x.position === o.position);
        if (existing) {
          const { error } = await sb.from("crm_proposal_options").update({
            title: o.title, tagline: o.tagline, body_md: o.body_md, palette: o.palette,
          }).eq("id", existing.id);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await sb.from("crm_proposal_options").insert({
            proposal_id: proposalId, position: o.position,
            title: o.title, tagline: o.tagline, body_md: o.body_md, palette: o.palette,
          });
          if (error) throw new Error(error.message);
        }
      }
      return NextResponse.json({ options: parsed.length });
    }

    if (action === "option_upsert") {
      // Whatever she saves here is what the presenter receives. Colour naming is
      // hers by rule, so nothing on this path validates or "corrects" a name.
      const optionId = String(body.option_id ?? "").trim();
      const fields = {
        title: String(body.title ?? "").trim(),
        tagline: String(body.tagline ?? "").trim(),
        body_md: String(body.body_md ?? ""),
        palette: Array.isArray(body.palette) ? body.palette : [],
      };
      if (optionId) {
        const { error } = await sb.from("crm_proposal_options")
          .update(fields).eq("id", optionId).eq("proposal_id", proposalId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true });
      }
      const position = Number(body.position) || (Math.max(0, ...options.map((o) => o.position)) + 1);
      const { data, error } = await sb.from("crm_proposal_options")
        .insert({ proposal_id: proposalId, position, ...fields }).select().single();
      if (error) throw new Error(error.message);
      return NextResponse.json(data);
    }

    /* ---- her walls, wearing a direction ---- */

    if (action === "render_situ") {
      // One pair per request. Forty of these cannot share a 300-second
      // invocation, so the studio queues them and this stays a single render
      // that either works or fails visibly.
      const optionId = String(body.option_id ?? "");
      const imageId = String(body.image_id ?? "");
      const option = options.find((o) => o.id === optionId);
      const photo = images.find((im) => im.id === imageId);
      if (!option || !photo) return NextResponse.json({ error: "no_such_pair" }, { status: 400 });

      const boards = optionImages.filter((oi) => oi.option_id === optionId);
      if (!boards.length) return NextResponse.json({ error: "no_boards" }, { status: 400 });

      const { studioDownload } = await import("@/lib/proposal-studio");
      // The rendition is the reference, not the 4 MB original: the model reads
      // it at a fraction of the size and the upload is faster for it.
      const board = await studioDownload(boards[0].render_path ?? boards[0].storage_path);
      // The prepared 3:2 base where one exists — it is both what the model sees
      // and what the client swipes against, so the two halves cannot disagree
      // about where the camera was standing.
      const sitePhoto = await studioDownload(photo.situ_base_path ?? photo.storage_path);
      const mask = photo.mask_path ? await studioDownload(photo.mask_path) : null;

      const out = await renderInSitu({
        sitePhoto, board, mask,
        spaceLabel: photo.label,
        analysis: photo.analysis_json,
        optionTitle: option.title,
      });

      const base = `studio/${proposalId}/situ/${optionId}/${imageId}-${crypto.randomUUID()}`;
      const originalPath = `${base}-original.png`;
      const renderPath = `${base}-render.jpg`;
      await studioUploadBinary(originalPath, out, "image/png");
      let render: string | null = null;
      try {
        await studioUploadBinary(renderPath, await conceptRendition(out), "image/jpeg");
        render = renderPath;
      } catch (e) {
        console.error("[studio] situ rendition failed:", e);
      }

      // A re-render replaces: one live pair per wall per direction, so nothing
      // downstream ever has to choose between two candidates.
      const { error } = await sb.from("crm_proposal_renders").upsert({
        proposal_id: proposalId, option_id: optionId, image_id: imageId,
        storage_path: originalPath, render_path: render, source: "ai", status: "draft",
      }, { onConflict: "option_id,image_id" });
      if (error) throw new Error(error.message);
      return NextResponse.json({ url: await studioSignedUrl(render ?? originalPath, 3600) });
    }

    if (action === "render_approve") {
      const { error } = await sb.from("crm_proposal_renders")
        .update({ status: String(body.status) === "draft" ? "draft" : "approved" })
        .eq("id", String(body.render_id)).eq("proposal_id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "render_remove") {
      const { error } = await sb.from("crm_proposal_renders")
        .delete().eq("id", String(body.render_id)).eq("proposal_id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "option_remove") {
      const { error } = await sb.from("crm_proposal_options")
        .delete().eq("id", String(body.option_id)).eq("proposal_id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "option_image_update") {
      // Caption and order. The image is reached through its option so that an
      // id from the browser cannot touch another proposal's board.
      const imageId = String(body.image_id ?? "");
      const row = optionImages.find((oi) => oi.id === imageId);
      if (!row) return NextResponse.json({ error: "no_such_image" }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if (body.caption !== undefined) patch.caption = String(body.caption ?? "").trim() || null;
      if (body.sort !== undefined) patch.sort = Number(body.sort);
      const { error } = await sb.from("crm_proposal_option_images").update(patch).eq("id", imageId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "option_image_remove") {
      const imageId = String(body.image_id ?? "");
      if (!optionImages.some((oi) => oi.id === imageId))
        return NextResponse.json({ error: "no_such_image" }, { status: 400 });
      const { error } = await sb.from("crm_proposal_option_images").delete().eq("id", imageId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "label") {
      const { error } = await sb.from("crm_proposal_images")
        .update({ label: String(body.label ?? "").trim() || null })
        .eq("id", String(body.image_id)).eq("proposal_id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "remove_image") {
      const { error } = await sb.from("crm_proposal_images")
        .delete().eq("id", String(body.image_id)).eq("proposal_id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "research") {
      const directions = String(body.directions ?? "").trim();
      if (!directions) return NextResponse.json({ error: "directions_empty" }, { status: 400 });
      const findings = await runResearch(p.briefing, directions);
      const { error } = await sb.from("crm_proposals")
        .update({ research_brief: directions, research_json: findings }).eq("id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json(findings);
    }

    if (action === "creative") {
      if (!p.briefing.trim()) return NextResponse.json({ error: "briefing_empty" }, { status: 400 });
      // The site photographs go to the creative as images it can see, read
      // back from the store and sized for the model, plus whatever the
      // researcher found. A photograph whose space read failed at upload
      // (every one of 26 October's) is read now and kept, so the direction
      // never runs on "not analysed" walls that could have been analysed.
      const shown: { label: string | null; analysis: SpaceAnalysis | null; image: Awaited<ReturnType<typeof imageForModel>> }[] = [];
      for (const im of images) {
        let bytes: Buffer | null = null;
        let mime = "image/jpeg";
        try {
          const { data, error } = await presDownload(im.storage_path);
          if (error || !data) throw new Error(error?.message ?? "no data");
          bytes = Buffer.from(await data.arrayBuffer());
          if (/^image\//.test(data.type)) mime = data.type;
        } catch (e) {
          console.error("[studio] photograph unreadable for the creative:", im.storage_path, e);
        }
        let analysis = im.analysis_json;
        if (!analysis && bytes) {
          try {
            analysis = await identifySpace(bytes, mime, im.label);
            await sb.from("crm_proposal_images").update({ analysis_json: analysis }).eq("id", im.id);
          } catch (e) {
            console.error("[studio] identifySpace (late) failed:", im.id, e);
          }
        }
        shown.push({ label: im.label, analysis, image: bytes ? await imageForModel(bytes, mime) : null });
      }
      const creative = await runCreative(
        p.briefing,
        shown,
        (p.research_json as ResearchFindings | null) ?? null,
      );
      const { error } = await sb.from("crm_proposals")
        .update({ creative_json: creative, status: "creative" }).eq("id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json(creative);
    }

    if (action === "concept") {
      const creative = p.creative_json as CreativeDirection | null;
      const idx = Number(body.space_index);
      const space = creative?.spaces?.[idx];
      if (!space) return NextResponse.json({ error: "no_such_space" }, { status: 400 });
      const png = await renderConcept(space.image_prompt);
      const path = `studio/${proposalId}/concept-${idx}.png`;
      await studioUpload(path, png, "image/png");
      space.image_path = path;
      const { error } = await sb.from("crm_proposals")
        .update({ creative_json: creative }).eq("id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ url: await studioSignedUrl(path, 3600) });
    }

    if (action === "compose" && p.mode === "curated") {
      const doc = String(p.curated_md ?? "");
      if (!doc.trim()) return NextResponse.json({ error: "document_empty" }, { status: 400 });
      if (!options.length) return NextResponse.json({ error: "parse_first" }, { status: 400 });
      const { data: company } = await sb.from("crm_companies").select("name").eq("id", p.company_id).single();

      const optionInputs = await Promise.all(options.map(async (o) => {
        // Boards and the client's own walls, laid out here rather than
        // described: the pictures are the pitch, and their arrangement is not
        // something to re-decide per deck. Only APPROVED renders travel — a
        // draft she has not looked at must never reach a client.
        const boards = (await Promise.all(
          optionImages
            .filter((oi) => oi.option_id === o.id)
            .map(async (oi) => ({
              url: (await studioSignedUrl(oi.render_path ?? oi.storage_path, TEN_YEARS)) ?? "",
              caption: oi.caption,
            })),
        )).filter((im) => im.url);

        const comparisons = (await Promise.all(
          renders
            .filter((r) => r.option_id === o.id && r.status === "approved")
            .map(async (r) => {
              const before = images.find((im) => im.id === r.image_id);
              return {
                // THE BEFORE MUST SHARE THE AFTER'S CANVAS. A generated render
                // sits on the prep base — the photograph re-shaped to the image
                // model's canvas — so for those the base is the honest "before".
                // A render she photographed or mocked up herself was made from
                // the ORIGINAL photograph, and pairing that with the prep base
                // put a centre-crop beside a full-width mockup: the wipe showed
                // two different framings of the room.
                beforeUrl: before
                  ? (await studioSignedUrl(
                      r.source === "ai" ? (before.situ_base_path ?? before.storage_path) : before.storage_path,
                      TEN_YEARS,
                    )) ?? ""
                  : "",
                afterUrl: (await studioSignedUrl(r.render_path ?? r.storage_path, TEN_YEARS)) ?? "",
                label: before?.label ?? null,
              };
            }),
        )).filter((c) => c.beforeUrl && c.afterUrl);

        // ONE hero per direction, above her prose. Their own wall wins it
        // wherever a render has been approved — that is the picture a client
        // reads instantly — and her lead board is promoted where none exists,
        // so no direction opens with six hundred words and nothing to see.
        const heroComparison = comparisons.length ? comparisons[0] : null;
        const heroBoard = heroComparison ? null : (boards[0] ?? null);

        return {
          position: o.position,
          title: o.title,
          tagline: o.tagline,
          body_md: o.body_md,
          // The strip is rendered here, not described to the presenter: the deck's
          // proportions are then exactly the ones she approved in the studio, and
          // the percentages behind them never enter the model's context at all.
          palette_strip_html: paletteStripHtml(o.palette ?? []),
          palette_names: presentablePalette(o.palette ?? []).map((b) => b.name),
          shortlist_button_html: shortlistButtonHtml(o.position, o.title),
          hero_html: heroHtml({ comparison: heroComparison, board: heroBoard }),
          // Whatever the hero took is not shown again underneath it.
          gallery_html: galleryHtml({
            boards: heroBoard ? boards.slice(1) : boards,
            comparisons: heroComparison ? comparisons.slice(1) : comparisons,
          }),
        };
      }));

      const sitePhotos = (await Promise.all(images.map(async (im) => ({
        label: im.label,
        analysis: im.analysis_json,
        url: (await studioSignedUrl(im.storage_path, TEN_YEARS)) ?? "",
      })))).filter((im) => im.url);

      const composed = await composeCuratedDeck({
        clientName: company?.name ?? "the client",
        document: doc,
        options: optionInputs,
        sitePhotos,
      });
      // The presenter is asked to place each pre-built block; this makes sure it
      // actually did, and re-inserts any it dropped, before the deck is stored.
      const withPalettes = ensureChapterPalettes(
        composed,
        options.map((o) => ({ position: o.position, palette: o.palette ?? [] })),
      );
      const withHeroes = ensureChapterHeroes(
        withPalettes.html,
        optionInputs.map((o) => ({ position: o.position, hero_html: o.hero_html })),
      );
      const html = withHeroes.html;
      if (withPalettes.injected.length) console.warn(`[studio] compose re-inserted palette strip for chapters ${withPalettes.injected.join(", ")}`);
      if (withHeroes.injected.length) console.warn(`[studio] compose re-inserted hero for chapters ${withHeroes.injected.join(", ")}`);
      const path = `studio/${proposalId}/deck.html`;
      await studioUpload(path, Buffer.from(html, "utf8"), "text/html");
      const { error } = await sb.from("crm_proposals")
        .update({ deck_path: path, status: "composed" }).eq("id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "compose") {
      const creative = p.creative_json as CreativeDirection | null;
      if (!creative) return NextResponse.json({ error: "run_creative_first" }, { status: 400 });
      const { data: company } = await sb.from("crm_companies").select("name").eq("id", p.company_id).single();

      const imageInputs = await Promise.all(images.map(async (im) => ({
        label: im.label,
        analysis: im.analysis_json,
        url: (await studioSignedUrl(im.storage_path, TEN_YEARS)) ?? "",
      })));
      const conceptUrls = (await Promise.all(
        creative.spaces
          .filter((s) => s.image_path)
          .map(async (s) => ({ label: s.label, url: (await studioSignedUrl(s.image_path!, TEN_YEARS)) ?? "" })),
      )).filter((c) => c.url);

      const html = await composeDeck({
        clientName: company?.name ?? "the client",
        briefing: p.briefing,
        research: (p.research_json as ResearchFindings | null) ?? null,
        creative,
        images: imageInputs.filter((i) => i.url),
        conceptUrls,
      });
      const path = `studio/${proposalId}/deck.html`;
      await studioUpload(path, Buffer.from(html, "utf8"), "text/html");
      const { error } = await sb.from("crm_proposals")
        .update({ deck_path: path, status: "composed" }).eq("id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "review") {
      if (!p.deck_path) return NextResponse.json({ error: "compose_first" }, { status: 400 });
      const { studioDownload } = await import("@/lib/proposal-studio");
      const deck = (await studioDownload(p.deck_path)).toString("utf8");
      // In curated mode the contract is her document, not the briefing, and the
      // editor's remit narrows to the copy the presenter wrote around it.
      const result = p.mode === "curated"
        ? await reviewDeck(String(p.curated_md ?? ""), deck, CURATED_REVIEW_RULES)
        : await reviewDeck(p.briefing, deck);
      // The reviewer can drop a strip just as the presenter can; the client sees
      // the reviewed deck, so the same guarantee is re-asserted on its output.
      const reviewedHtml = p.mode === "curated"
        ? ensureChapterHeroes(
            ensureChapterPalettes(
              result.revised_html,
              options.map((o) => ({ position: o.position, palette: o.palette ?? [] })),
            ).html,
            // Captured from the deck the reviewer was handed, so a hero it
            // deleted comes back exactly as the presenter received it.
            captureChapterHeroes(deck),
          ).html
        : result.revised_html;
      const path = `studio/${proposalId}/deck-reviewed.html`;
      await studioUpload(path, Buffer.from(reviewedHtml, "utf8"), "text/html");
      const { error } = await sb.from("crm_proposals").update({
        reviewed_deck_path: path,
        review_json: { verdict: result.verdict, notes: result.notes, flags: result.flags },
        status: "reviewed",
      }).eq("id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ verdict: result.verdict, notes: result.notes, flags: result.flags });
    }

    if (action === "restyle") {
      // The deck's stylesheet, brought up to date on a deck that is already
      // composed — and already open in front of a client.
      //
      // Boards were being drawn into a fixed frame and cropped to fill it, and
      // the artwork is panoramic: half of each mural was cut away, taking the
      // head off the tiger and a wing off the kingfisher. Fixing the builders
      // only helps the NEXT deck. Re-composing this one would put every word
      // back through the presenter for a fault that is purely visual. So this
      // rewrites the stylesheet in place and touches nothing else — same file,
      // same path, so every link already sent keeps working.
      const deckPath = p.status === "composed"
        ? (p.deck_path ?? p.reviewed_deck_path)
        : (p.reviewed_deck_path ?? p.deck_path);
      if (!deckPath) return NextResponse.json({ error: "compose_first" }, { status: 400 });
      const { studioDownload } = await import("@/lib/proposal-studio");
      const before = (await studioDownload(deckPath)).toString("utf8");
      let after = restyleDeck(before);

      // The other mechanical fault a composed deck can carry: a comparison whose
      // "before" is the prep base — the photograph re-shaped to the image
      // model's canvas — under a render she made from the photograph itself.
      // Same rule as compose: only a generated render belongs on that base.
      const swaps = await Promise.all(
        images
          .filter((im) => im.situ_base_path)
          .filter((im) => {
            const mine = renders.filter((r) => r.image_id === im.id && r.status === "approved");
            return mine.length > 0 && mine.every((r) => r.source !== "ai");
          })
          .map(async (im) => ({
            fromPath: im.situ_base_path as string,
            toUrl: (await studioSignedUrl(im.storage_path, TEN_YEARS)) ?? "",
          })),
      );
      const paired = repairComparisonBases(after, swaps);
      after = paired.html;

      if (after !== before) {
        await studioUpload(deckPath, Buffer.from(after, "utf8"), "text/html");
      }
      return NextResponse.json({
        ok: true, path: deckPath, changed: after !== before, repaired: paired.repaired,
      });
    }

    if (action === "internal_share") {
      // The reviewed deck, seen the way the client will see it — and handed to
      // an internal reader for a critical pass — WITHOUT approving it or putting
      // anything on the client's timeline. It is the same portal as approve
      // (0117), pointed inward: a private /p link, opens tracked, comments back
      // to Roheena. The presentation is flagged audience='internal', so it never
      // shows up in the client Presentations list.
      // Preview what would actually go out. A re-compose writes deck.html and
      // leaves the older deck-reviewed.html untouched, so preferring "reviewed"
      // blindly would show prose she has already replaced — the exact trap when
      // a deck is edited and re-composed but not yet re-reviewed. Status is the
      // tie-breaker: 'composed' means the compose is newer than any review.
      const mode = body.mode === "list" ? "list" : body.email ? "invite" : "preview";
      if (!currentDeckPath(p)) return NextResponse.json({ error: "nothing_to_share" }, { status: 400 });

      // One internal presentation per proposal, reused across re-composes so the
      // link she has already shared keeps working. Which FILE it points at can
      // change though — composing after a review swaps the current deck from
      // deck-reviewed.html back to deck.html — so an existing share is re-aimed
      // at whatever is current rather than left showing the older file.
      // (ensureInternalPresentation; the OS's GET reads the same link.)
      if (mode === "list") {
        // Listing never mints: no internal share yet (or its row gone) is an
        // empty panel, exactly as before.
        const { data: still } = p.internal_presentation_id
          ? await sb.from("crm_presentations").select("id").eq("id", p.internal_presentation_id).maybeSingle()
          : { data: null };
        if (!still) return NextResponse.json({ presentation_id: null, comments: [] });
      }
      const internal = await ensureInternalPresentation(sb, key, p as Record<string, unknown>, proposalId);
      if (!internal) return NextResponse.json({ error: "nothing_to_share" }, { status: 400 });
      const internalId = internal.id;

      // Comments (Samir's critique) with the name of whoever left each, so the
      // studio can show them beside the deck.
      const recips = (await sb.from("crm_presentation_recipients")
        .select("id, name, email").eq("presentation_id", internalId)).data ?? [];
      const nameOf = new Map(recips.map((r) => [r.id as string, (r.name as string | null) || (r.email as string)]));
      const rawComments = (await sb.from("crm_presentation_comments")
        .select("id, body, anchor, kind, created_at, recipient_id")
        .eq("presentation_id", internalId).order("created_at", { ascending: false })).data ?? [];
      const comments = rawComments.map((c) => ({
        id: c.id, body: c.body, anchor: c.anchor, kind: c.kind, created_at: c.created_at,
        from: nameOf.get(c.recipient_id as string) ?? null,
      }));

      if (mode === "list") return NextResponse.json({ presentation_id: internalId, comments });

      const isPreview = mode === "preview";
      const email = isPreview ? PREVIEW_EMAIL : String(body.email ?? "").trim().toLowerCase();
      const name = isPreview ? "Preview" : (String(body.name ?? "").trim() || null);
      if (!isPreview && !EMAIL_RE.test(email)) return NextResponse.json({ error: "bad_email" }, { status: 400 });

      // Preview reuses its one labelled recipient; an invite mints a fresh token
      // per person (or reuses theirs if they were already invited).
      let token: string;
      if (isPreview) {
        token = await previewTokenFor(sb, key, internalId);
      } else {
        const { data: existing } = await sb.from("crm_presentation_recipients")
          .select("token").eq("presentation_id", internalId).eq("email", email).maybeSingle();
        token = (existing?.token as string | undefined) ?? "";
        if (!token) {
          token = mintToken();
          const { error: addErr } = await supabase.rpc("crm_presentation_add_recipient", {
            p_key: key, p_presentation_id: internalId, p_email: email, p_name: name, p_token: token,
          });
          if (addErr) throw new Error(addErr.message);
        }
      }

      const link = presentationLink(process.env.NEXT_PUBLIC_SITE_URL, token);
      // Emails only on an explicit send — never for a preview, never as a side
      // effect of opening the panel.
      let emailed = false;
      if (!isPreview && body.notify === true) {
        emailed = await sendEmail({
          to: email,
          subject: `Internal review — ${p.title}`,
          html:
            `<p>${name ? `${escapeHtml(name)},` : "Hello,"}</p>` +
            `<p>A critical read, please, before this goes to the client. This is a private internal link — your comments come back to Roheena, not to the client.</p>` +
            `<p><a href="${link}" style="background:#2D2D2D;color:#fff;padding:12px 20px;border-radius:3px;text-decoration:none;display:inline-block">Open the proposal</a></p>` +
            `<p style="color:#6B6B6B;font-size:13px">Leave your suggestions in the comment box inside the page.</p>`,
        });
      }
      return NextResponse.json({ presentation_id: internalId, link, emailed, comments });
    }

    if (action === "approve") {
      const deckPath = p.reviewed_deck_path ?? p.deck_path;
      if (!deckPath) return NextResponse.json({ error: "nothing_to_approve" }, { status: 400 });
      // Approval hands over to the portal (0117): the deck becomes a
      // presentation, and invites/opens/comments run exactly as for an
      // uploaded file.
      const { data: pres, error: presErr } = await supabase.rpc("crm_presentation_create", {
        p_key: key,
        p_company_id: p.company_id,
        p_deal_id: p.deal_id,
        p_title: p.title,
        p_format: "html",
        p_storage_path: deckPath,
        p_require_code: body.require_code === true,
      });
      if (presErr) throw new Error(presErr.message);
      const presId = (pres as { id: string }).id;
      const { error } = await sb.from("crm_proposals")
        .update({ status: "approved", presentation_id: presId }).eq("id", proposalId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ presentation_id: presId });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    console.error(`[studio] ${action} failed:`, e);
    const detail = String(e).slice(0, 300);
    // OpenAI refusing our key is not a failure of this proposal: concept art
    // and research are the only steps still on OpenAI, and a caller (the OS)
    // can carry on to compose and review without them. Named, so it can —
    // and so the one fix, a valid OPENAI_API_KEY on the Worker, is said
    // rather than buried in "failed". 26 October 2026: every concept call
    // answered `openai 401: Incorrect API key provided` behind a bare 502.
    if (/openai 401\b|openai 403\b|Incorrect API key/i.test(detail)) {
      return NextResponse.json({ error: "image_key_invalid", detail,
        fix: "The Worker's OPENAI_API_KEY is refused by OpenAI; set a valid key in Cloudflare. Compose and review work without concept art." }, { status: 503 });
    }
    return NextResponse.json({ error: "failed", detail }, { status: 502 });
  }
}
