import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import { supabaseAdmin } from "./supabase-admin";
import { sendEmail, sendEmailWithId } from "./email";
import { founderNoteEmail, orderQueuedEmail, orderDetailsEmail, type OrderEmailData } from "./email-templates";
import { fetchInstallBrief } from "./os-install";
import { cleanProductAttributes, type RawAttributes } from "./seo";
import { CM_PER_FOOT, womenContribution, INSTALL_RATE_EX_GST, GST_RATE } from "./pricing";
import { anthropicKeyFor } from "@/lib/ai-keys";

const MODEL = "claude-sonnet-5";
const FROM = "Roheena, Zyvorah <roheena@zyvorah.com>";
const REPLY_TO = "hello@zyvorah.com";

// Two founder-voice prompts: one for a full wallpaper order, one for a ₹200
// A4 SAMPLE. A sample is a small printed piece to see and feel a design before
// committing to a wall — so it must never be written as if the wall was bought.
const SYSTEM_ORDER = `You are Roheena, founder of Zyvorah — an Indian brand of original mural wallpaper designs. Write a short, warm, genuinely personal note to a customer who has just placed an order. It is from you, the founder.

Voice: warm, intelligent, elegant — a little poetic but never flowery, clichéd, or salesy. Indian English. Heartfelt and confident, like a founder who deeply loves what she makes.

Write:
- Open by acknowledging THEIR specific order — mention the design by name naturally. If (and only if) the design's character clearly implies a room or purpose, you may gently reference it; never invent a room they didn't specify. If they visualised it in their own room, you may warmly acknowledge that they've already imagined it on their wall.
- Then a beautiful thought or two on the quiet magic of wallpaper: how a single wall can hold a mood, tell a story, change how a whole room feels and how it feels to live in it. Make it feel true.
- Close looking forward to it living on their wall.

Rules:
- 110–170 words total.
- Do NOT ask them to reply, or offer to personally help — this is a one-way note.
- Do NOT mention price, GST, shipping, delivery, or logistics.
- Do NOT write a greeting ("Dear …") or a sign-off/signature — those are added around your text.
- Output ONLY 2–3 short paragraphs of clean HTML, each wrapped in <p>…</p>. No markdown, no code fences, nothing else.`;

const SYSTEM_SAMPLE = `You are Roheena, founder of Zyvorah — an Indian brand of original mural wallpaper designs. Write a short, warm, genuinely personal note to a customer who has just ordered a SAMPLE: a small, printed A4 piece of one of our designs, so they can see the print and feel the material in their own home before committing to a whole wall. It is from you, the founder.

Voice: warm, intelligent, elegant — a little poetic but never flowery, clichéd, or salesy. Indian English. Heartfelt and confident, like a founder who deeply loves what she makes.

Write:
- Open by warmly acknowledging that they've ordered a SAMPLE of THEIR specific design (mention the design by name naturally). Treat sampling as a thoughtful, considered thing to do — the mark of someone who chooses carefully.
- Then a beautiful thought or two on WHY holding a real piece matters: seeing the print up close, feeling the material, living with it against their own wall and their own light before deciding.
- Close looking forward to the sample helping them choose — and, gently, to the wall it may one day become.

Rules:
- 110–170 words total.
- This is a SAMPLE, not the wall. NEVER say the design is "coming alive on your wall", that "your wall" will carry it, or anything implying they've bought the mural. They are holding a small piece to help them decide.
- Do NOT ask them to reply, or offer to personally help — this is a one-way note.
- Do NOT mention price, GST, shipping, delivery, or logistics.
- Do NOT write a greeting ("Dear …") or a sign-off/signature — those are added around your text.
- Output ONLY 2–3 short paragraphs of clean HTML, each wrapped in <p>…</p>. No markdown, no code fences, nothing else.`;

function clampParagraphs(raw: string): string {
  let s = raw.trim().replace(/```html/gi, "").replace(/```/g, "").trim();
  if (!/<p[ >]/i.test(s)) {
    s = s
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 14px;">${p.trim()}</p>`)
      .join("");
  }
  return s;
}

function escLite(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A sample order carries its design in the notes field (no line items):
//   "Printed design sample — Lotus Procession (lotus-procession)\n
//    Lotus Procession · Soft Matte · Qty 1 · Rs 200"
function parseSampleNotes(notes: string | null | undefined): {
  title: string | null;
  handle: string | null;
  material: string | null;
} {
  if (!notes) return { title: null, handle: null, material: null };
  const m = notes.match(/—\s*(.+?)\s*\(([^)]+)\)/);
  const line2 = notes.split("\n")[1] ?? "";
  const parts = line2.split("·").map((p) => p.trim());
  return {
    title: m?.[1]?.trim() ?? null,
    handle: m?.[2]?.trim() ?? null,
    material: parts[1] ?? null,
  };
}

