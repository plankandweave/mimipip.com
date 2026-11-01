"use client";

import { useCallback, useEffect, useState } from "react";
import WallMockup from "@/components/WallMockup";
import type { Point } from "@/lib/homography";
import { drawnWalls, isSuggested, suggestedWalls, wallsStillOpen } from "@/lib/site-batch-rules";

// The whole-store review: every wall as one row — the SITE PHOTO (what the
// wall is today), the measurements, and the COMPOSED CREATIVE (what it
// becomes) — walked in the same clockwise order it was measured. One button
// at the bottom approves the entire store — but approval is also a TRANCHE:
// tick the walls you are ready to commit, watch the running metres, and
// release just those. The store is still designed as one continuous
// clockwise journey; print is simply bought in instalments, so the first
// 40 m can go on the machine while the rest is still being argued about.

type Piece = { name: string; widthMm: number; previewUrl: string | null };
/** What actually happened to a released wall, from the OS — the wall's own
 *  `status` stops at "ordered" and never moves again. */
type Live = {
  readiness: "on_site" | "in_production" | "not_printed" | null;
  milestone: "placed" | "printing" | "printed" | "packed" | "dispatched";
  dispatchedAt: string | null;
  courier: string | null;
  podNo: string | null;
  trackingUrl: string | null;
  zvy: string[];
  statusKnown: boolean;
};
type Wall = {
  seq: number; name: string; room: string | null; widthMm: number; heightMm: number;
  photoUrl: string | null; context: string | null; note: string | null;
  quad: [Point, Point, Point, Point] | null;
  designCount: number; art: Piece[]; status: string; warning: string | null; orderRefs: string[];
  series: string[]; codes: string[]; unapproved: string[]; live: Live | null;
  /** Zyvorah's suggestion beyond the client's drawing: badged, priced apart,
   *  and never part of "approve all remaining" (site-batch-rules.ts). */
  suggested: boolean; suggestionReason: string | null;
  /** The artwork carries on round a corner into the next wall. */
  turnsIntoNext?: boolean;
};
type Feedback = {
  id: string; created_at: string; wall_seq: number | null; body: string;
  author_email: string; author_side: string; status: string;
  ai_reply: string | null; changed_seqs: number[];
};
type Batch = {
  id: string; title: string; status: string; revision: number; seriesNames: string[]; state: string | null;
  storeName: string | null; shipCity: string | null; shipAddress: string | null; gps: string | null;
  warnings: string[]; groupRef: string | null; approvedBy: string | null; error: string | null;
  entranceInScope: boolean;
};
type QuoteLine = {
  seq: number; name: string; areaSqft: number; measuredSqft: number; floorApplied: boolean;
  amount: number; gstAmount: number; total: number;
};
type Quote = {
  available: boolean; reason?: string; ratePerSqft?: number; gstPct?: number;
  lines?: QuoteLine[];
  /** Suggested walls, priced the same way but outside the total. */
  optionalLines?: QuoteLine[]; optionalTotal?: number;
  minBillableWidthMm?: number | null;
  subtotal?: number; gstAmount?: number; total?: number;
};

const mm = (n: number) => `${(n / 1000).toFixed(2)} m`;
const sqft = (w: Wall) => (w.widthMm / 304.8) * (w.heightMm / 304.8);
/** The single visual height every thumbnail on this page shares — site photo
 *  and creative alike — so a wall is one scannable row whatever its shape. */
const ROW_H = "h-40";

