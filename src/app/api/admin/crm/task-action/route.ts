import { NextResponse } from "next/server";
import { staffKey } from "@/lib/staff-key";
import { supabase } from "@/lib/supabase";
import { istDateKey } from "@/lib/ist";
import {
  bodyToHtml, contextHash, draftTask, sentNote,
  type CrmTaskContext, type TaskDraft,
} from "@/lib/crm-task-action";
import { FOUNDER_ADDRESS, founderMailProvider, founderSenderReady, sendAsFounder } from "@/lib/founder-mail";
import { PREPARED_HASH, preparedHtml, type PreparedOption } from "@/lib/crm-prepared";
import { recordQuotationSent, renderDraftAttachments, type DraftAttachmentRef } from "@/lib/quotation/store";
import { anthropicKeyFor } from "@/lib/ai-keys";

export const runtime = "nodejs";
// Opus with adaptive thinking writing one or two emails.
export const maxDuration = 60;

// The CRM task that does itself.
//
//   POST { task_id, action: "draft", regenerate? }
//        → the drafted email(s) for this task. Cached against the context it
//          was written from, so reopening is instant and it only rewrites when
//          something changed (or Roheena asks for a fresh take).
//   POST { task_id, action: "send", option: { to, cc, subject, body, gmail_thread_id }, followup? }
//        → sends it as roheena@zyvorah.com, then — only after the send
//          succeeded — logs it on the timeline and ticks the task.
//
// Gated on the staff sign-in before anything else, and specifically before the
// model call: this endpoint spends tokens and sends email under the founder's
// name, so an unauthenticated caller would be both a billing hole and an
// impersonation one.

const EMAIL_RE = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const key = await staffKey(req);
  const taskId = typeof body?.task_id === "string" ? body.task_id : "";
  const action = body?.action;
  if (!key || !taskId || (action !== "draft" && action !== "send")) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { data: ok, error: keyErr } = await supabase.rpc("admin_key_ok", { p_key: key });
  if (keyErr || ok !== true) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: ctxData, error: ctxErr } = await supabase.rpc("crm_task_context", { p_key: key, p_task_id: taskId });
  if (ctxErr || !ctxData) {
    return NextResponse.json({ error: ctxErr?.message === "not_found" ? "not_found" : "context_failed" }, { status: 404 });
  }
  const ctx = ctxData as CrmTaskContext;
  if (ctx.task && (ctx.task as { done_at?: string | null }).done_at) {
    return NextResponse.json({ error: "task_done" }, { status: 409 });
  }

  return action === "draft" ? draft(key, ctx, body?.regenerate === true) : send(key, ctx, body);
}

async function draft(key: string, ctx: CrmTaskContext, regenerate: boolean) {
  const hash = contextHash(ctx);
  const meta = {
    provider: founderMailProvider(),
    sender_ready: await founderSenderReady(),
    from: FOUNDER_ADDRESS,
    threads: ctx.threads.map((t) => ({ gmail_thread_id: t.gmail_thread_id, subject: t.subject, last_at: t.last_at })),
    notes: ctx.notes.length,
  };

  // A hand-prepared email (crm-prepared.ts) is always current: the drafter
  // never rewrites it behind Roheena's back, only on "Write it again".
  if (!regenerate && ctx.draft && (ctx.draft.context_hash === hash || ctx.draft.context_hash === PREPARED_HASH)) {
    return NextResponse.json({ draft: ctx.draft.draft, generated_at: ctx.draft.generated_at, cached: true, ...meta });
  }
  if (!anthropicKeyFor("crm")) {
    return NextResponse.json({ error: "drafter_unconfigured" }, { status: 503 });
  }

  let d: TaskDraft;
  try {
    d = await draftTask(ctx, istDateKey());
  } catch (e) {
    console.error("[crm/task-action] draft failed:", e);
    // A stale draft beats none: if the context moved on but the model is
    // unavailable, hand back what we had and say it may be out of date.
    if (ctx.draft) {
      return NextResponse.json({ draft: ctx.draft.draft, generated_at: ctx.draft.generated_at, cached: true, stale: true, ...meta });
    }
    return NextResponse.json({ error: "draft_failed" }, { status: 502 });
  }

  const { error: saveErr } = await supabase.rpc("crm_task_draft_save", {
    p_key: key, p_task_id: ctx.task.id, p_draft: d, p_hash: hash,
  });
  if (saveErr) console.error("[crm/task-action] draft save failed:", saveErr.message);

  return NextResponse.json({ draft: d, generated_at: new Date().toISOString(), cached: false, ...meta });
}