// The flat (clean pattern) image for a design, so the sample email can show
// what was sampled.
async function flatImageForHandle(handle: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("products")
      .select("product_images(url,is_flat,position)")
      .eq("handle", handle)
      .maybeSingle();
    const imgs = ((data?.product_images as { url: string; is_flat: boolean; position: number }[]) ?? []).slice();
    const flat = imgs.find((i) => i.is_flat) ?? imgs.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
    return flat?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Send the personalised "note from the founder" for a newly-paid order —
 * fully autonomous. AI-written by Claude, and now sample-aware: a ₹200 A4
 * sample gets a sample-specific letter and confirmation block, never mural
 * copy. Falls back to a plain confirmation if AI (or its key) is unavailable,
 * so the customer always gets one email. Idempotent via the 'paid' slot.
 */
export async function sendFounderNote(orderId: string): Promise<void> {
  // Service role, not the anon key: these SECURITY DEFINER RPCs have no
  // internal auth gate, so as anon they were reachable from the browser key.
  const sb = supabaseAdmin();
  if (!sb) {
    console.error("founder-email: SUPABASE_SERVICE_ROLE_KEY not configured");
    return undefined;
  }

  const { data: claimed } = await supabase.rpc("claim_order_notification", {
    p_order_id: orderId,
    p_status: "paid",
  });
  if (!claimed) return; // already sent

  const { data: bundle } = await sb.rpc("get_order_for_invoice", { p_order_id: orderId });
  const b = bundle as {
    order?: OrderEmailData & {
      email?: string | null;
      shipping_address?: { name?: string } | null;
      placed_via?: string | null;
      notes?: string | null;
    };
    items?: {
      product_title?: string | null;
      product_handle?: string | null;
      material_name?: string | null;
      preview_url?: string | null;
      crop_data?: { imageUrl?: string | null; wallWidthCm?: number; wallHeightCm?: number } | null;
    }[];
  } | null;
  const order = b?.order;
  if (!order?.email) return;

  const isSample = order.placed_via === "sample";
  const fullName = order.shipping_address?.name?.trim() || "";
  const firstName = fullName ? fullName.split(/\s+/)[0] : null;

  // Women-entrepreneurs contribution (funded by Zyvorah) — sum ₹1 per chargeable
  // sq ft across the order's eligible wallpaper lines. Samples have no such
  // lines, so this is naturally 0 for them. Best-effort; never blocks the email.
  let contribution = 0;
  // On-site installation (Bengaluru/Mumbai/Pune): a line carries it in
  // crop_data.installation. If any line does, our team fits the whole order, so
  // the day's time estimate is driven by the total measured area across lines.
  let installByUs = false;
  let installAreaSqft = 0;
  if (!isSample) {
    const { data: rows } = await supabase
      .from("order_items")
      .select("area_sqft, quantity, crop_data")
      .eq("order_id", orderId);
    const items =
      (rows as {
        area_sqft: number | null;
        quantity: number | null;
        crop_data: { installation?: { total?: number | string | null } | null } | null;
      }[]) ?? [];
    contribution = items.reduce(
      (s, r) => s + womenContribution(Number(r.area_sqft) || 0, Number(r.quantity) || 1),
      0,
    );
    installByUs = items.some((r) => r.crop_data?.installation != null);
    if (installByUs) {
      // Back-derived from what installation was CHARGED, not from area_sqft —
      // that carries the small-order billing minimum and would overstate the
      // area the fitter actually faces. Matches order-notify.ts.
      installAreaSqft = items.reduce((s, r) => {
        const charged = Number(r.crop_data?.installation?.total ?? 0);
        return charged > 0 ? s + charged / (INSTALL_RATE_EX_GST * (1 + GST_RATE)) : s;
      }, 0);
    }
  }

  // Resolve the design, image, material line + AI context for both paths.
  let title: string | null = null;
  let handle: string | null = null;
  let material: string | null = null;
  let imageUrl: string | null = null;
  let designLine: string | null = null;
  let sizeFt: { width: number; height: number } | null = null;
  let visualisedInOwnRoom = false;

  if (isSample) {
    const parsed = parseSampleNotes(order.notes);
    title = parsed.title;
    handle = parsed.handle;
    material = parsed.material;
    imageUrl = handle ? await flatImageForHandle(handle) : null;
    designLine = [title, "A4 sample", material].filter(Boolean).join(" · ") || null;
  } else {
    const first = b?.items?.[0];
    title = first?.product_title ?? null;
    handle = first?.product_handle ?? null;
    material = first?.material_name ?? null;
    imageUrl = first?.preview_url || first?.crop_data?.imageUrl || null;
    const w = first?.crop_data?.wallWidthCm ? Math.round((first.crop_data.wallWidthCm / CM_PER_FOOT) * 10) / 10 : null;
    const h = first?.crop_data?.wallHeightCm ? Math.round((first.crop_data.wallHeightCm / CM_PER_FOOT) * 10) / 10 : null;
    sizeFt = w && h ? { width: w, height: h } : null;
    visualisedInOwnRoom = Boolean(first?.preview_url);
    designLine = [title, sizeFt ? `${sizeFt.width} × ${sizeFt.height} ft` : null, material].filter(Boolean).join(" · ") || null;
  }

  // Who is coming, and on what number — so the customer knows from the moment
  // they order and never has to ring us wondering. The OS assigns the fitter;
  // pushOrderToOs() has already run by now, so it usually knows this order.
  const brief = installByUs ? await fetchInstallBrief(order.access_token) : null;

  const emailData: OrderEmailData = {
    ...order,
    imageUrl,
    productTitle: title,
    contribution,
    installByUs,
    installAreaSqft: installByUs ? installAreaSqft : null,
    installerName: brief?.installerName ?? null,
    installerPhone: brief?.installerPhone ?? null,
  };

  /**
   * The practical companion, delivered an hour after the letter.
   *
   * Handed to Resend immediately with scheduled_at, rather than queued for a
   * cron of ours: Resend holds it, so it can't be lost to a deploy, a cold
   * lambda or a missed tick. Sent inside the caller's already-claimed 'paid'
   * slot, so it inherits that idempotency and can never go out twice.
   *
   * A sample gets nothing here — there is no wall, no fitting and no panel QC
   * photograph to promise, and a checklist for a ₹200 A4 piece is noise.
   */
  const scheduleDetails = async () => {
    if (isSample) return;
    const { subject, html } = orderDetailsEmail(emailData);
    const { ok } = await sendEmailWithId({
      to: order.email!,
      subject,
      html,
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    if (!ok) console.error(`details email not scheduled for order ${orderId}`);
  };

  // Best-effort design attributes for richer personalisation.
  let attrs: ReturnType<typeof cleanProductAttributes> | null = null;
  if (handle) {
    try {
      const { data: raw } = await supabase.rpc("product_attributes", { p_handle: handle });
      attrs = cleanProductAttributes(raw as RawAttributes | null);
    } catch {
      /* attributes are optional */
    }
  }

  // Fallback path: a plain, on-brand confirmation that's still correct for the
  // order kind (never mural copy for a sample).
  const sendFallback = () => {
    if (isSample) {
      const letterHtml =
        `<p>Your sample of ${title ? escLite(title) : "the design"} is on its way — a small A4 piece you can hold up to your own wall, in your own light.</p>` +
        `<p>There's no better way to choose than to see the print up close and feel the material in your hands. Take your time with it.</p>`;
      const { subject, html } = founderNoteEmail(emailData, { letterHtml, firstName, designLine, isSample: true });
      return sendEmail({ to: order.email!, subject, html, from: FROM, replyTo: REPLY_TO });
    }
    return sendEmail({ to: order.email!, ...orderQueuedEmail(emailData) });
  };

  if (!anthropicKeyFor("founder")) {
    await sendFallback();
    await scheduleDetails().catch((e) => console.error("details email failed to schedule:", e));
    return;
  }

  try {
    const context = {
      firstName,
      kind: isSample ? "sample" : "order",
      design: {
        title,
        subject: attrs?.subjects ?? [],
        style: attrs?.styles ?? [],
        colours: attrs?.colours ?? [],
        rooms: attrs?.rooms ?? [],
      },
      material,
      ...(isSample ? {} : { sizeFt, visualisedInOwnRoom }),
    };

    const client = new Anthropic({ apiKey: anthropicKeyFor("founder"), maxRetries: 2 });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: isSample ? SYSTEM_SAMPLE : SYSTEM_ORDER,
      messages: [{ role: "user", content: JSON.stringify(context) }],
    });
    const letterHtml = clampParagraphs(
      response.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join(""),
    );
    if (!letterHtml) throw new Error("empty letter");

    const { subject, html } = founderNoteEmail(emailData, { letterHtml, firstName, designLine, isSample });
    await sendEmail({ to: order.email, subject, html, from: FROM, replyTo: REPLY_TO });
  } catch (e) {
    console.error("founder note generation failed — sending standard confirmation:", e);
    await sendFallback();
  }
  // The letter is the welcome; this is the manual. Scheduled last so a failure
  // here can never cost the customer their confirmation, and outside the
  // try/catch above so it still goes out when the AI letter fell back.
  await scheduleDetails().catch((e) => console.error("details email failed to schedule:", e));
}
