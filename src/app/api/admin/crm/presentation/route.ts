import { NextResponse } from "next/server";
import { staffKey } from "@/lib/staff-key";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  mintToken, uploadDeck, signedUploadUrl, objectExists, signedPlaybackUrl,
  VIDEO_TYPES, MAX_VIDEO_BYTES,
} from "@/lib/presentation";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin side of the portal: upload a deck, invite a recipient, send the link.
//
// A route rather than a browser-side Supabase call because uploading into a
// private bucket needs the service role, and the service role must never reach
// the browser. The admin key is validated in the database, as everywhere else.

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — the Outcreate deck is 32 KB
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function keyOk(key: string): Promise<boolean> {
  if (!key) return false;
  const { data, error } = await supabase.rpc("admin_key_ok", { p_key: key });
  return !error && data === true;
}

/** The file behind a presentation, for staff: a two-hour signed link to the
 *  stored deck, film or PDF, so what the CRM holds for a company can be
 *  opened — or read back into something else, such as a wall picture on a
 *  quotation — without going back to Drive for a copy. */
export async function GET(req: Request) {
  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "no_db" }, { status: 503 });
  const { data: row } = await sb.from("crm_presentations")
    .select("id, company_id, title, format, storage_path, status, created_at").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = await signedPlaybackUrl(row.storage_path as string);
  if (!url) return NextResponse.json({ error: "no_file" }, { status: 404 });
  return NextResponse.json({ ok: true, presentation: row, url }, { headers: { "cache-control": "private, no-store" } });
}

/** Upload a deck and create the presentation row.
 *
 *  Two shapes, by content type:
 *
 *  multipart/form-data — the original path, for an HTML deck or a PDF. Small
 *  files, so the bytes may travel through here.
 *
 *  application/json — the two-step path a video needs. `step: "sign"` hands
 *  back a URL the browser uploads the file to directly; `step: "create"` makes
 *  the row once that upload has landed. A 40 MB film cannot go through the
 *  route itself: a Worker has neither the memory to hold it nor a request body
 *  limit that large. */