export default function SiteBatchReview({ batchId, slug, isAdmin, accountName }: { batchId: string; slug: string; isAdmin: boolean; accountName: string }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [note, setNote] = useState("");
  const [noteWall, setNoteWall] = useState<number | "">("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [quote, setQuote] = useState<Quote>({ available: false });

  const toggle = (seq: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq); else next.add(seq);
      return next;
    });

  const load = useCallback(async () => {
    const r = await fetch(`/api/corporate/site-batch/${batchId}`, { credentials: "include" });
    const j = await r.json();
    if (!r.ok) { setErr(j.error ?? "Could not load"); return; }
    setBatch(j.batch); setWalls(j.walls ?? []); setQuote(j.quote ?? { available: false });
    const f = await fetch(`/api/corporate/site-batch/${batchId}/feedback`, { credentials: "include" });
    if (f.ok) { const fj = await f.json(); setFeedback(fj.feedback ?? []); }
  }, [batchId]);
  // Initial network synchronisation; load writes state only after fetches settle.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // Ask for a change in your own words. The AI answers by re-allocating from
  // the approved library — it cannot invent artwork, and says so when the ask
  // needs designs nobody has uploaded yet.
  const sendFeedback = async () => {
    const body = note.trim();
    if (body.length < 3) return;
    setBusy("Reading your feedback and revising\u2026"); setErr(null);
    try {
      const r = await fetch(`/api/corporate/site-batch/${batchId}/feedback`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, wallSeq: noteWall === "" ? undefined : noteWall }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Could not send"); return; }
      setNote(""); setNoteWall("");
      await load();
    } finally { setBusy(null); }
  };

  // A wall measured before anyone could photograph it gets its picture here,
  // on its own row, from the phone of whoever is standing in front of it.
  // The designs stay as composed; the photo only shows them on the wall.
  const [photoBusy, setPhotoBusy] = useState<number | null>(null);
  const addPhoto = async (seq: number, file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(seq); setErr(null);
    try {
      const fd = new FormData();
      fd.append("seq", String(seq)); fd.append("photo", file);
      const r = await fetch(`/api/corporate/site-batch/${batchId}/wall-photo`, {
        method: "POST", credentials: "include", body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? `Wall ${seq}: the photograph could not be added.`); return; }
      await load();
    } finally { setPhotoBusy(null); }
  };

  const approve = async (seqs?: number[]) => {
    if (!batch) return;
    const chosen = seqs?.length ? walls.filter((w) => seqs.includes(w.seq)) : [];
    const chosenSuggested = chosen.filter(isSuggested).length;
    // "All remaining" is the client's own drawing. A suggested wall is
    // released only when ticked — the server applies the same rule.
    const what = chosen.length
      ? `wall ${seqs!.join(", ")} (${(chosen.reduce((s, w) => s + w.widthMm, 0) / 1000).toFixed(2)} m of print${chosenSuggested ? `, including ${chosenSuggested} suggested wall${chosenSuggested === 1 ? "" : "s"}` : ""})`
      : `all ${wallsStillOpen(walls).length} remaining walls from your drawing${suggestedWalls(walls).some((w) => w.status !== "ordered") ? " (suggested walls stay out unless you tick them)" : ""}`;
    if (!window.confirm(`Approve ${what} and release to print?`)) return;
    setBusy(seqs?.length ? `Releasing wall ${seqs[0]}…` : "Placing the project…"); setErr(null);
    try {
      const r = await fetch(`/api/corporate/site-batch/${batchId}/approve`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(seqs?.length ? { seqs } : {}),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Approval failed"); return; }
      setPicked(new Set());
      await load();
    } finally { setBusy(null); }
  };

  if (err && !batch) return <div className="mx-auto max-w-3xl p-8 text-sm text-red-700">{err}</div>;
  if (!batch) return <div className="mx-auto max-w-3xl p-8 text-sm text-neutral-500">Loading…</div>;

  // The client's drawing is the proposal; Zyvorah's suggestions are counted
  // and priced apart so the headline never claims more than they asked for.
  const drawn = drawnWalls(walls);
  const suggested = suggestedWalls(walls);
  const totalSqft = Math.round(drawn.reduce((s, w) => s + sqft(w), 0));
  const suggestedSqft = Math.round(suggested.reduce((s, w) => s + sqft(w), 0));
  // A wall is releasable only when it is composed, not already ordered, and
  // every design on it is approved in the library — a pending design cannot
  // go on the machine however much anyone wants it to.
  const releasable = (w: Wall) => w.status !== "ordered" && w.art.length > 0 && w.unapproved.length === 0;
  const pickedWalls = walls.filter((w) => picked.has(w.seq) && releasable(w));
  const pickedM = pickedWalls.reduce((s, w) => s + w.widthMm, 0) / 1000;
  const pickedSqft = Math.round(pickedWalls.reduce((s, w) => s + sqft(w), 0));
  const remaining = wallsStillOpen(walls).length;
  const openSuggested = suggested.filter((w) => w.status !== "ordered").length;
  const proposed = (batch.status === "proposed" || batch.status === "ordered") && (remaining > 0 || openSuggested > 0);
  const ordered = batch.status === "ordered" && remaining === 0;
  // The banner has to move with the walls: once every roll has shipped, "in
  // production" is simply false.
  const allDispatched = ordered && walls.filter((w) => w.status === "ordered")
    .every((w) => w.live?.statusKnown && w.live.milestone === "dispatched");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-widest text-neutral-500">Store approval</div>
        <button onClick={() => window.print()}
          className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-semibold print:hidden">
          Print / save PDF
        </button>
      </div>
      <h1 className="text-2xl font-semibold">{batch.title}</h1>
      <div className="mt-1 text-sm text-neutral-600">
        {drawn.length} wall{drawn.length === 1 ? "" : "s"} · ~{totalSqft.toLocaleString("en-IN")} sq ft
        {suggested.length > 0 && <> · plus {suggested.length} suggested wall{suggested.length === 1 ? "" : "s"} (~{suggestedSqft.toLocaleString("en-IN")} sq ft, optional)</>}
        {batch.seriesNames.length > 0 && <> · {batch.seriesNames.join(" + ")}</>}
        {batch.state && <> · dispatch to {batch.shipCity ?? ""} {batch.state}</>}
      </div>
      {(batch.shipAddress || batch.gps) && (
        <div className="mt-1 text-xs text-neutral-500">
          {batch.shipAddress}
          {batch.gps && <>{batch.shipAddress ? " · " : ""}<a href={batch.gps} target="_blank" rel="noreferrer" className="underline">Google Maps</a></>}
        </div>
      )}

      {/* Once walls are in production the next question is no longer "is this
          right" but "which roll goes where" — and that is a different sheet,
          carried by a different person. */}
      {batch.status === "ordered" && (
        <a href={`/partners/${slug}/site-batches/${batchId}/install-sheet`}
          className="mt-3 inline-block rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-50">
          Installation sheet — which roll goes on which wall →
        </a>
      )}

      {ordered && (
        <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          Approved{batch.approvedBy ? ` by ${batch.approvedBy}` : ""} — the whole store
          {allDispatched ? " has been dispatched" : " is in production"}
          {batch.groupRef ? ` as project ${batch.groupRef}` : ""}. Nothing further is needed.
        </div>
      )}
      {batch.warnings.length > 0 && !ordered && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {batch.warnings.map((w, i) => <p key={i} className={i ? "mt-1" : ""}>{w}</p>)}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {walls.map((w) => (
          <div key={w.seq} className={`rounded-2xl border bg-white p-4 ${w.suggested ? "border-dashed border-neutral-400" : "border-neutral-200"}`}>
            {/* A wall we proposed, not the client: it says so before anything
                else on the card, and says why, so the approver reads it as an
                offer and not as a line they forgot measuring. */}
            {w.suggested && (
              <div className="mb-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                <span className="font-semibold uppercase tracking-wide">Zyvorah&rsquo;s suggestion</span>
                <span className="text-neutral-500"> · not in your drawing · optional</span>
                {w.suggestionReason && <div className="mt-0.5">{w.suggestionReason}</div>}
              </div>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label className="flex items-center gap-2 font-medium">
                {proposed && isAdmin && releasable(w) && (
                  <input type="checkbox" checked={picked.has(w.seq)} onChange={() => toggle(w.seq)}
                    disabled={Boolean(busy)} className="h-4 w-4 accent-neutral-900" />
                )}
                {w.seq}. {w.name}
                {w.status === "ordered" && <ReleasedBadge live={w.live} />}
                {w.unapproved.length > 0 && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                    {w.unapproved.join(", ")} not approved in library
                  </span>
                )}
              </label>
              <div className="text-xs text-neutral-500">
                {mm(w.widthMm)} × {mm(w.heightMm)} · {Math.round(sqft(w)).toLocaleString("en-IN")} sq ft
                {w.context ? <> · {w.context}</> : null}
                {w.turnsIntoNext ? <> · carries on round the corner into the next wall</> : null}
              </div>
            </div>
            {w.warning && <div className="mt-1 text-xs text-amber-700">{w.warning}</div>}
            {/* One ROW per wall, everything at a single visual height: a 44 m
                band and a 0.6 m pier both read as one glance-able strip, and
                the approver scans the store instead of scrolling billboards.
                Width follows each image's own aspect (w-auto + object-contain),
                so nothing is squashed — a tap opens the full-size preview. */}
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start">
              <div className="shrink-0">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-400">
                  {w.photoUrl && w.quad && w.art[0]?.previewUrl ? "On the wall" : "Site today"}
                </div>
                {w.photoUrl
                  ? (w.quad && w.art[0]?.previewUrl
                      ? <a href={w.photoUrl} target="_blank" rel="noreferrer" title="Open the bare wall photo">
                          <WallMockup
                            photoUrl={w.photoUrl} artUrl={w.art[0]!.previewUrl!} quad={w.quad}
                            alt={`${w.name} with the chosen creative`}
                            className={`${ROW_H} w-auto max-w-[300px] rounded-lg object-cover`} />
                        </a>
                      : <a href={w.photoUrl} target="_blank" rel="noreferrer">
                          <img src={w.photoUrl} alt={w.name} className={`${ROW_H} w-auto max-w-[220px] rounded-lg object-cover`} />
                        </a>)
                  : <label className={`grid ${ROW_H} w-[220px] cursor-pointer place-items-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 text-center text-sm text-neutral-600 hover:bg-neutral-100 print:hidden ${photoBusy === w.seq ? "pointer-events-none opacity-60" : ""}`}>
                      <span>
                        <span className="block font-medium text-neutral-900">{photoBusy === w.seq ? "Adding photo…" : "Add a photo of this wall"}</span>
                        <span className="mt-1 block text-xs text-neutral-500">Take one now or choose from your phone</span>
                      </span>
                      {/* No `capture` attribute: on a phone this offers the
                          camera AND the gallery, which is the point. */}
                      <input type="file" accept="image/*" className="sr-only" disabled={photoBusy != null}
                        onChange={(e) => { void addPhoto(w.seq, e.target.files?.[0]); e.target.value = ""; }} />
                    </label>}
                {w.photoUrl && w.status !== "ordered" && (
                  <label className="mt-1 inline-block cursor-pointer text-xs text-neutral-500 underline hover:text-neutral-800 print:hidden">
                    {photoBusy === w.seq ? "Replacing…" : "Replace photo"}
                    <input type="file" accept="image/*" className="sr-only" disabled={photoBusy != null}
                      onChange={(e) => { void addPhoto(w.seq, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-neutral-400">
                  {w.series.length > 0 && (
                    <span className="mr-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {w.series.join(" + ")}
                    </span>
                  )}
                  {w.designCount} design{w.designCount === 1 ? "" : "s"}
                  {/* Say what these codes ARE. Unlabelled they read as the
                      identifier on the paper, and they are not: the engine
                      prints the order number and the panel number, so someone
                      hunting ZYVS-N59R9R on a header band will never find it.
                      Reported from the floor off this page's meta line — the
                      install sheet was fixed in 5e20166, this is the surface
                      the report actually came from. */}
                  {w.codes.length > 0 && <> · artwork {w.codes.join(", ")}</>}
                  {w.art.length > 1 && <> · {w.art.length} pieces, left to right</>}
                  {/* The number actually printed on the header band, and the
                      only one that matches a roll in hand. It sits AFTER the
                      artwork refs and carries its own label, so the two
                      families of identifier can no longer be mistaken for each
                      other — the confusion 5e20166 fixed on the install sheet.
                      Rendered only when the OS told us; a guess here would be
                      worse than a blank. */}
                  {w.live?.statusKnown && w.live.zvy.length > 0 && (
                    <> · <span className="font-semibold text-neutral-500">on the roll {w.live.zvy.join(", ")}</span></>
                  )}
                </div>
                {w.art.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {w.art.map((p, i) => (
                      <div key={i} className="shrink-0">
                        {p.previewUrl
                          ? <a href={p.previewUrl} target="_blank" rel="noreferrer" title="Open full size">
                              <img src={p.previewUrl} alt={p.name}
                                className={`${ROW_H} w-auto rounded-lg border border-neutral-100 object-contain`} />
                            </a>
                          : <div className={`grid ${ROW_H} w-[220px] place-items-center rounded-lg bg-neutral-100 p-4 text-xs text-neutral-400`}>{p.name}</div>}
                        <div className="mt-0.5 text-[11px] text-neutral-400">
                          {w.art.length > 1 ? `${i + 1}/${w.art.length} · ` : ""}{mm(p.widthMm)} of run
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className={`grid ${ROW_H} w-[220px] place-items-center rounded-lg bg-neutral-100 text-xs text-neutral-400`}>not composed yet</div>}
                {proposed && isAdmin && releasable(w) && (
                  <div className="mt-2 text-[11px] text-neutral-400">
                    {picked.has(w.seq)
                      ? `Selected — ${(w.widthMm / 1000).toFixed(2)} m of this tranche`
                      : `${(w.widthMm / 1000).toFixed(2)} m of run · tick to add to this tranche`}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* The proposal closes as a document: first the covering letter, then
          the numbered wall quotation. Account terms already govern the buyer,
          so they are deliberately not repeated here. */}
      <section className="mt-10 break-before-page rounded-2xl border border-neutral-200 bg-white p-6 print:border-0 print:px-0">
        <div className="text-xs uppercase tracking-widest text-neutral-500">Covering letter</div>
        <p className="mt-5 text-sm text-neutral-600">To<br /><strong className="text-neutral-900">{accountName}</strong></p>
        <p className="mt-4 text-sm font-semibold text-neutral-900">Subject: Wallpaper proposal for {batch.storeName ?? batch.title}</p>
        <div className="mt-4 space-y-3 text-sm leading-6 text-neutral-700">
          <p>Dear Team,</p>
          <p>
            We are pleased to submit the completed wallpaper proposal for <strong>{batch.storeName ?? batch.title}</strong>.
            It covers {drawn.length} measured wall{drawn.length === 1 ? "" : "s"}, approximately {totalSqft.toLocaleString("en-IN")} sq ft,
            using {batch.seriesNames.join(" + ") || "the approved design library"}. {drawn.every((w) => w.photoUrl)
              ? " Each composition has been prepared against the supplied site photograph and exact measured size."
              : " Each composition has been prepared to the exact measured size of its wall."}
          </p>
          {suggested.length > 0 && (
            <p>
              Beyond your drawing we have added {suggested.length === 1 ? "one suggestion" : `${suggested.length} suggestions`}
              {" "}({suggested.map((w) => `wall ${w.seq}`).join(", ")}, approximately {suggestedSqft.toLocaleString("en-IN")} sq ft), shown with
              {suggested.length === 1 ? " its creative and our reason" : " their creatives and our reasons"} and priced separately below as an optional addition.
              {suggested.length === 1 ? " It is" : " They are"} released to print only if you choose to include {suggested.length === 1 ? "it" : "them"}.
            </p>
          )}
          <p>Please review the wall-by-wall placements above. Approval releases only the selected walls to print through your existing Zyvorah account workflow.</p>
          <p>Warm regards,<br /><strong>Team Zyvorah</strong></p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 print:border-neutral-300">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-widest text-neutral-500">Quotation</div>
            <h2 className="mt-1 text-lg font-semibold">Measured wallpaper supply</h2>
          </div>
          <div className="text-right text-xs text-neutral-500">Revision {batch.revision}</div>
        </div>
        {quote.available && quote.lines ? (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead><tr className="border-b border-neutral-300 text-left text-xs text-neutral-500">
                  <th className="py-2 pr-3">Wall</th><th className="px-3 py-2 text-right">Measured</th><th className="px-3 py-2 text-right">Billed area</th>
                  <th className="px-3 py-2 text-right">Rate</th><th className="py-2 pl-3 text-right">Amount</th>
                </tr></thead>
                <tbody>{quote.lines.map((line) => (
                  <tr key={line.seq} className="border-b border-neutral-100">
                    <td className="py-2.5 pr-3">{line.seq}. {line.name}</td>
                    <td className="px-3 py-2.5 text-right text-neutral-500">{line.measuredSqft.toFixed(2)} sq ft</td>
                    <td className="px-3 py-2.5 text-right">{line.areaSqft.toFixed(2)} sq ft{line.floorApplied && <span title="billed at the roll's width">*</span>}</td>
                    <td className="px-3 py-2.5 text-right">₹{Number(quote.ratePerSqft).toLocaleString("en-IN")}/sq ft</td>
                    <td className="py-2.5 pl-3 text-right">₹{line.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {/* The media floor, said out loud. A band narrower than the roll
                still uses the full web for its whole run, so the bill covers
                the web — the partner sees both numbers and the reason, never a
                bigger figure than they measured with no explanation. */}
            {[...(quote.lines ?? []), ...(quote.optionalLines ?? [])].some((l) => l.floorApplied) && quote.minBillableWidthMm && (
              <p className="mt-3 text-xs text-neutral-500">
                * Billed at the roll&rsquo;s billable width of {(quote.minBillableWidthMm / 1000).toFixed(2)} m: a wall or band narrower than the roll
                still uses the full web for its whole run, so the billed area is the run length × {(quote.minBillableWidthMm / 1000).toFixed(2)} m.
                A wall wider than the roll in both directions is billed at its measured area.
              </p>
            )}
            <div className="ml-auto mt-4 max-w-sm space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span>₹{Number(quote.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">GST {quote.gstPct}%</span><span>₹{Number(quote.gstAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between border-t border-neutral-300 pt-2 text-base font-semibold"><span>Total</span><span>₹{Number(quote.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            </div>
            {/* Suggested walls: the same rate, the same arithmetic, OUTSIDE
                the total — an addition the approver may take up, not a line
                they are being billed for. */}
            {(quote.optionalLines?.length ?? 0) > 0 && (
              <div className="mt-6 border-t border-dashed border-neutral-300 pt-4">
                <div className="text-xs uppercase tracking-widest text-neutral-500">Suggested addition{quote.optionalLines!.length === 1 ? "" : "s"} · optional, not in the total</div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <tbody>{quote.optionalLines!.map((line) => {
                      const wall = walls.find((w) => w.seq === line.seq);
                      return (
                        <tr key={line.seq} className="border-b border-neutral-100">
                          <td className="py-2.5 pr-3">
                            {line.seq}. {line.name}
                            {wall?.suggestionReason && <div className="text-xs text-neutral-500">{wall.suggestionReason}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-neutral-500">{line.measuredSqft.toFixed(2)} sq ft</td>
                          <td className="px-3 py-2.5 text-right">{line.areaSqft.toFixed(2)} sq ft{line.floorApplied && "*"}</td>
                          <td className="px-3 py-2.5 text-right">₹{Number(quote.ratePerSqft).toLocaleString("en-IN")}/sq ft</td>
                          <td className="py-2.5 pl-3 text-right">₹{line.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })} <span className="text-xs text-neutral-500">incl. GST</span></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
                <div className="ml-auto mt-3 flex max-w-sm justify-between text-sm">
                  <span className="text-neutral-500">If included, in addition to the total</span>
                  <span className="font-semibold">₹{Number(quote.optionalTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-amber-800">{quote.reason ?? "Pricing will appear when this proposal is ready."}</p>
        )}
      </section>

      {/* Feedback lives HERE, on the proposal, not in an inbox — the iteration
          loop is part of the product. */}
      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-4 print:hidden">
        <div className="text-sm font-semibold">Ask for a change</div>
        <div className="mt-0.5 text-xs text-neutral-500">
          Write it as you would to a colleague — e.g. &ldquo;for the ground floor use the same Series 2 artwork, with some local scenes added&rdquo;.
          We revise from your approved library and send the updated proposal back.
        </div>
        {feedback.length > 0 && (
          <div className="mt-3 space-y-3 border-b border-neutral-100 pb-3">
            {feedback.map((f) => (
              <div key={f.id} className="text-sm">
                <div className="text-neutral-800">
                  {f.wall_seq ? <span className="mr-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold">wall {f.wall_seq}</span> : null}
                  {f.body}
                </div>
                <div className="text-[11px] text-neutral-400">{f.author_email}</div>
                {f.ai_reply && (
                  <div className={`mt-1 rounded-lg p-2 text-[13px] ${f.status === "cannot_action" ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
                    {f.ai_reply}
                    {f.changed_seqs?.length ? <div className="mt-0.5 text-[11px] opacity-70">Walls updated: {f.changed_seqs.join(", ")}</div> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select value={noteWall} onChange={(e) => setNoteWall(e.target.value === "" ? "" : Number(e.target.value))}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm">
            <option value="">Whole store</option>
            {walls.map((w) => <option key={w.seq} value={w.seq}>Wall {w.seq} — {w.name}</option>)}
          </select>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="What would you like changed?"
            className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm" />
          <button onClick={() => void sendFeedback()} disabled={Boolean(busy) || note.trim().length < 3}
            className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
            {busy ? "Working\u2026" : "Send"}
          </button>
        </div>
      </div>

      {err && <div className="mt-4 text-sm text-red-700 print:hidden">{err}</div>}

      {proposed && (
        <div className="sticky bottom-4 mt-8 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg print:hidden">
          {isAdmin ? (
            <>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className={pickedWalls.length ? "font-semibold text-neutral-900" : "text-neutral-400"}>
                  {pickedWalls.length
                    ? `${pickedWalls.length} wall${pickedWalls.length === 1 ? "" : "s"} selected · ${pickedM.toFixed(2)} m run · ~${pickedSqft.toLocaleString("en-IN")} sq ft`
                    : "Tick the walls you are ready to commit — the running metres show here."}
                </span>
                {pickedWalls.length > 0 && (
                  <button onClick={() => setPicked(new Set())} className="text-neutral-500 underline">clear</button>
                )}
              </div>
              <button
                onClick={() => void approve(pickedWalls.length ? pickedWalls.map((w) => w.seq) : undefined)}
                disabled={Boolean(busy) || (!pickedWalls.length && remaining === 0)}
                className="w-full rounded-xl bg-neutral-900 px-6 py-3.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
                {busy ?? (pickedWalls.length
                  ? `Confirm ${pickedWalls.length} wall${pickedWalls.length === 1 ? "" : "s"} · ${pickedM.toFixed(2)} m — release to print`
                  : remaining > 0
                    ? `Approve all ${remaining} remaining wall${remaining === 1 ? "" : "s"} from your drawing — release to print`
                    : "Tick a suggested wall above to release it")}
              </button>
              {openSuggested > 0 && (
                <div className="mt-2 text-center text-[11px] text-neutral-500">
                  {openSuggested} suggested wall{openSuggested === 1 ? " is" : "s are"} not part of &ldquo;approve all&rdquo; — tick {openSuggested === 1 ? "it" : "them"} to include.
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-sm text-neutral-500">
              An account admin approves this batch — ask your administrator to open this page.
            </div>
          )}
          <div className="mt-2 text-center text-[11px] text-neutral-400">
            One approval places the whole project through your normal ordering — same pricing, same GST profile, invoiced dispatch-wise.
          </div>
        </div>
      )}
    </div>
  );
}

/** A released wall's live state. "Ordered" is the only status the wall row
 *  itself ever reaches, so the words here come from the OS: a wall that has
 *  been dispatched must stop claiming to be on the machine. When the OS says
 *  nothing (unreachable, or an order it never received) the badge falls back
 *  to the honest, unqualified "Released to print" rather than inventing a
 *  milestone. */
function ReleasedBadge({ live }: { live: Live | null }) {
  const LABEL: Record<Live["milestone"], string> = {
    placed: "Queued for print",
    printing: "On the machine",
    printed: "Printed",
    packed: "Packed — awaiting courier",
    dispatched: "Dispatched",
  };
  // A wall the OS has said nothing about gets the unqualified fact — it was
  // released to print — and never a milestone. The milestone for an unknown
  // is "placed", so printing it would tell a partner whose store shipped last
  // week that it is queued, the exact failure this badge exists to end.
  const known = Boolean(live?.statusKnown);
  const label = known ? LABEL[live!.milestone] : "Released to print";
  const tone = known && live!.milestone === "dispatched" ? "text-emerald-700" : "text-neutral-600";
  const track = live?.trackingUrl;
  return (
    <span className={`ml-2 text-xs font-semibold ${tone}`}>
      {label}
      {known && live!.milestone === "dispatched" && " ✓"}
      {!known && <span className="ml-1 font-normal text-neutral-400">· live status unavailable</span>}
      {known && live!.podNo && (
        <span className="ml-1 font-normal text-neutral-500">
          · {live!.courier ? `${live!.courier} ` : ""}
          {track
            ? <a href={track} target="_blank" rel="noreferrer" className="underline">{live!.podNo}</a>
            : live!.podNo}
        </span>
      )}
    </span>
  );
}
