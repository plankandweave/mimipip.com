import { istDateKey } from "@/lib/ist";
import { NextResponse } from "next/server";
import { recordAuditRaw } from "@/lib/corporate-auth";
import { sendEmailWithId } from "@/lib/email";
import { SITE_URL } from "@/lib/seo";
import { guardMeasureRequest } from "@/lib/measure-link";

export const dynamic = "force-dynamic";

const DESK_EMAIL = process.env.CORPORATE_DESK_EMAIL || "hello@zyvorah.com";

// POST → the store employee is done.
//
// This deliberately does NOT start the pipeline. It marks the survey submitted
// and asks an HQ admin to release it. Allocation reads every wall photo with
// Opus and composition renders every band — real money — and the person who
// submits is not the person authorised to spend it. One tap from a named admin
// sits between a forwarded link and the bill.
//
// It also returns immediately. Forty walls of composition cannot fit in one
// serverless invocation, and the person who pressed the button is standing in a
// shop with a phone.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const g = await guardMeasureRequest(req, token, "submit");
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { link, store, account, sb } = g.ctx;

  const b = await req.json().catch(() => ({})) as { allowMissingPhotos?: boolean };

  if (!link.batch_id) {
    return NextResponse.json({ ok: false, error: "Nothing has been measured yet." }, { status: 400 });
  }

  const { data: walls } = await sb.from("corporate_site_batch_walls")
    .select("seq, name, width_mm, height_mm, photo_path").eq("batch_id", link.batch_id).order("seq");
  if (!walls?.length) {
    return NextResponse.json({ ok: false, error: "Add at least one wall before sending." }, { status: 400 });
  }

  // A wall with no photo is not a small gap: the allocator decides what artwork
  // suits a wall by looking at it. Let it through only as an explicit choice,
  // and then say so on the record so the approver knows.
  const missing = walls.filter((w) => !w.photo_path).map((w) => w.seq as number);
  if (missing.length && b.allowMissingPhotos !== true) {
    return NextResponse.json({
      ok: false, needs: "photos", missing,
      error: missing.length === 1
        ? `Wall ${missing[0]} has no photo yet.`
        : `${missing.length} walls have no photo yet.`,
    }, { status: 400 });
  }

  const today = istDateKey();
  const title = `${account.name} · ${store.name} · ${today}`;

  // Single-use, enforced by the database rather than by counting. Two taps on a
  // slow connection are one submit — which matters because the second one would
  // otherwise re-notify, and later re-run, a pipeline that costs money.
  const { data: claimed } = await sb.from("corporate_measure_links")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", link.id).is("submitted_at", null)
    .select("id").maybeSingle();
  if (!claimed) {
    return NextResponse.json({
      ok: true, alreadySubmitted: true,
      message: "These measurements have already been sent to head office.",
    });
  }

  const noteSuffix = missing.length
    ? `\n\nSubmitted with no photo on wall${missing.length > 1 ? "s" : ""} ${missing.join(", ")} — the measurer chose to send it anyway.`
    : "";
  await sb.from("corporate_site_batches").update({
    title,
    state: store.state,
    ship_address: store.address_line,
    ship_city: store.city,
    notes: `${link.brief ? `Head office brief: ${link.brief}` : ""}${noteSuffix}`.trim() || null,
  }).eq("id", link.batch_id);

  void recordAuditRaw({
    accountId: link.account_id,
    actorEmail: link.recipient_email,
    action: "measure.submit",
    subject: { type: "site_batch", id: link.batch_id },
    detail: { ref: link.ref, store: store.name, walls: walls.length, missingPhotos: missing },
  });

  // Ask for the release. This is the one notification that matters: until
  // somebody taps it, nothing happens and nothing is spent.
  const releaseUrl = `${SITE_URL}/partners/${account.slug}/site-batches`;
  const sqft = Math.round(walls.reduce(
    (s, w) => s + ((w.width_mm as number) / 304.8) * ((w.height_mm as number) / 304.8), 0));
  const who = link.recipient_name?.trim()
    ? `${link.recipient_name.trim()} (${link.recipient_email})`
    : link.recipient_email;

  void sendEmailWithId({
    to: link.created_by_email,
    cc: DESK_EMAIL,
    subject: `${store.name} — ${walls.length} walls measured, ready to release`,
    html: `<p><b>${store.name}</b> has been measured on site by ${who}.</p>
<p><b>${walls.length} walls · ~${sqft.toLocaleString("en-IN")} sq ft</b>${missing.length ? ` · ${missing.length} without a photo` : ""}.</p>
${link.brief ? `<p style="color:#525252">Your brief was: ${link.brief}</p>` : ""}
<p><a href="${releaseUrl}"><b>Open it and release to design</b></a> — nothing is designed or costed until you do.</p>
<p>— Zyvorah</p>`,
  }).catch((e) => console.error("[measure] release notice failed:", e));

  return NextResponse.json({
    ok: true, walls: walls.length,
    message: "Sent to head office. They'll take it from here.",
  });
}
