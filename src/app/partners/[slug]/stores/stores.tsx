"use client";

import { VIJAY_SALES_SLUG } from "@/lib/receiver-mobile";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TIER1_CITIES, tier1City, tier1OnlyPartner } from "@/lib/tier1-cities";

/**
 * The partner's showrooms, and the links that get them measured.
 *
 * Two facts on one page because they are used in one sitting: an admin opens
 * this to send somebody out, and the store they are sending them to may not
 * exist as a record yet.
 *
 * The minted link is shown ONCE, on screen, and never again. That is not an
 * oversight to be tidied up later — only the hash is stored, so nothing here
 * or anywhere else can reproduce it. "Lost it" and "sent it to the wrong
 * person" have the same answer: send a new one, which revokes the old.
 */

type Store = {
  id: string; code: string; name: string; state: string; city: string | null;
  address_line: string | null; pincode: string | null;
  contact_name: string | null; contact_phone: string | null;
  gps: string | null; floors: number | null; series_names: string[]; notes: string | null;
};

type MeasureLink = {
  id: string; ref: string; storeId: string; storeName: string;
  recipientEmail: string; recipientName: string | null; brief: string | null;
  status: "live" | "opened" | "submitted" | "revoked" | "expired";
  createdBy: string; createdAt: string; expiresAt: string;
  openedAt: string | null; lastSeenAt: string | null; submittedAt: string | null;
  batchId: string | null;
};

type Minted = { ref: string; url: string; storeName: string; recipientEmail: string; emailed: boolean };

const when = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "—";

const STATUS: Record<MeasureLink["status"], { label: string; tone: string }> = {
  live:      { label: "Sent, not opened", tone: "text-slate" },
  opened:    { label: "Being measured",   tone: "text-emerald-700" },
  submitted: { label: "Submitted",        tone: "text-charcoal font-semibold" },
  revoked:   { label: "Revoked",          tone: "text-mist" },
  expired:   { label: "Expired",          tone: "text-mist" },
};

const BLANK = {
  name: "", state: "", city: "", addressLine: "", pincode: "",
  contactName: "", contactPhone: "", floors: "", series: "", gps: "",
};

