"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRpc } from "@/lib/admin-rpc";
import { VIDEO_TYPES, MAX_VIDEO_BYTES } from "@/lib/presentation-format";

// Presentations for one company: upload a deck, invite people, watch who
// actually opened it, and read what they said back.
//
// The open counters are the part that did not exist before. The Outcreate page
// could not tell Roheena whether it had ever been read; this can.

type Recipient = {
  id: string; email: string; name: string | null; token: string;
  invited_at: string | null; revoked_at: string | null;
  first_opened_at: string | null; last_opened_at: string | null; open_count: number;
};
type Comment = {
  id: string; body: string; anchor: string | null;
  kind: "comment" | "call"; created_at: string; from: string | null;
};
export type Presentation = {
  id: string; title: string; format: "html" | "pdf" | "video"; status: string;
  require_code: boolean; deal_id: string | null;
  created_at: string; sent_at: string | null;
  recipients: Recipient[]; comments: Comment[];
};

// The same list the server validates against, not a second copy of it — the
// ceiling it names is the bucket's own file_size_limit, which is what actually
// bites when the bytes arrive.
const VIDEO_EXTS = Object.keys(VIDEO_TYPES);
const MAX_VIDEO_MB = Math.round(MAX_VIDEO_BYTES / 1024 / 1024);

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "—";

export function Presentations({
  companyId, deals,
}: {
  companyId: string;
  deals: { id: string; title: string }[];
}) {
  const [rows, setRows] = useState<Presentation[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminRpc("crm_presentations_for_company", {
      p_company_id: companyId,
    });
    if (error) { setErr(error.message); return; }
    setErr(null);
    setRows((data ?? []) as Presentation[]);
  }, [companyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section className="mt-8">
      <h2 className="font-display text-sm font-bold">Presentations</h2>
      <p className="mt-1 text-xs text-slate">
        A private, revocable link per person — and a record of who opened it.
      </p>

      <Upload companyId={companyId} deals={deals} onDone={load} />

      {err && <p className="mt-3 text-xs text-charcoal/80">{err}</p>}

      <div className="mt-4 space-y-4">
        {(rows ?? []).map((p) => (
          <Card key={p.id} p={p} onChange={load} />
        ))}
        {rows?.length === 0 && (
          <p className="text-xs text-slate">Nothing sent to this company yet.</p>
        )}
      </div>
    </section>
  );
}

