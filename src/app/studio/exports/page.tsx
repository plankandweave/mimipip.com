"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StaffGate, useStaff } from "@/lib/use-staff";

// The FBA export desk — hand-curate a marketplace shipment from the live
// canvas catalogue: pick designs, tick sizes, set quantities, download the
// marketplace's own template filled with the site's numbers (MRP GST-inclusive,
// HSN + GST rate as the sheet's tax split). Selection is deliberately manual —
// automated curation waits for real sales data to rank on.
//
// Opened by the Google sign-in on the door (Cloudflare Access) and nothing else.

const ADDR_STORE = "zyvorah:fba-pickup";

type Fmt = "amazon-fba" | "pepperfry";
const FORMAT_OPTS: { key: Fmt; label: string; note: string }[] = [
  { key: "amazon-fba", label: "Amazon FBA", note: "inbound shipment sheet + email to Amazon" },
  { key: "pepperfry", label: "Pepperfry", note: "listing sheet (Wall Stickers) — self-adhesive only, no email" },
];
type Media = "self-adhesive" | "canvas";
const MEDIA_OPTS: { key: Media; label: string; note: string }[] = [
  { key: "self-adhesive", label: "Self-adhesive", note: "peel & stick — what Amazon takes" },
  { key: "canvas", label: "Canvas", note: "rolled, framed at home" },
];
type SizeOpt = { w: number; h: number; label: string; prices: Record<Media, number> };
type Item = { handle: string; title: string; status: string; flat: string | null; media: Media[]; sizes: SizeOpt[] };
type Pick = { qty: string; on: boolean };

const keyOf = (s: { w: number; h: number }) => `${s.w}x${s.h}`;

