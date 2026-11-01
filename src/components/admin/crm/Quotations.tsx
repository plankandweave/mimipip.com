"use client";

import { useEffect, useState } from "react";

// The ZYV/Q quotations for one company, and the Prepare button.
//
// Prepare asks the desk (src/lib/quotation/prepare.ts) to read everything the
// CRM holds on this company — the take-off in the notes, the threads, the
// account's pricing — and park a numbered quotation under a task on this
// page: two documents (the supply quotation from Magnitude Brands and the
// installation quotation from Magnitude Spaces) with the specification sheets
// and a covering email. Nothing is sent from here: the task's Send is the
// only door out, and it is Roheena's press.
//
// A second Prepare on the same deal is a REVISION: the earlier draft is
// superseded, never edited, because a quotation is an offer someone may hold
// us to. The optional steer ("add the escalator fascia") goes to the desk as
// an instruction.
//
// Every wall is quoted the way the Vijay Sales proposals read (Roheena,
// 6 October 2026): its picture, then its measurement, then its price. The
// desk takes the picture from the partner page when it has one; the Walls
// list under a draft is where a picture is added or replaced otherwise — a
// file from the phone, or a link (a Drive share link will do).

export type QuotationRow = {
  id: string; number: string; revision: number; status: string; total_inr: number;
  prepared_by: string; task_id: string | null; sent_at: string | null; created_at: string;
  title: string | null; valid_until: string | null;
  /** True when it left exactly as prepared; null until sent. */
  sent_unedited?: boolean | null;
  /** False when nothing is installed by us, so there is no installation document. */
  has_install?: boolean;
};

/** Roheena, 6 October 2026: nothing sends without her press for sixty days;
 *  automation is considered after six consecutive quotations left unchanged.
 *  Mirrors AUTOMATION_REVIEW in src/lib/quotation/rates.ts. */
const REVIEW_NOT_BEFORE = "5 December 2026";
const REVIEW_STREAK = 6;

type Result =
  | { kind: "quotation"; number: string; revision: number; totalInr: number; blockers: string[] }
  | { kind: "needs_measurements"; blockers: string[] }
  | { kind: "nothing"; reason: string }
  | { error: string; detail?: string };

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

type WallLine = {
  seq: number; location: string; basis: string; materialName: string; sqft: number;
  size: string | null; productHandle: string | null; pricingIssue: string | null; supplyAmount: number | null; installAmount: number | null;
  picture: { kind: "proposed" | "site"; caption: string | null; url: string | null } | null;
};