type SendBody = {
  option?: { to?: unknown; cc?: unknown; subject?: unknown; body?: unknown; gmail_thread_id?: unknown };
  /** Which drafted option this is, so a prepared one can go as its stored HTML. */
  option_index?: unknown;
  followup?: { title?: unknown; days?: unknown };
};

const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\s]+/) : [])
    .map((a) => String(a).trim().toLowerCase())
    .filter(Boolean);

async function send(key: string, ctx: CrmTaskContext, raw: SendBody) {
  const o = raw.option ?? {};
  const to = [...new Set(list(o.to))];
  const cc = [...new Set(list(o.cc))].filter((a) => !to.includes(a));
  const subject = typeof o.subject === "string" ? o.subject.trim() : "";
  const text = typeof o.body === "string" ? o.body.trim() : "";
  const threadId = typeof o.gmail_thread_id === "string" ? o.gmail_thread_id : "";

  const bad = [...to, ...cc].filter((a) => !EMAIL_RE.test(a));
  if (!to.length) return NextResponse.json({ error: "no_recipient" }, { status: 400 });
  if (bad.length) return NextResponse.json({ error: "bad_address", detail: bad.join(", ") }, { status: 400 });
  if (!subject || text.length < 20) return NextResponse.json({ error: "empty_email" }, { status: 400 });
  // An unfilled [[placeholder]] reaching a Chairman is the one mistake this
  // screen exists to prevent. Refuse it here as well as in the browser.
  if (/\[\[[^\]]*\]\]/.test(text) || /\[\[[^\]]*\]\]/.test(subject)) {
    return NextResponse.json({ error: "placeholder_left" }, { status: 400 });
  }

  const thread = ctx.threads.find((t) => t.gmail_thread_id === threadId) ?? null;
  // The stored HTML, never the browser's — and only while the words are still
  // the prepared words (crm-prepared.ts).
  const idx = typeof raw.option_index === "number" ? raw.option_index : -1;
  const stored = ctx.draft?.draft.options[idx] as (PreparedOption & { attachments?: DraftAttachmentRef[] }) | undefined;
  const html = preparedHtml(stored, { subject, body: text }) ?? bodyToHtml(text);
  // Files come from the STORED option only (a quotation the desk prepared),
  // rendered now from the quotation row — the browser can name nothing. They
  // ride whether or not she edited the words: the quotation is the point.
  const refs = Array.isArray(stored?.attachments) ? stored.attachments : [];
  let attachments: Awaited<ReturnType<typeof renderDraftAttachments>> = [];
  try {
    attachments = refs.length ? await renderDraftAttachments(refs) : [];
  } catch (e) {
    return NextResponse.json({ error: "send_failed", detail: e instanceof Error ? e.message : "attachment failed" }, { status: 409 });
  }
  const result = await sendAsFounder({
    to, cc, subject, text,
    html,
    gmailThreadId: thread?.gmail_thread_id ?? null,
    inReplyTo: thread?.last_message_id ?? null,
    attachments,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "send_failed", detail: result.error }, { status: 502 });
  }
  if (refs.length) {
    // The quotation has left: it is sent, and the deal is quoted. Best
    // effort after the fact, like the timeline note below.
    const emailUnedited = !!stored && stored.subject.trim() === subject && stored.body.trim() === text;
    try { await recordQuotationSent(refs, { messageId: result.messageId, to, cc, emailUnedited }); }
    catch (e) { console.error("[crm/task-action] quotation not marked sent:", e); }
  }

  const f = raw.followup ?? {};
  const followTitle = typeof f.title === "string" ? f.title.trim() : "";
  const days = typeof f.days === "number" && f.days > 0 && f.days < 120 ? Math.round(f.days) : 0;
  const due = days ? new Date(Date.now() + days * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 10) : "";

  // The email has left. If recording it fails, say so plainly — she must not
  // press Send again and deliver it twice.
  const { error: recErr } = await supabase.rpc("crm_task_record_send", {
    p_key: key,
    p_task_id: ctx.task.id,
    p_payload: {
      note: sentNote({ to, cc, subject, body: text }),
      message_id: result.messageId ?? "",
      provider: result.provider,
      gmail_thread_id: thread?.gmail_thread_id ?? "",
      followup_title: followTitle && days ? followTitle : "",
      followup_due_on: due,
    },
  });
  if (recErr) {
    console.error("[crm/task-action] sent but not recorded:", recErr.message);
    return NextResponse.json({ ok: true, provider: result.provider, recorded: false });
  }
  return NextResponse.json({ ok: true, provider: result.provider, recorded: true, followup_due_on: due || null });
}
