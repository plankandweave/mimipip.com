"use client";

import { useEffect, useState } from "react";
import WallMockup from "@/components/WallMockup";
import type { Point } from "@/lib/homography";

/**
 * The installer's view of the store.
 *
 * The approval page and this page show the same sixteen walls, and that is the
 * point — the installer should be looking at the picture the customer signed
 * off. What changes is the question being answered. Approval asks "is this the
 * right creative for that wall"; installation asks "which of these rolls is
 * the one in my hand", and the only handle on a rolled strip is the ZVY number
 * on its header band. So the ZVY number is the loudest thing in every row, and
 * the wall photo is what makes it findable.
 *
 * Everything on screen is print-styled rather than duplicated into a separate
 * layout: the toolbar and the interactive affordances drop out under `print:`,
 * so Save-as-PDF from the browser produces the same document the server-side
 * PDF does, at better image quality. The server PDF exists for forwarding; this
 * exists for reading.
 */

type Readiness = "on_site" | "in_production" | "not_printed";

type Piece = {
  orderRef: string; zvy: string | null; index: number; total: number;
  widthMm: number; strips: number | null; previewUrl: string | null;
  readiness: Readiness; printStatus: string | null; stage: string | null;
};
type Wall = {
  seq: number; name: string; widthMm: number; heightMm: number;
  photoUrl: string | null; quad: [Point, Point, Point, Point] | null;
  series: string[]; codes: string[]; pieces: Piece[];
  readiness: Readiness; supersededZvy: string[];
};
type Sheet = {
  batchId: string; title: string; shipCity: string | null; state: string | null;
  shipAddress: string | null; shipContactName: string | null; shipContactPhone: string | null;
  accountName: string; statusUnknown: boolean; walls: Wall[];
  totals: { walls: number; wallsReady: number; stripsReady: number; wallsInProduction: number; wallsNotPrinted: number };
};

const m2 = (mm: number) => `${(mm / 1000).toFixed(2)} m`;

const LABEL: Record<Readiness, string> = {
  on_site: "Dispatched",
  in_production: "Still printing",
  not_printed: "Not printed",
};
const TONE: Record<Readiness, string> = {
  on_site: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  in_production: "bg-amber-50 text-amber-900 ring-amber-200",
  not_printed: "bg-red-50 text-red-800 ring-red-200",
};
const STRIPE: Record<Readiness, string> = {
  on_site: "bg-emerald-600",
  in_production: "bg-amber-500",
  not_printed: "bg-red-600",
};

