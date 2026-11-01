import { partnerCapabilities } from "@/lib/partner-capabilities";
import { NextResponse } from "next/server";
import { currentCorporateSession } from "@/lib/corporate-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DAY, signArt } from "@/lib/corporate-files";
import { caUpload } from "@/lib/corporate-art-store";
import { sendEmail } from "@/lib/email";
import { buildInstallSheet } from "@/lib/install-sheet";
import { renderInstallSheetPdf } from "@/lib/install-sheet-pdf";

export const dynamic = "force-dynamic";
/** Sixteen walls of thumbnails: comfortably inside a minute, but not inside
 *  the default ten seconds. */
export const maxDuration = 60;

/**
 * POST → build the installation sheet as a PDF, store it, and hand back a link
 * that will still resolve when the installer opens it tomorrow.
 *
 * Optionally emails it as an attachment. WhatsApp needs nothing from us: the
 * portal has no WhatsApp integration, so the client builds a wa.me link around
 * the signed URL this returns rather than pretending to send the message
 * itself. Attaching the file to the email but linking it on WhatsApp is not an
 * inconsistency — a mail client shows an attachment, a chat needs something it
 * can preview, and the link is the same file either way.
 *
 * The stored object is overwritten on every build (`upsert: true`, one path per
 * batch). That is deliberate: the sheet reports where production has got to, so
 * keeping revisions would mean handing someone a link that is confidently out
 * of date. See the note in install-sheet-pdf.ts.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await currentCorporateSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (partnerCapabilities(session.account).poRequiredRelease) return NextResponse.json({ error: "Use the private customer workspace. PO acceptance is required." }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { sendTo?: string };
  const sendTo = typeof body.sendTo === "string" ? body.sendTo.trim() : "";
  if (sendTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sendTo)) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  }

  const sheet = await buildInstallSheet(sb, id, session.account.id);
  if (!sheet) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let bytes: Uint8Array;
  try {
    bytes = await renderInstallSheetPdf(sheet);
  } catch (e) {
    console.error("[install-sheet] render failed:", e);
    return NextResponse.json({ error: "Could not build the sheet. Please try again." }, { status: 500 });
  }

  const safeTitle = sheet.title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
  const filename = `Installation-sheet-${safeTitle || "site"}.pdf`;
  const path = `install-sheets/${session.account.slug}/${sheet.batchId}.pdf`;

  const up = await caUpload(
    path,
    Buffer.from(bytes),
    { contentType: "application/pdf", upsert: true },
  );
  if (up.error) {
    console.error("[install-sheet] upload failed:", up.error.message);
    return NextResponse.json({ error: "Could not save the sheet." }, { status: 500 });
  }

  // Long enough that a link forwarded to an installer outlives the job, since
  // the person who opens it will never have a portal session of their own.
  const url = await signArt(sb, path, DAY * 90);
  if (!url) return NextResponse.json({ error: "Could not link the sheet." }, { status: 500 });

  let emailed = false;
  let emailError: string | null = null;
  if (sendTo) {
    const t = sheet.totals;
    emailed = await sendEmail({
      to: sendTo,
      // The installer replies to whoever sent it, not to a mailbox nobody reads.
      replyTo: session.email,
      subject: `Installation sheet — ${sheet.title}`,
      html: installEmailHtml(sheet.title, t.wallsReady, t.walls, t.stripsReady, url, sheet.statusUnknown),
      attachments: [{ filename, content: Buffer.from(bytes).toString("base64") }],
    });
    if (!emailed) emailError = "The sheet was built but the email could not be sent.";
  }

  return NextResponse.json({
    ok: true,
    url,
    filename,
    emailed,
    ...(emailError ? { warning: emailError } : {}),
    totals: sheet.totals,
  });
}

function installEmailHtml(
  title: string, ready: number, walls: number, strips: number, url: string, statusUnknown: boolean,
): string {
  const e = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // Counting dispatched walls off a status we could not fetch would put a
  // precise, wrong number in someone's inbox. Say what is actually known.
  const opening = statusUnknown
    ? `The sheet is attached and lists all ${walls} walls with the ZVY number printed on the rolls that go on each one.
       <strong>Production could not be reached, so the printed/dispatched status on it is not reliable</strong> — the walls and roll numbers are.`
    : `${ready} of ${walls} walls are dispatched — ${strips} strips ready to hang.
       The sheet is attached, and lists every wall with the ZVY number printed on the rolls that go on it.`;
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#171b22;line-height:1.55">
  <h2 style="margin:0 0 4px;font-size:18px">Installation sheet</h2>
  <p style="margin:0 0 16px;color:#5a626f;font-size:14px">${e(title)}</p>
  <p style="margin:0 0 16px;font-size:14px">${opening}</p>
  <p style="margin:0 0 16px;font-size:14px">
    Match the <strong>ZVY number</strong> on each roll's header band to the wall on the sheet before pasting.
    A roll's own &ldquo;PIECE n OF m&rdquo; counts strips inside that roll, not pieces of the wall.
  </p>
  <p style="margin:0 0 20px">
    <a href="${e(url)}" style="display:inline-block;background:#171b22;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Open the sheet</a>
  </p>
  <p style="margin:0;color:#878e9b;font-size:12px">
    Status is as at the moment this was sent and changes as consignments dispatch.
  </p>
</div>`;
}