function Upload({
  companyId, deals, onDone,
}: {
  companyId: string;
  deals: { id: string; title: string }[]; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dealId, setDealId] = useState(deals[0]?.id ?? "");
  const [requireCode, setRequireCode] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const videoExt = file
    ? VIDEO_EXTS.find((e) => file.name.toLowerCase().endsWith(`.${e}`))
    : undefined;

  const fail = (code: string | undefined) =>
    setErr(
      code === "bad_format" ? "Upload an .html, .pdf, .mp4, .webm or .mov file."
      : code === "too_large" ? `That file is over ${videoExt ? `${MAX_VIDEO_MB} MB` : "12 MB"}.`
      : "Upload failed.");

  // A film is uploaded on its own request, against a URL the server signs
  // for it, rather than inside the JSON call that creates the row: the row is
  // only created once the file is known to have landed.
  const submitVideo = async (ext: string, chosen: File): Promise<boolean> => {
    const ask = async (payload: Record<string, unknown>) => {
      const r = await fetch("/api/admin/crm/presentation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, ...payload }),
      });
      return { ok: r.ok, body: await r.json().catch(() => null) };
    };

    const signed = await ask({ step: "sign", ext, size: chosen.size });
    if (!signed.ok) { fail(signed.body?.error); return false; }

    // The file goes to our own upload route against the one-path token the
    // server just minted; the Worker streams it into the private R2 store.
    const put = await fetch(signed.body.signedUrl, {
      method: "PUT",
      headers: { "content-type": chosen.type || `video/${ext}` },
      body: chosen,
    }).catch(() => null);
    if (!put?.ok) {
      setErr(put?.status === 413
        ? `That file is over ${MAX_VIDEO_MB} MB.`
        : "The upload didn't finish. Try again.");
      return false;
    }

    const made = await ask({
      step: "create",
      storage_path: signed.body.path,
      deal_id: dealId,
      title: title.trim(),
      require_code: requireCode,
    });
    if (!made.ok) { fail(made.body?.error); return false; }
    return true;
  };

  const submit = async () => {
    if (!file || !title.trim()) return;
    setBusy(true); setErr(null);

    if (videoExt) {
      const ok = await submitVideo(videoExt, file);
      setBusy(false);
      if (!ok) return;
      setTitle(""); setFile(null); setOpen(false);
      onDone();
      return;
    }

    const fd = new FormData();
    fd.set("company_id", companyId);
    fd.set("deal_id", dealId);
    fd.set("title", title.trim());
    fd.set("require_code", String(requireCode));
    fd.set("file", file);
    const res = await fetch("/api/admin/crm/presentation", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      fail(b?.error);
      return;
    }
    setTitle(""); setFile(null); setOpen(false);
    onDone();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn mt-3 h-9 px-4 text-[0.8rem]">
        Upload a presentation
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-[18px] bg-wash p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title — e.g. Outcreate, on the Walls"
        className="h-10 w-full rounded-[12px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal"
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[0.65rem] text-slate">Attach to deal</span>
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            className="mt-0.5 h-9 w-full rounded-[10px] border border-edge bg-surface px-2 text-xs"
          >
            <option value="">No deal</option>
            {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[0.65rem] text-slate">
            File — a deck (.html, .pdf) or a film (.mp4, .webm, .mov)
          </span>
          <input
            type="file"
            accept=".html,.htm,.pdf,.mp4,.m4v,.webm,.mov,video/mp4,video/webm,video/quicktime"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-0.5 h-9 w-full text-xs"
          />
          {videoExt && file && (
            <span className="mt-0.5 block text-[0.6rem] text-slate">
              Film · {(file.size / 1024 / 1024).toFixed(1)} MB
              {file.size > MAX_VIDEO_MB * 1024 * 1024
                ? ` — over the ${MAX_VIDEO_MB} MB limit, compress it first`
                : videoExt === "mov"
                  ? " — .mov plays on Safari and usually on Chrome; .mp4 is the safe one to send"
                  : ""}
            </span>
          )}
        </label>
      </div>
      <label className="mt-2 flex items-start gap-2">
        <input
          type="checkbox"
          checked={requireCode}
          onChange={(e) => setRequireCode(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-charcoal"
        />
        <span className="text-xs text-slate">
          Require a one-time code emailed to the recipient.{" "}
          <span className="text-charcoal">Turn this on for anything with a price in it</span> —
          without it, whoever holds the link can open it.
        </span>
      </label>
      {busy && videoExt && (
        <p className="mt-2 text-[0.68rem] text-slate">
          A film takes a minute or two — leave this tab open until it finishes.
        </p>
      )}
      {err && <p className="mt-2 text-xs text-charcoal/80">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={submit} disabled={busy || !file || !title.trim()}
          className="btn h-9 px-4 text-[0.8rem] disabled:opacity-40">
          {busy ? (videoExt ? "Sending the film…" : "Uploading…") : "Upload"}
        </button>
        <button onClick={() => setOpen(false)}
          className="h-9 rounded-[12px] border border-edge px-4 text-[0.8rem]">
          Cancel
        </button>
      </div>
    </div>
  );
}

// execCommand is deprecated but still the only clipboard route an insecure
// origin or an older browser will take.
function legacyCopy(text: string) {
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function Card({
  p, onChange,
}: { p: Presentation; onChange: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  const linkFor = (token: string) => `${window.location.origin}/p/${token}`;

  // The old handler called navigator.clipboard and threw the promise away, so a
  // refusal looked exactly like a success: nothing happened either way. Every
  // path here ends in something visible — a tick, or the link itself to select.
  const copyLink = async (r: Recipient) => {
    const url = linkFor(r.token);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShown(null); setCopied(r.id);
        window.setTimeout(() => setCopied((id) => (id === r.id ? null : id)), 2000);
        return;
      }
    } catch {
      // Rejected: the document lost focus, or the browser withheld permission.
    }
    if (legacyCopy(url)) {
      setShown(null); setCopied(r.id);
      window.setTimeout(() => setCopied((id) => (id === r.id ? null : id)), 2000);
      return;
    }
    setCopied(null); setShown(r.id);
  };

  const invite = async (notify = true) => {
    setBusy(true); setNote(null);
    const res = await fetch("/api/admin/crm/presentation", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ presentation_id: p.id, email, name, notify }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { setNote(notify ? "Couldn't invite them." : "Couldn't create the link."); return; }
    // The link is shown either way — if Resend is down or unconfigured, this is
    // how the invitation still gets out.
    setNote(body?.emailed ? `Emailed ${email}.` : notify ? `Not emailed — send this link: ${body?.link}` : `Link created. No email sent: ${body?.link}`);
    setEmail(""); setName("");
    onChange();
  };

  const revoke = async (recipientId: string, on: boolean) => {
    await adminRpc("crm_presentation_revoke", {
      p_recipient_id: recipientId, p_revoke: on,
    });
    onChange();
  };

  return (
    <div className="rounded-[18px] bg-wash p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{p.title}</p>
        <p className="text-[0.65rem] uppercase tracking-wide text-slate">
          {p.format} · {p.status}{p.require_code ? " · code required" : ""}
        </p>
      </div>

      <ul className="mt-3 space-y-1.5">
        {p.recipients.map((r) => (
          <li key={r.id} className="rounded-[12px] bg-surface px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-medium">
                {r.name ? `${r.name} · ` : ""}{r.email}
              </span>
              <button onClick={() => revoke(r.id, !r.revoked_at)} className="text-[0.65rem] underline">
                {r.revoked_at ? "restore" : "revoke"}
              </button>
            </div>
            <p className="mt-0.5 text-[0.68rem] text-slate">
              {r.revoked_at
                ? `Revoked ${when(r.revoked_at)}`
                : r.open_count > 0
                  ? `Opened ${r.open_count}× · first ${when(r.first_opened_at)}, last ${when(r.last_opened_at)}`
                  : r.invited_at ? `Sent ${when(r.invited_at)} · not opened yet` : "Not sent yet"}
            </p>
            {!r.revoked_at && (
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <button
                  type="button"
                  onClick={() => void copyLink(r)}
                  className="text-[0.65rem] text-slate underline"
                >
                  {copied === r.id ? "copied \u2713" : "copy link"}
                </button>
                <a
                  href={`/p/${r.token}`} target="_blank" rel="noreferrer"
                  className="text-[0.65rem] text-slate underline"
                >
                  open
                </a>
              </div>
            )}
            {shown === r.id && (
              <input
                readOnly
                value={linkFor(r.token)}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-1 w-full rounded-[8px] border border-edge bg-surface px-2 py-1 text-[0.65rem]"
              />
            )}
          </li>
        ))}
        {p.recipients.length === 0 && <p className="text-xs text-slate">Nobody invited yet.</p>}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
          className="h-9 w-28 rounded-[10px] border border-edge bg-surface px-2.5 text-xs"
        />
        <input
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their@email.com"
          className="h-9 flex-1 rounded-[10px] border border-edge bg-surface px-2.5 text-xs"
        />
        <button onClick={() => void invite()} disabled={busy || !email.includes("@")}
          className="btn h-9 px-4 text-[0.75rem] disabled:opacity-40">
          {busy ? "Sending…" : "Invite"}
        </button>
        <button onClick={() => void invite(false)} disabled={busy || !email.includes("@")}
          className="h-9 rounded-[10px] border border-edge px-4 text-[0.75rem] disabled:opacity-40">
          Create link without email
        </button>
      </div>
      {note && <p className="mt-2 break-all text-[0.68rem] text-slate">{note}</p>}

      {p.comments.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-edge/60 pt-3">
          {p.comments.map((c) => (
            <li key={c.id} className="text-xs">
              <span className="text-slate">
                {c.kind === "call" ? "📞 " : ""}{c.from ?? "They"}
                {c.anchor ? ` · ${c.anchor}` : ""} · {when(c.created_at)}
              </span>
              <p className="mt-0.5">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