export default function InstallSheet({ batchId, slug }: { batchId: string; slug: string }) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // The sheet is read-only, so it loads exactly once and nothing on this page
  // invalidates it. The cancelled flag matters because the fetch outlives a
  // quick back-navigation, and resolving into an unmounted component is a
  // warning nobody reads and a state update nobody wanted.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/api/corporate/site-batch/${batchId}/install-sheet`, { credentials: "include" });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) setErr(j.error ?? "Could not load the sheet.");
        else setSheet(j.sheet);
      } catch {
        if (!cancelled) setErr("Could not reach the portal. Check your connection and reload.");
      }
    })();
    return () => { cancelled = true; };
  }, [batchId]);

  /** Build the PDF once and reuse the signed link for whichever way it is
   *  being sent. Returns null when the build failed — the caller has already
   *  been told why. */
  const buildPdf = async (sendTo?: string): Promise<{ url: string; emailed: boolean; warning?: string } | null> => {
    const r = await fetch(`/api/corporate/site-batch/${batchId}/install-sheet/pdf`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sendTo ? { sendTo } : {}),
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error ?? "Could not build the PDF."); return null; }
    return j;
  };

  const download = async () => {
    setBusy("Building the PDF…"); setErr(null);
    try {
      const j = await buildPdf();
      if (j) window.open(j.url, "_blank", "noopener");
    } finally { setBusy(null); }
  };

  const whatsapp = async () => {
    setBusy("Preparing the link…"); setErr(null);
    try {
      const j = await buildPdf();
      if (!j || !sheet) return;
      const t = sheet.totals;
      const headline = sheet.statusUnknown
        ? `All ${t.walls} walls. Production could not be reached, so printed/dispatched status on the sheet is NOT reliable — the walls and roll numbers are.`
        : `${t.wallsReady} of ${t.walls} walls dispatched (${t.stripsReady} strips ready to hang).`;
      const msg =
        `*Installation sheet — ${sheet.title}*\n\n` +
        `${headline}\n\n` +
        `Every wall with the ZVY number printed on the rolls that go on it:\n${j.url}\n\n` +
        `Match the ZVY number on the roll's header band to the wall on the sheet before pasting. ` +
        `"PIECE n OF m" on a roll counts strips inside that roll, not pieces of the wall.`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    } finally { setBusy(null); }
  };

  const email = async () => {
    const to = window.prompt("Email the installation sheet to:");
    if (!to?.trim()) return;
    setBusy("Sending…"); setErr(null);
    try {
      const j = await buildPdf(to.trim());
      if (!j) return;
      if (j.warning) setErr(j.warning);
      else if (j.emailed) window.alert(`Installation sheet sent to ${to.trim()}.`);
    } finally { setBusy(null); }
  };

  if (err && !sheet) return <div className="mx-auto max-w-3xl p-8 text-sm text-red-700">{err}</div>;
  if (!sheet) return <div className="mx-auto max-w-3xl p-8 text-sm text-neutral-500">Loading…</div>;

  const t = sheet.totals;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 print:max-w-none print:px-0 print:py-0">

      {/* Toolbar — screen only. */}
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <a href={`/partners/${slug}/site-batches/${batchId}`}
          className="mr-auto text-sm text-neutral-500 underline">← Back to approval</a>
        <button type="button" onClick={() => window.print()} disabled={Boolean(busy)}
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40">
          Print
        </button>
        <button type="button" onClick={() => void download()} disabled={Boolean(busy)}
          className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40">
          Download PDF
        </button>
        <button type="button" onClick={() => void whatsapp()} disabled={Boolean(busy)}
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40">
          WhatsApp
        </button>
        <button type="button" onClick={() => void email()} disabled={Boolean(busy)}
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40">
          Email
        </button>
      </div>
      {busy && <div className="mb-4 text-sm text-neutral-500 print:hidden">{busy}</div>}
      {err && <div className="mb-4 text-sm text-red-700 print:hidden">{err}</div>}

      {/* Title block. */}
      <div className="mb-1 text-xs uppercase tracking-widest text-neutral-500">Installation sheet</div>
      <h1 className="text-2xl font-semibold">{sheet.title}</h1>
      <div className="mt-1 text-sm text-neutral-600">
        {t.walls} walls · {t.wallsReady} dispatched · {t.wallsInProduction} still printing
        {t.wallsNotPrinted > 0 && <> · {t.wallsNotPrinted} not printed</>}
        {t.stripsReady > 0 && <> · {t.stripsReady} strips ready to hang</>}
      </div>
      {(sheet.shipAddress || sheet.shipContactName) && (
        <div className="mt-1 text-xs text-neutral-500">
          {[sheet.shipAddress, sheet.shipCity, sheet.state].filter(Boolean).join(", ")}
          {sheet.shipContactName && <> · Site contact: {sheet.shipContactName} {sheet.shipContactPhone ?? ""}</>}
        </div>
      )}

      {/* Never let a failed status call read as "nothing was printed". */}
      {sheet.statusUnknown && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 print:break-inside-avoid">
          <span className="font-semibold">Production could not be reached, so the statuses below are not reliable.</span>{" "}
          The walls, rolls and ZVY numbers are correct — only whether each roll has been printed or dispatched is unknown.
          Check with the office before travelling to site on this copy.
        </div>
      )}

      {/* The one thing that causes mix-ups. */}
      <div className="mt-5 rounded-xl border border-neutral-300 bg-neutral-50 p-4 text-sm print:break-inside-avoid">
        <div className="font-semibold">Read the header band first</div>
        <p className="mt-1 text-neutral-700">
          Each strip prints its order number and position — <span className="font-mono font-semibold">ZVY-10663 PIECE 3 OF 9</span>.
          That <span className="font-semibold">9 counts the strips inside that one roll</span>, not the pieces of the wall.
          A long wall is supplied as several ZVY numbers and <span className="font-semibold">each one restarts at P1</span>,
          so find the ZVY number on this sheet before anything else. Cut the band off on the dashed line;
          the arrow beside the big P number points to the top of the design.
          {" "}<span className="font-semibold">The ZYVS- codes on the approval pages are artwork references and are printed nowhere on the paper</span> —
          the only thing on a roll is its ZVY number and its P number.
        </p>
      </div>

      {/* Wall rows. */}
      <div className="mt-6 space-y-4">
        {sheet.walls.map((w) => (
          <div key={w.seq}
            className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 pl-5 print:break-inside-avoid print:rounded-none">
            <span className={`absolute left-0 top-0 h-full w-1 ${STRIPE[w.readiness]}`} aria-hidden="true" />

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold">
                <span className="mr-2 text-neutral-400">{w.seq}.</span>{w.name}
              </div>
              <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${TONE[w.readiness]}`}>
                {LABEL[w.readiness]}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-neutral-500">
              {m2(w.widthMm)} × {m2(w.heightMm)}
              {w.series.length > 0 && <> · {w.series.join(" + ")}</>}
            </div>
            {/* Design refs sit BELOW the rolls and say what they are not. Left
                unlabelled next to a ZVY number they read as another thing to
                match, and there are nine of them on wall 1 — an installer
                hunting ZYVS-N59R9R on a roll will never find it. */}

            <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-start">
              <div className="shrink-0">
                {w.photoUrl
                  ? (w.quad && w.pieces[0]?.previewUrl
                      ? <WallMockup
                          photoUrl={w.photoUrl} artUrl={w.pieces[0]!.previewUrl!} quad={w.quad}
                          alt={`${w.name} with the approved creative`}
                          className="h-32 w-auto max-w-[260px] rounded-lg object-cover" />
                      : <img src={w.photoUrl} alt={w.name}
                          className="h-32 w-auto max-w-[220px] rounded-lg object-cover" />)
                  : <div className="grid h-32 w-[200px] place-items-center rounded-lg bg-neutral-100 text-xs text-neutral-400">
                      no site photo
                    </div>}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-neutral-400">
                  Printed on the roll{w.pieces.length > 1 && <> · hang in this order, left to right</>}
                </div>
                {w.pieces.length === 0 && (
                  <div className="text-sm text-red-700">No rolls have been ordered for this wall yet.</div>
                )}
                <div className="space-y-1.5">
                  {w.pieces.map((p) => (
                    <div key={p.orderRef}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-neutral-150 bg-neutral-50 px-2.5 py-2">
                      {p.previewUrl
                        ? <img src={p.previewUrl} alt="" className="h-9 w-14 shrink-0 rounded object-cover" />
                        : <div className="h-9 w-14 shrink-0 rounded bg-neutral-200" />}
                      <span className="font-mono text-base font-semibold tracking-tight">
                        {p.zvy ?? p.orderRef}
                      </span>
                      <span className="text-xs text-neutral-600">
                        {p.total > 1 ? `piece ${p.index} of ${p.total}` : "single roll"}
                        {" · "}
                        {p.strips ? `${p.strips} strip${p.strips === 1 ? "" : "s"} (P1–P${p.strips})` : "strips not yet set"}
                        {" · "}{m2(p.widthMm)}
                      </span>
                      <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ${TONE[p.readiness]}`}>
                        {LABEL[p.readiness]}
                      </span>
                    </div>
                  ))}
                </div>

                {w.codes.length > 0 && (
                  <div className="mt-2 text-[11px] leading-snug text-neutral-400">
                    <span className="font-semibold">Artwork references, not on the rolls:</span>{" "}
                    {w.codes.join(", ")}
                  </div>
                )}

                {w.supersededZvy.length > 0 && (
                  <div className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-800 ring-1 ring-red-200">
                    <span className="font-semibold">Do not use {w.supersededZvy.join(", ")}</span> — a cancelled or
                    replaced print of this same wall. If a roll with that number is in the consignment, set it aside.
                  </div>
                )}

                {w.readiness === "in_production" && w.pieces.length > 1 && (
                  <div className="mt-2 text-xs text-amber-800">
                    Do not start this wall until every roll above has arrived — the missing pieces sit inside the run.
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        <div className="font-semibold text-neutral-700">Before you paste</div>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Lay each wall out on the floor first, in ZVY order, and check every strip is there.</li>
          <li>Hang left to right, P1 first, within each roll. Confirm which end is &ldquo;left&rdquo; against the site measurement.</li>
          <li>Overlap each seam by 15&nbsp;mm and pattern-match — the overlap is printed on for exactly this. Do not butt-join.</li>
          <li>Cut the header band off on the dashed line only as you hang that strip; it is the strip&rsquo;s only label.</li>
          <li>Paste the wall, not the paper. Trim to the wall at ceiling, skirting and corners.</li>
        </ol>
        <p className="mt-3">
          {sheet.accountName} · {sheet.title} · status as at{" "}
          {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} and changes as consignments dispatch.
        </p>
      </div>
    </div>
  );
}