export async function POST(req: Request) {
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    return postVideo(req);
  }
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad_form" }, { status: 400 });

  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const file = form.get("file");
  const companyId = String(form.get("company_id") ?? "");
  const dealId = String(form.get("deal_id") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const requireCode = String(form.get("require_code") ?? "") === "true";

  if (!(file instanceof File) || !companyId || !title) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  // Format is decided by the extension, and only these two are accepted. An
  // upload we cannot serve safely is refused here rather than discovered by a
  // recipient staring at a broken frame.
  const lower = file.name.toLowerCase();
  const format = lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".html") || lower.endsWith(".htm") ? "html" : null;
  if (!format) return NextResponse.json({ error: "bad_format" }, { status: 415 });

  // Path is uuid-keyed, never the uploaded filename: a filename is attacker-ish
  // input (traversal, collisions) and carries no meaning once the row exists.
  const path = `${companyId}/${crypto.randomUUID()}.${format}`;
  const stored = await uploadDeck(
    path,
    await file.arrayBuffer(),
    format === "pdf" ? "application/pdf" : "text/html",
  );
  if (!stored) return NextResponse.json({ error: "upload_failed" }, { status: 502 });

  const { data, error } = await supabase.rpc("crm_presentation_create", {
    p_key: key,
    p_company_id: companyId,
    p_deal_id: dealId || null,
    p_title: title,
    p_format: format,
    p_storage_path: path,
    p_require_code: requireCode,
  });
  if (error) {
    console.error("[presentation] create failed:", error.message);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** The video path: sign an upload, then create the row once it has landed.
 *
 *  Authorisation is the staff session, exactly as the deck path above — the
 *  browser sends no key, and the signed upload URL is minted server-side. */
async function postVideo(req: Request) {
  const body = await req.json().catch(() => null);
  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const companyId = String(body?.company_id ?? "");
  if (!UUID_RE.test(companyId)) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (body?.step === "sign") {
    const ext = String(body?.ext ?? "").toLowerCase();
    if (!VIDEO_TYPES[ext]) return NextResponse.json({ error: "bad_format" }, { status: 415 });
    const size = Number(body?.size ?? 0);
    if (!(size > 0)) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    if (size > MAX_VIDEO_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

    // uuid-keyed, never the uploaded filename — the same reason as the deck
    // path, and here it also means the URL handed to the browser can only
    // write a fresh object of ours, never overwrite an existing one.
    const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
    const signed = await signedUploadUrl(path);
    if (!signed) return NextResponse.json({ error: "upload_failed" }, { status: 502 });
    return NextResponse.json(signed);
  }

  if (body?.step === "create") {
    const path = String(body?.storage_path ?? "");
    const title = String(body?.title ?? "").trim();
    const dealId = String(body?.deal_id ?? "");
    const requireCode = body?.require_code === true;

    // The path must be one minted for THIS company, and the object must
    // actually be there. Without the prefix check a caller could attach
    // another company's file; without the existence check an upload that
    // failed halfway would leave a row pointing at nothing, and a recipient
    // looking at a dead player.
    if (!title || !path.startsWith(`${companyId}/`) || !VIDEO_TYPES[path.split(".").pop() ?? ""]) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
    if (!(await objectExists(path))) {
      return NextResponse.json({ error: "upload_failed" }, { status: 409 });
    }

    const { data, error } = await supabase.rpc("crm_presentation_create", {
      p_key: key,
      p_company_id: companyId,
      p_deal_id: dealId || null,
      p_title: title,
      p_format: "video",
      p_storage_path: path,
      p_require_code: requireCode,
    });
    if (error) {
      console.error("[presentation] create failed:", error.message);
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "bad_step" }, { status: 400 });
}

/** Create a recipient link; email it unless staff explicitly request notify:false. */
export async function PUT(req: Request) {
  const payload = await req.json().catch(() => null);
  const key = await staffKey(req);
  if (!(await keyOk(key))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const presentationId = String(payload?.presentation_id ?? "");
  const email = String(payload?.email ?? "").trim().toLowerCase();
  const name = String(payload?.name ?? "").trim();
  if (!presentationId || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const token = mintToken();
  const { data, error } = await supabase.rpc("crm_presentation_add_recipient", {
    p_key: key,
    p_presentation_id: presentationId,
    p_email: email,
    p_name: name || null,
    p_token: token,
  });
  if (error) {
    console.error("[presentation] add recipient failed:", error.message);
    return NextResponse.json({ error: "add_failed" }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://zyvorah.com";
  const link = `${origin}/p/${token}`;
  // Creating a link for a separately scheduled client email must not send an
  // invitation now or mark it sent. Only literal false opts out; old callers
  // retain their existing invitation behaviour and the same access checks.
  if (payload?.notify === false) {
    return NextResponse.json({ ...(data as object), link, emailed: false });
  }

  const sb = supabaseAdmin();
  const { data: pres } = sb
    ? await sb.from("crm_presentations").select("title, require_code").eq("id", presentationId).maybeSingle()
    : { data: null };

  const title = pres?.title ?? "your proposal";

  const sent = await sendEmail({
    to: email,
    subject: `${title} — from Zyvorah`,
    html:
      `<p>${name ? `${escapeHtml(name)},` : "Hello,"}</p>` +
      `<p>We&rsquo;ve put together <strong>${escapeHtml(title)}</strong> for you.</p>` +
      `<p><a href="${link}" style="background:#2D2D2D;color:#fff;padding:12px 20px;border-radius:3px;text-decoration:none;display:inline-block">Open the proposal</a></p>` +
      `<p style="color:#6B6B6B;font-size:13px">This link is yours alone${
        pres?.require_code ? " and will ask for a code we email to this address" : ""
      }. You can comment on it, or ask us for a call, from inside the page.</p>`,
  });

  // The link is returned regardless, so a mail outage does not strand the
  // invitation — Roheena can copy it and send it herself.
  if (sent) {
    await supabase.rpc("crm_presentation_set_status", {
      p_key: key, p_id: presentationId, p_status: "sent",
    });
    const sbAdmin = supabaseAdmin();
    if (sbAdmin) {
      await sbAdmin.from("crm_presentation_recipients")
        .update({ invited_at: new Date().toISOString() })
        .eq("token", token);
    }
  }

  return NextResponse.json({ ...(data as object), link, emailed: sent });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