/** The walls of one draft quotation, each with its picture or the means to add one. */
function Walls({ quotationId, editable }: { quotationId: string; editable: boolean }) {
  const [lines, setLines] = useState<WallLine[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [link, setLink] = useState<Record<number, string>>({});
  const [designLink, setDesignLink] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const r = await fetch(`/api/admin/crm/quotation/picture?id=${quotationId}`);
    const body = (await r.json()) as { lines?: WallLine[] };
    setLines(body.lines ?? []);
  };
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId]);

  const send = async (seq: number, form: FormData) => {
    setBusy(seq); setErr(null);
    form.set("quotation_id", quotationId); form.set("seq", String(seq));
    try {
      const r = await fetch("/api/admin/crm/quotation/picture", { method: "POST", body: form });
      const body = (await r.json()) as { lines?: WallLine[]; error?: string; detail?: string };
      if (!r.ok) throw new Error(body.detail ?? body.error ?? "failed");
      setLines(body.lines ?? []);
      setLink((l) => ({ ...l, [seq]: "" }));
    } catch (e) {
      setErr(`Wall ${seq}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  const linkDesign = async (seq: number) => {
    setBusy(seq); setErr(null);
    try {
      const r = await fetch("/api/admin/crm/quotation/picture", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ quotation_id: quotationId, seq, productHandle: designLink[seq] }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Could not link the design.");
      setLines(b.lines ?? []);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };
  const remove = async (seq: number) => {
    setBusy(seq); setErr(null);
    const r = await fetch("/api/admin/crm/quotation/picture", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ quotation_id: quotationId, seq }) });
    const body = (await r.json()) as { lines?: WallLine[] };
    if (r.ok) setLines(body.lines ?? []);
    setBusy(null);
  };

  if (!lines) return <p className="mt-2 text-xs text-slate">Reading the walls…</p>;
  const missing = lines.filter((l) => !l.picture).length;
  return (
    <div className="mt-3 w-full">
      <p className="text-[0.7rem] text-slate">
        Each wall goes out as picture, measurement, price.{missing ? ` ${missing} of ${lines.length} ${missing === 1 ? "wall has" : "walls have"} no picture yet.` : " Every wall has its picture."}
      </p>
      <ul className="mt-2 divide-y divide-edge/60">
        {lines.map((l) => (
          <li key={l.seq} className="flex flex-wrap items-start gap-3 py-2.5">
            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-[8px] bg-wash">
              {l.picture?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.picture.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[0.6rem] text-slate">no picture</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs"><span className="font-semibold">{l.seq}. {l.location}</span></p>
              <p className="text-[0.7rem] text-slate">
                {l.sqft.toLocaleString("en-IN")} sq ft{l.size ? ` · ${l.size}` : ""} · {l.materialName} · {l.supplyAmount == null ? "price needs a linked website design" : `supply ${inr(l.supplyAmount)}`}{l.installAmount != null ? ` · installation ${inr(l.installAmount)}` : ""}
              </p>
              {l.pricingIssue && <p className="text-xs text-amber-700">{l.pricingIssue}</p>}
              {l.productHandle && <p className="text-xs">Design: {l.productHandle}</p>}
              {l.picture?.caption && <p className="text-[0.65rem] text-slate">{l.picture.kind === "site" ? "Site photograph" : "Proposed"} · {l.picture.caption}</p>}
              {editable && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <input aria-label={`Website design for wall ${l.seq}`} className="rounded border border-edge px-2 py-1 text-xs" placeholder="Website design link" value={designLink[l.seq] ?? ""} onChange={(e) => setDesignLink((v) => ({ ...v, [l.seq]: e.target.value }))} />
                  <button type="button" disabled={busy !== null || !designLink[l.seq]} className="text-xs underline" onClick={() => void linkDesign(l.seq)}>Use website price</button>
                  <label className="cursor-pointer rounded-full border border-edge px-3 py-1 text-[0.7rem] hover:underline">
                    {busy === l.seq ? "Saving…" : l.picture ? "Replace picture" : "Add picture"}
                    <input
                      type="file" accept="image/*" className="hidden" disabled={busy !== null}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.set("file", f); void send(l.seq, fd); } e.target.value = ""; }}
                    />
                  </label>
                  <input
                    value={link[l.seq] ?? ""}
                    onChange={(e) => setLink((v) => ({ ...v, [l.seq]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter" && (link[l.seq] ?? "").trim()) { const fd = new FormData(); fd.set("url", link[l.seq].trim()); void send(l.seq, fd); } }}
                    placeholder="or paste a link and press Enter"
                    className="h-7 min-w-[12rem] flex-1 rounded-[8px] border border-edge bg-surface px-2 text-[0.7rem] outline-none focus:border-charcoal"
                    disabled={busy !== null}
                  />
                  {l.picture && (
                    <button onClick={() => void remove(l.seq)} disabled={busy !== null} className="text-[0.7rem] text-slate hover:underline">Remove</button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {err && <p className="mt-1 text-xs">{err}</p>}
    </div>
  );
}

const STATUS: Record<string, string> = {
  draft: "waiting for your Send", sent: "sent", accepted: "accepted", declined: "declined", superseded: "superseded",
};

export function Quotations({
  companyId, deals, rows, streak, onChange,
}: {
  companyId: string;
  deals: { id: string; title: string }[];
  rows: QuotationRow[];
  /** Across every company: how many of the latest sent quotations left unchanged, in a row. */
  streak?: number;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [steer, setSteer] = useState("");
  const [dealId, setDealId] = useState(deals[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [openWalls, setOpenWalls] = useState<string | null>(rows.find((r) => r.status === "draft")?.id ?? null);

  const prepare = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/admin/crm/quotation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, deal_id: dealId || null, instruction: steer || null }),
      });
      const body = (await r.json()) as Result;
      if ("error" in body) throw new Error(body.detail ? `${body.error}: ${body.detail}` : body.error);
      if (body.kind === "quotation") {
        setMsg(`Quotation ${body.number} Rev. ${body.revision} is ready — ${inr(body.totalInr)} incl. GST across the supply and installation documents. Both are under “To do” with the specification sheets, waiting for your Send.${body.blockers.length ? ` Check first: ${body.blockers.join(" ")}` : ""}`);
      } else if (body.kind === "needs_measurements") {
        setMsg(`No measured area on file, so nothing was priced. A reply asking for the drawing is under “To do”.${body.blockers.length ? ` ${body.blockers.join(" ")}` : ""}`);
      } else {
        setMsg(body.reason);
      }
      setSteer("");
      onChange();
    } catch (e) {
      setMsg(`Couldn't prepare it: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 rounded-[18px] border border-edge bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-bold">Quotations</h2>
          <p className="mt-1 text-xs text-slate">
            Numbered in the ZYV/Q series, in Zyvorah’s format: a supply quotation from Magnitude Brands, an installation quotation from Magnitude Spaces, and a specification sheet for every material quoted.
          </p>
        </div>
        <p className="rounded-full bg-wash px-3 py-1 text-[0.7rem] text-slate" title={`Nothing sends without your press before ${REVIEW_NOT_BEFORE}; automation is considered after ${REVIEW_STREAK} in a row go out unchanged.`}>
          {typeof streak === "number" ? `${Math.min(streak, REVIEW_STREAK)} of ${REVIEW_STREAK} sent unchanged in a row` : `Your press, until ${REVIEW_NOT_BEFORE}`}
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-edge/60">
          {rows.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-semibold">{q.number}</span>
                  <span className="text-slate"> · Rev. {q.revision}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[0.65rem] ${q.status === "sent" ? "bg-sage/70" : q.status === "draft" ? "bg-wash" : "text-slate"}`}>
                    {STATUS[q.status] ?? q.status}
                  </span>
                </p>
                <p className="text-xs text-slate">
                  {q.status === "draft" ? "Open to check design pricing" : `${inr(q.total_inr)} incl. GST`}
                  {q.valid_until ? ` · valid until ${day(q.valid_until)}` : ""}
                  {q.sent_at ? ` · sent ${day(q.sent_at)}${q.sent_unedited === true ? ", unchanged" : q.sent_unedited === false ? ", with your changes" : ""}` : ` · prepared ${day(q.created_at)}${q.prepared_by === "desk" ? " by the desk" : ""}`}
                </p>
              </div>
              {q.status !== "superseded" && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setOpenWalls(openWalls === q.id ? null : q.id)} className="rounded-full border border-edge px-3 py-1 text-[0.7rem] hover:underline">
                    {openWalls === q.id ? "Hide walls" : "Walls & pictures"}
                  </button>
                  <a href={`/api/admin/crm/quotation?id=${q.id}&kind=supply`} target="_blank" rel="noreferrer" className="rounded-full border border-edge px-3 py-1 text-[0.7rem] hover:underline" title="Issued by Magnitude Brands Private Limited">
                    Supply
                  </a>
                  {q.has_install !== false && (
                    <a href={`/api/admin/crm/quotation?id=${q.id}&kind=install`} target="_blank" rel="noreferrer" className="rounded-full border border-edge px-3 py-1 text-[0.7rem] hover:underline" title="Issued by Magnitude Spaces Private Limited">
                      Installation
                    </a>
                  )}
                  <a href={`/api/admin/crm/quotation?id=${q.id}&kind=spec`} target="_blank" rel="noreferrer" className="rounded-full border border-edge px-3 py-1 text-[0.7rem] hover:underline">
                    Spec sheets
                  </a>
                </div>
              )}
              {openWalls === q.id && q.status !== "superseded" && <Walls quotationId={q.id} editable={q.status === "draft"} />}
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 && <p className="mt-3 text-xs text-slate">No quotation yet.</p>}

      <div className="mt-4 space-y-2">
        {deals.length > 1 && (
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            className="h-9 w-full rounded-[12px] border border-edge bg-surface px-3 text-xs"
            aria-label="Which deal this quotation is for"
          >
            {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
        )}
        <input
          value={steer}
          onChange={(e) => setSteer(e.target.value)}
          placeholder="Anything to tell the desk? e.g. “Quote the lobby only” or “add the escalator fascia”"
          className="h-9 w-full rounded-[12px] border border-edge bg-surface px-3 text-xs outline-none focus:border-charcoal"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={prepare} disabled={busy} className="btn h-9 px-4 text-[0.78rem] disabled:opacity-40">
            {busy ? "Reading the notes and the drawing…" : rows.some((r) => r.status === "draft" || r.status === "sent") ? "Prepare a revision" : "Prepare quotation"}
          </button>
          <span className="text-[0.7rem] text-slate">About a minute. Nothing is sent until you press Send under the task.</span>
        </div>
        {msg && <p className="text-xs">{msg}</p>}
      </div>
    </div>
  );
}