export default function FbaExportsPage() {
  const staff = useStaff();
  const [items, setItems] = useState<Item[] | null>(null);
  const [picks, setPicks] = useState<Record<string, Record<string, Pick>>>({});
  const [pickup, setPickup] = useState(() => (typeof window === "undefined" ? "" : localStorage.getItem(ADDR_STORE) ?? ""));
  const [format, setFormat] = useState<Fmt>("amazon-fba");
  // One medium per sheet. Amazon only takes the self-adhesive line, so it
  // leads — and Pepperfry lists nothing else, so choosing it forces the medium.
  const [media, setMedia] = useState<Media>("self-adhesive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [minting, setMinting] = useState(false);
  const [mintQueued, setMintQueued] = useState<{ count: number; skipped: number } | null>(null);
  const [mintStatus, setMintStatus] = useState<{
    counts: Record<string, number>;
    recent: { zyvCode: string; status: string; result: string | null }[];
    failed: { zyvCode: string; error: string }[];
  } | null>(null);
  const [confirmed, setConfirmed] = useState<{ ref: string; units: number; rollMeters: number | null; rolls: number | null; unqueued: number; missingFnsku: string[] } | null>(null);

  useEffect(() => {
    if (staff !== "in") return;
    let cancelled = false;
    fetch("/api/studio/fba-items")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) { setItems([]); setError("Couldn't load the catalogue — your sign-in may have lapsed. Reload the page."); return; }
        setItems((await res.json()).items ?? []);
      })
      .catch(() => { if (!cancelled) { setItems([]); setError("Couldn't load the catalogue."); } });
    return () => { cancelled = true; };
  }, [staff]);

  const toggle = (handle: string, s: SizeOpt) =>
    setPicks((prev) => {
      const design = { ...(prev[handle] ?? {}) };
      const cur = design[keyOf(s)];
      design[keyOf(s)] = { on: !cur?.on, qty: cur?.qty ?? "" };
      return { ...prev, [handle]: design };
    });

  const setQty = (handle: string, s: SizeOpt, qty: string) =>
    setPicks((prev) => ({
      ...prev,
      [handle]: { ...(prev[handle] ?? {}), [keyOf(s)]: { on: true, qty: qty.replace(/\D/g, "").slice(0, 5) } },
    }));

  const selectAll = (item: Item, on: boolean) =>
    setPicks((prev) => ({
      ...prev,
      [item.handle]: Object.fromEntries(item.sizes.map((s) => [keyOf(s), { on, qty: prev[item.handle]?.[keyOf(s)]?.qty ?? "" }])),
    }));

  const selection = (items ?? []).flatMap((it) => {
    if (!it.media.includes(media)) return [];
    const sizes = it.sizes.filter((s) => picks[it.handle]?.[keyOf(s)]?.on);
    return sizes.length ? [{ handle: it.handle, sizes: sizes.map((s) => ({ w: s.w, h: s.h, qty: Number(picks[it.handle][keyOf(s)].qty) || null })) }] : [];
  });
  const skuCount = selection.reduce((n, s) => n + s.sizes.length, 0);
  // The shipment's money summary, live: quantity × the chosen medium's price.
  // Rows without a quantity count as SKUs but add nothing to the total.
  const totals = (items ?? []).reduce(
    (acc, it) => {
      if (!it.media.includes(media)) return acc;
      for (const s of it.sizes) {
        const p = picks[it.handle]?.[keyOf(s)];
        const qty = Number(p?.qty) || 0;
        if (p?.on && qty > 0) { acc.value += qty * (s.prices[media] ?? 0); acc.units += qty; }
      }
      return acc;
    },
    { value: 0, units: 0 },
  );

  // Confirm the order → the OS opens a production batch per line, queues each
  // on the print engine, and books the FBA shipment. Quantities are required:
  // a line with no quantity is a sheet row, not a production instruction.
  const confirmOrder = async () => {
    if (!totals.units || confirming) return;
    if (!window.confirm(`Confirm this order for production?\n\n${totals.units} units · ₹${totals.value.toLocaleString("en-IN")}\n\nThis queues the print jobs on the engine and books the FBA shipment.`)) return;
    setConfirming(true); setError(null); setConfirmed(null);
    try {
      const res = await fetch("/api/studio/fba-confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: selection }),
      });
      const j = await res.json();
      if (!res.ok) {
        const detail = [
          j.error,
          j.unlocked?.length ? `Not locked: ${j.unlocked.join(", ")}` : "",
          j.missing?.length ? `Unknown to the OS: ${j.missing.join(", ")}` : "",
        ].filter(Boolean).join(" · ");
        throw new Error(detail || "confirm failed");
      }
      setConfirmed({
        ref: j.shipment?.shipmentRef ?? "—",
        units: j.totals?.units ?? 0,
        rollMeters: j.totals?.rollMeters ?? null,
        rolls: j.totals?.rollsOf50m ?? null,
        unqueued: (j.unqueued ?? []).length,
        missingFnsku: j.missingFnsku ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm failed.");
    } finally {
      setConfirming(false);
    }
  };

  // A size that has never been sold has no SKU in the OS, and Confirm refuses
  // any line that isn't locked. This is that missing step: the OS pulls each
  // flat into the engine, renders the master ONCE and freezes the spec.
  //
  // Queued, not done inline — a master is 20-30s of engine time, so a full
  // ladder outlives any one request. This hands the picks to a worker that
  // chains through them and closes; the page just watches. Closing the tab
  // doesn't stop it.
  const mintSkus = async () => {
    if (!skuCount || minting) return;
    if (!window.confirm(
      `Mint & lock ${skuCount} SKU${skuCount > 1 ? "s" : ""} in the OS?\n\n` +
      `Each one renders its print master on the engine and freezes the spec — after this, the size, crop and media of these SKUs can never change (a change means a new SKU).\n\n` +
      `Already-locked SKUs are left alone. This runs in the background — you can close the page.`,
    )) return;
    setMinting(true); setError(null);
    try {
      const res = await fetch("/api/studio/fba-mint", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: selection }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "could not queue the mint");
      setMintQueued({ count: j.count ?? 0, skipped: j.skipped ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mint failed.");
      setMinting(false);
    }
  };

  // Poll while the queue has work. The worker chains on the server, so this is
  // only a window onto it — nothing here keeps it running.
  useEffect(() => {
    if (staff !== "in" || !mintQueued) return;
    let live = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/studio/mint-status");
        if (!r.ok) return;
        const j = await r.json();
        if (!live) return;
        setMintStatus(j);
        const c = j.counts ?? {};
        if (!(c.queued || c.minting)) setMinting(false);
      } catch { /* a dropped poll is not a failed mint */ }
    };
    void tick();
    const id = setInterval(tick, 4000);
    return () => { live = false; clearInterval(id); };
  }, [staff, mintQueued]);

  const exportSheet = async () => {
    if (!skuCount || busy) return;
    setBusy(true); setError(null); setSent(null);
    try {
      localStorage.setItem(ADDR_STORE, pickup);
      const res = await fetch("/api/studio/fba-export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, media, pickupAddress: pickup, picks: selection }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "export failed");
      const emailStatus = res.headers.get("X-Shipment-Email");
      setSent(
        emailStatus === "sent"
          ? `Shipment emailed ✓ — total ₹${totals.value.toLocaleString("en-IN")} to Amazon, cc Savita & Roheena.`
          : emailStatus === "failed"
            ? "Sheet exported, but the shipment email FAILED — check RESEND_API_KEY / logs and resend."
            : null,
      );
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "Zyvorah-Amazon-FBA.xlsx";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  if (staff !== "in") return <StaffGate state={staff} title="FBA export desk" />;

  return (
    <div className="container-x py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">FBA export desk</h1>
          <p className="mt-1 text-sm text-slate">
            Pick designs and sizes, set quantities, download the filled Amazon FBA sheet. Prices are the
            site&apos;s own (GST-inclusive), with HSN and GST rate as the sheet&apos;s tax split.
          </p>
        </div>
        <Link href="/studio" className="text-xs text-slate underline underline-offset-2">← Studio</Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[16px] bg-wash p-4">
        <span className="text-xs font-semibold text-slate">Marketplace</span>
        <div className="flex gap-1.5">
          {FORMAT_OPTS.map((f) => (
            <button
              key={f.key} type="button" title={f.note}
              onClick={() => { setFormat(f.key); if (f.key === "pepperfry") setMedia("self-adhesive"); }}
              className={`rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors ${
                format === f.key ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-slate"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs font-semibold text-slate">Medium</span>
        <div className="flex gap-1.5">
          {MEDIA_OPTS.map((m) => (
            <button
              key={m.key} type="button" title={format === "pepperfry" && m.key === "canvas" ? "Pepperfry lists only the self-adhesive line" : m.note}
              disabled={format === "pepperfry" && m.key === "canvas"}
              onClick={() => setMedia(m.key)}
              className={`rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors ${
                media === m.key ? "border-charcoal bg-charcoal text-surface" : "border-edge text-slate hover:border-slate"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="text-xs font-semibold text-slate" htmlFor="pickup">Pickup address</label>
        <input
          id="pickup" value={pickup} onChange={(e) => setPickup(e.target.value)}
          placeholder="Applied to every row — leave blank to fill in Excel"
          className="h-10 min-w-72 flex-1 rounded-[10px] border border-edge bg-surface px-3 text-xs outline-none focus:border-charcoal"
        />
        <div className="text-right">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-mist">Total sale value</p>
          <p className="font-display text-xl font-bold leading-tight">
            ₹{totals.value.toLocaleString("en-IN")}
            <span className="ml-1 text-[0.68rem] font-normal text-slate">{totals.units} units</span>
          </p>
        </div>
        {format === "amazon-fba" && (
          <button
            onClick={mintSkus} disabled={!skuCount || minting || confirming || busy}
            title={skuCount ? "Create and lock these SKUs in the OS — needed once per size before a shipment can be confirmed" : "Pick some sizes first"}
            className="btn btn-ghost h-10 px-5 text-[0.78rem] disabled:opacity-40"
          >
            {minting ? "Minting…" : `Mint & lock SKUs${skuCount ? ` · ${skuCount}` : ""}`}
          </button>
        )}
        {format === "amazon-fba" && (
          <button
            onClick={confirmOrder} disabled={!totals.units || confirming || busy}
            title={totals.units ? "Queue production and book the FBA shipment" : "Set quantities first"}
            className="btn h-10 px-5 text-[0.78rem] disabled:opacity-40"
          >
            {confirming ? "Confirming…" : `Confirm order${totals.units ? ` · ${totals.units} units` : ""}`}
          </button>
        )}
        <button
          onClick={exportSheet} disabled={!skuCount || busy}
          className="btn h-10 px-5 text-[0.78rem] disabled:opacity-40"
        >
          {busy
            ? "Building…"
            : `${format === "pepperfry" ? "Export Pepperfry sheet" : "Export & email"}${skuCount ? ` · ${skuCount} SKU${skuCount > 1 ? "s" : ""}` : ""}`}
        </button>
        <p className="w-full text-[0.62rem] text-mist">
          Exporting also emails the sheet and its total from sales@zyvorah.com → imshanm@amazon.com,
          cc savita.m@magnitudegroup.in &amp; roheena@magnitudegroup.in.
        </p>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {sent && <p className="mt-3 text-sm font-medium text-charcoal">{sent}</p>}
      {mintQueued && mintStatus && (() => {
        const c = mintStatus.counts ?? {};
        const left = (c.queued ?? 0) + (c.minting ?? 0);
        const done = c.done ?? 0;
        const failed = c.failed ?? 0;
        const skipped = c.skipped ?? 0;
        const total = left + done + failed + skipped;
        return (
          <div className={`mt-3 rounded-[14px] px-4 py-3 text-sm ${failed ? "bg-blush/50" : left ? "bg-sky/40" : "bg-sage/40"}`}>
            <p className="font-semibold">
              {left
                ? `Minting — ${done} of ${total} done, ${left} to go`
                : `${done} SKU${done === 1 ? "" : "s"} locked`}
              {failed ? ` · ${failed} refused` : ""}
              {skipped ? ` · ${skipped} skipped` : ""}
            </p>
            {left > 0 && (
              <>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-charcoal transition-all duration-500"
                    style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[0.78rem] text-slate">
                  Each SKU renders its master on the engine (~20–30s). This carries on server-side —
                  you can close the page and come back.
                </p>
              </>
            )}
            {mintQueued.skipped > 0 && left > 0 && (
              <p className="mt-1 text-[0.78rem] text-slate">
                {mintQueued.skipped} were already queued and weren&apos;t added again.
              </p>
            )}
            {mintStatus.failed.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-[0.78rem] text-slate">
                {mintStatus.failed.slice(0, 8).map((f) => (
                  <li key={f.zyvCode}><span className="font-mono text-[0.72rem]">{f.zyvCode}</span> — {f.error}</li>
                ))}
              </ul>
            )}
            {!left && !failed && done > 0 && (
              <p className="mt-1 text-[0.78rem] text-slate">Every picked size now has a locked SKU — the order can be confirmed.</p>
            )}
          </div>
        );
      })()}

      {confirmed && (
        <div className="mt-3 rounded-[14px] bg-sage/40 px-4 py-3 text-sm">
          <p className="font-semibold">Order confirmed — {confirmed.ref}</p>
          <p className="mt-1 text-[0.78rem] text-slate">
            {confirmed.units} units queued for print{confirmed.rollMeters != null ? ` · ${confirmed.rollMeters} m of media (${confirmed.rolls} roll${confirmed.rolls === 1 ? "" : "s"} of 50 m)` : ""}.
            Stock issues to FBA on its own once the floor confirms the last printed batch.
          </p>
          {confirmed.unqueued > 0 && (
            <p className="mt-1 text-[0.78rem] font-medium text-red-600">
              {confirmed.unqueued} batch{confirmed.unqueued === 1 ? "" : "es"} could not reach the print engine — they are nested in the OS and need releasing there.
            </p>
          )}
          {confirmed.missingFnsku.length > 0 && (
            <p className="mt-1 text-[0.78rem] text-slate">
              No FNSKU yet on: {confirmed.missingFnsku.join(", ")} — needed before cartons are sealed.
            </p>
          )}
        </div>
      )}

      {items === null ? (
        <p className="mt-8 text-sm text-mist">Loading canvas designs…</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-sm text-mist">No canvas designs yet — upload one in the Studio&apos;s Wall art section.</p>
      ) : (
        <div className="mt-6 grid gap-3">
          {items.map((it) => {
            const design = picks[it.handle] ?? {};
            const anyOn = it.sizes.some((s) => design[keyOf(s)]?.on);
            const offersMedium = it.media.includes(media);
            return (
              <div key={it.handle} className={`flex flex-wrap items-center gap-4 rounded-[16px] border border-edge bg-surface p-4 ${offersMedium ? "" : "opacity-45"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.flat && <img src={it.flat} alt={it.title} className="h-16 w-16 shrink-0 rounded-[10px] object-cover" />}
                <div className="min-w-40">
                  <p className="font-semibold">{it.title}</p>
                  <p className="mt-0.5 text-[0.65rem] uppercase tracking-wide text-mist">
                    {it.status}{it.status !== "active" && " — not live yet"}
                    {!offersMedium && " · not sold in this medium"}
                  </p>
                  <button onClick={() => selectAll(it, !anyOn)} className="mt-1 text-[0.68rem] text-slate underline underline-offset-2">
                    {anyOn ? "Clear" : "All sizes"}
                  </button>
                </div>
                <div className="flex flex-1 flex-wrap gap-2">
                  {it.sizes.map((s) => {
                    const p = design[keyOf(s)];
                    return (
                      <div key={keyOf(s)} className={`flex items-center gap-2 rounded-[12px] border-2 px-3 py-2 ${p?.on ? "border-charcoal" : "border-edge"}`}>
                        <button onClick={() => toggle(it.handle, s)} className="text-left">
                          <span className="block text-xs font-semibold">{p?.on ? "✓ " : ""}{s.label}</span>
                          <span className="block text-[0.65rem] text-slate">₹{(s.prices[media] ?? 0).toLocaleString("en-IN")}</span>
                        </button>
                        {p?.on && (
                          <input
                            value={p.qty} onChange={(e) => setQty(it.handle, s, e.target.value)}
                            placeholder="qty" inputMode="numeric" aria-label={`Quantity for ${it.title} ${s.label}`}
                            className="h-8 w-14 rounded-[8px] border border-edge bg-wash px-2 text-center text-xs outline-none focus:border-charcoal"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-[0.68rem] text-mist">
        Pepperfry export joins this desk once its template is supplied. Quantities left blank stay yellow in the
        sheet to fill later; box weights are pack-out estimates noted on the sheet.
      </p>
    </div>
  );
}