export default function StoresManager({
  slug, accountName, isAdmin, embedded = false,
}: { slug: string; accountName: string; isAdmin: boolean; embedded?: boolean }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [links, setLinks] = useState<MeasureLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [minted, setMinted] = useState<Minted | null>(null);
  const [copied, setCopied] = useState(false);

  const [showStoreForm, setShowStoreForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  // HomeLane picks from the seven tier-1 cities and the city fixes the state
  // (the GSTIN hangs off it). Delhi NCR is the one city that straddles states,
  // so it alone gets a state dropdown. Everyone else keeps free text.
  const tier1 = tier1OnlyPartner(slug);
  const pickedCity = tier1 ? tier1City(form.city) : null;
  function pickCity(city: string) {
    const t = tier1City(city);
    setForm({ ...form, city: t?.city ?? "", state: t && t.states.length === 1 ? t.states[0] : "" });
  }

  const [sendFor, setSendFor] = useState<string | null>(null);
  const [to, setTo] = useState(""); const [toName, setToName] = useState("");
  const [brief, setBrief] = useState(""); const [days, setDays] = useState(14);

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([
      fetch("/api/corporate/stores", { cache: "no-store" }),
      isAdmin ? fetch("/api/corporate/measure-links", { cache: "no-store" }) : Promise.resolve(null),
    ]);
    if (s.ok) setStores(((await s.json()).stores ?? []) as Store[]);
    if (l?.ok) setLinks(((await l.json()).links ?? []) as MeasureLink[]);
    setLoading(false);
  }, [isAdmin]);

  // Initial network synchronisation; load writes state only after fetches settle.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  function editStore(st: Store) {
    setEditingId(st.id);
    setForm({
      name: st.name, state: st.state, city: st.city ?? "", addressLine: st.address_line ?? "",
      pincode: st.pincode ?? "", contactName: st.contact_name ?? "", contactPhone: st.contact_phone ?? "",
      floors: st.floors ? String(st.floors) : "", series: st.series_names.join(", "), gps: st.gps ?? "",
    });
    setShowStoreForm(true);
  }

  async function saveStore(e: React.FormEvent) {
    e.preventDefault();
    setBusy("store"); setErr(null);
    try {
      const r = await fetch("/api/corporate/stores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
          name: form.name, state: form.state, city: form.city,
          addressLine: form.addressLine, pincode: form.pincode,
          contactName: form.contactName, contactPhone: form.contactPhone,
          gps: form.gps,
          floors: form.floors ? Number(form.floors) : undefined,
          seriesNames: form.series.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Could not save that store."); return; }
      setForm({ ...BLANK }); setEditingId(null); setShowStoreForm(false);
      await load();
    } finally { setBusy(null); }
  }

  async function mint(storeId: string) {
    setBusy("mint"); setErr(null); setMinted(null); setCopied(false);
    try {
      const r = await fetch("/api/corporate/measure-links", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, email: to, name: toName, brief, days }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Could not create that link."); return; }
      setMinted({ ...j.link, emailed: j.emailed });
      setSendFor(null); setTo(""); setToName(""); setBrief("");
      await load();
    } finally { setBusy(null); }
  }

  async function revoke(l: MeasureLink) {
    if (!confirm(
      `Revoke ${l.ref}? ${l.recipientEmail} will not be able to open it again, ` +
      `and anything already measured stays saved.`,
    )) return;
    setBusy(l.id); setErr(null);
    try {
      const r = await fetch("/api/corporate/measure-links", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", id: l.id }),
      });
      if (!r.ok) setErr((await r.json()).error ?? "Could not revoke that link.");
      await load();
    } finally { setBusy(null); }
  }

  const linksFor = (storeId: string) =>
    links.filter((l) => l.storeId === storeId && (l.status === "live" || l.status === "opened"));

  return (
    <div className={embedded ? "py-3" : "container-x py-8 sm:py-10"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold leading-tight sm:text-2xl">Stores</h1>
          <p className="truncate text-xs text-slate">
            {accountName} · where wallpaper is measured, designed and delivered
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/partners/${slug}/site-batches`} className="text-sm text-slate underline">Surveys</Link>
          {!embedded && <Link href={`/partners/${slug}/orders`} className="text-sm text-slate underline">Your orders</Link>}
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      {/* The one and only sight of a minted link. */}
      {minted && (
        <div className="mt-5 rounded-[18px] border border-emerald-300 bg-emerald-50 p-4">
          <p className="font-display text-base font-bold text-emerald-900">
            Link ready for {minted.storeName}
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            {minted.emailed
              ? `Emailed to ${minted.recipientEmail}. `
              : `We could NOT email it to ${minted.recipientEmail} — send it yourself. `}
            This is the only time it can be shown, so copy it now if you want to WhatsApp it too.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input readOnly value={minted.url} onFocus={(e) => e.currentTarget.select()}
              className="h-11 min-w-[260px] flex-1 rounded-[12px] border border-emerald-300 bg-white px-3 font-mono text-xs" />
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(minted.url).then(() => setCopied(true));
              }}
              className="btn h-11 px-5 text-[0.8rem]">{copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="mt-2 text-xs text-emerald-800">Reference {minted.ref}</p>
        </div>
      )}

      {/* ── Add / edit a store ───────────────────────────────────────────── */}
      {isAdmin && (
        showStoreForm ? (
          <form onSubmit={saveStore} className="mt-6 rounded-[18px] border border-edge bg-wash p-4 sm:p-5">
            <p className="font-display text-base font-bold">
              {editingId ? "Edit store" : "Add a store"}
            </p>
            <p className="mt-1 text-xs text-slate">
              The address here is the address the pallet goes to. The state decides which GSTIN the
              invoice is raised under.
              {tier1 && " Stores are limited to the seven tier-1 cities; the city sets the state."}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Store name — Pune Bhosari"
                className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
              {tier1 ? (
                <>
                  <select required value={pickedCity?.city ?? ""} onChange={(e) => pickCity(e.target.value)}
                    aria-label="City"
                    className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm">
                    <option value="" disabled>City — tier-1 only</option>
                    {TIER1_CITIES.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
                  </select>
                  {pickedCity && pickedCity.states.length > 1 ? (
                    <select required value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
                      aria-label="State"
                      className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm">
                      <option value="" disabled>State — which part of {pickedCity.city}?</option>
                      {pickedCity.states.map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  ) : (
                    <input readOnly required value={form.state} tabIndex={-1}
                      placeholder="State — set by the city"
                      aria-label="State"
                      className="h-11 rounded-[12px] border border-edge bg-wash px-3 text-sm text-slate" />
                  )}
                </>
              ) : (
                <>
                  <input required value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
                    placeholder="State — Maharashtra"
                    className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                    placeholder="City" className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
                </>
              )}
              <input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                placeholder="PIN code" className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
              <input value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
                placeholder="Delivery address" className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm sm:col-span-2" />
              <div className="sm:col-span-2">
                <input value={form.gps} onChange={(e) => setForm({ ...form, gps: e.target.value })}
                  placeholder="Google Maps link"
                  inputMode="url"
                  className="h-11 w-full rounded-[12px] border border-edge bg-surface px-3 text-sm" />
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [form.name, form.addressLine, form.city, form.state, form.pincode].filter(Boolean).join(", "),
                  )}`}
                  target="_blank" rel="noreferrer"
                  className="mt-1 inline-block text-xs text-slate underline">
                  Find this store on Google Maps, then paste its share link above
                </a>
              </div>
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="Site contact" className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
              <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                placeholder={slug === VIJAY_SALES_SLUG ? "Site mobile (optional)" : "Site mobile (required — the courier rings it)"}
                inputMode="tel" autoComplete="tel" required={slug !== VIJAY_SALES_SLUG}
                className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
              <input value={form.floors} inputMode="numeric"
                onChange={(e) => setForm({ ...form, floors: e.target.value })}
                placeholder="Floors" className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
              <input value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })}
                placeholder="Standing brief — Series 2, Pune"
                className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy === "store"}
                className="btn h-11 px-5 text-[0.8rem] disabled:opacity-40">
                {busy === "store" ? "Saving…" : editingId ? "Save store" : "Add store"}
              </button>
              <button type="button"
                onClick={() => { setShowStoreForm(false); setEditingId(null); setForm({ ...BLANK }); }}
                className="text-sm text-slate underline">Cancel</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowStoreForm(true)} className="btn mt-6 h-11 px-5 text-[0.8rem]">
            Add a store
          </button>
        )
      )}

      {/* ── The stores ───────────────────────────────────────────────────── */}
      <section className="mt-8">
        <p className="caps text-slate">Your stores ({stores.length})</p>
        {loading ? (
          <p className="mt-3 text-sm text-slate">Loading…</p>
        ) : stores.length === 0 ? (
          <p className="mt-3 text-sm text-slate">
            No stores yet. Add one, then send someone out to measure it.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {stores.map((st) => {
              const open = linksFor(st.id);
              return (
                <div key={st.id} className="rounded-[18px] border border-edge bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-charcoal">{st.name}</p>
                      <p className="mt-0.5 text-xs text-slate">
                        {[st.city, st.state].filter(Boolean).join(", ")}
                        {st.floors ? ` · ${st.floors} floors` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-mist">
                        {st.address_line
                          ? `${st.address_line}${st.pincode ? ` — ${st.pincode}` : ""}`
                          : "No delivery address yet — add one before an order ships."}
                      </p>
                      {st.series_names.length > 0 && (
                        <p className="mt-0.5 text-xs text-mist">Standing brief: {st.series_names.join(", ")}</p>
                      )}
                      {st.gps && (
                        <a href={st.gps} target="_blank" rel="noreferrer"
                          className="mt-1 inline-block text-xs text-slate underline">Open in Google Maps</a>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex flex-wrap items-center gap-3">
                        <button onClick={() => editStore(st)} className="text-xs text-slate underline">Edit</button>
                        <button onClick={() => { setSendFor(sendFor === st.id ? null : st.id); setErr(null); }}
                          className="btn h-10 px-4 text-[0.75rem]">
                          {sendFor === st.id ? "Close" : "Send someone to measure"}
                        </button>
                      </div>
                    )}
                  </div>

                  {open.length > 0 && (
                    <div className="mt-3 border-t border-edge pt-3">
                      {open.map((l) => (
                        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                          <p className="text-xs text-slate">
                            <span className={STATUS[l.status].tone}>{STATUS[l.status].label}</span>
                            {" · "}{l.recipientName ? `${l.recipientName} (${l.recipientEmail})` : l.recipientEmail}
                            {" · "}<span className="text-mist">
                              {l.ref} · sent {when(l.createdAt)} · expires {when(l.expiresAt)}
                            </span>
                          </p>
                          <button onClick={() => void revoke(l)} disabled={busy === l.id}
                            className="text-xs text-red-700 underline disabled:opacity-40">Revoke</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {sendFor === st.id && (
                    <div className="mt-3 rounded-[12px] border border-edge bg-wash p-3">
                      <p className="text-xs text-slate">
                        They don&apos;t need a login and don&apos;t have to be on your email domain —
                        a shopfitter on a personal address is fine. The link only opens this store&apos;s
                        measurement form.
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input type="email" value={to} onChange={(e) => setTo(e.target.value)}
                          placeholder="Their email address"
                          className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
                        <input value={toName} onChange={(e) => setToName(e.target.value)}
                          placeholder="Their name (optional)"
                          className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm" />
                        <input value={brief} onChange={(e) => setBrief(e.target.value)}
                          placeholder="What should they measure? (optional)"
                          className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm sm:col-span-2" />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <label className="text-xs text-slate">
                          Valid for
                          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
                            className="ml-2 h-10 rounded-[12px] border border-edge bg-surface px-2 text-sm">
                            {[7, 14, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
                          </select>
                        </label>
                        <button onClick={() => void mint(st.id)} disabled={busy === "mint" || !to.trim()}
                          className="btn h-11 px-5 text-[0.8rem] disabled:opacity-40">
                          {busy === "mint" ? "Sending…" : "Send the link"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Closed links, for the record ─────────────────────────────────── */}
      {isAdmin && links.some((l) => l.status !== "live" && l.status !== "opened") && (
        <section className="mt-8">
          <p className="caps text-slate">Past links</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <tbody>
                {links.filter((l) => l.status !== "live" && l.status !== "opened").map((l) => (
                  <tr key={l.id} className="border-b border-edge/60">
                    <td className="py-2 pr-3">
                      <p className="text-charcoal">{l.storeName}</p>
                      <p className="text-xs text-mist">{l.ref} · {l.recipientEmail}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs ${STATUS[l.status].tone}`}>{STATUS[l.status].label}</span>
                      <p className="text-xs text-mist">{when(l.submittedAt ?? l.createdAt)}</p>
                    </td>
                    <td className="py-2 pl-3 text-right">
                      {l.batchId && (
                        <Link href={`/partners/${slug}/site-batches/${l.batchId}`}
                          className="text-xs text-slate underline">Open the survey</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!isAdmin && !loading && (
        <p className="mt-6 text-xs text-mist">
          Read-only — an account admin sends people out to measure.
        </p>
      )}
    </div>
  );
}
