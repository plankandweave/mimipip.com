"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StaffGate, useStaff } from "@/lib/use-staff";
import { deliverableLabel } from "@/lib/collab-brief-email";
import { isOverdue } from "@/lib/collab-admin";
import { trackingPath } from "@/lib/collab-codes";
import { istDateKey } from "@/lib/ist";

// The creator collaboration desk (founder, 7 October 2026).
//
// One row per creator we gift a wall to in return for deliverables. The row
// holds the person, the gift (a personal code up to 100%, optionally for
// named designs), the share link and hashtags, what she owes back, and what
// her audience did on the site — by town, by source, through to orders.
// Pitches still arrive on the Collabs tab of the marketing desk; an approved
// one starts here with one click ("Start collaboration").

const ACCENT = "#8C7B6B";

type Deliverable = {
  id: string;
  collaboration_id?: string;
  kind: string;
  description: string | null;
  due_on: string | null;
  status: string;
  url: string | null;
  posted_at: string | null;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  metrics_at: string | null;
  note: string | null;
};

type Order = {
  id: string;
  order_number: number;
  zvy: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  payment_status: string;
  access_token: string | null;
  created_at: string;
} | null;

type Collab = {
  id: string;
  slug: string;
  status: string;
  name: string;
  email: string;
  phone: string | null;
  instagram: string | null;
  youtube: string | null;
  other_links: string[];
  city: string | null;
  country: string;
  followers: number | null;
  audience_note: string | null;
  inquiry_id: string | null;
  code: string;
  discount_pct: number;
  max_value_inr: number | null;
  allowed_handles: string[] | null;
  free_shipping: boolean;
  code_expires_at: string | null;
  order_id: string | null;
  redeemed_at: string | null;
  hashtags: string[];
  landing_path: string;
  notes: string | null;
  created_at: string;
  deliverables?: Deliverable[];
  clicks?: number;
  order?: Order;
};

type KV = { key: string; n: number };
type Report = {
  campaign: string;
  clicks: { total: number; bots: number; first_at: string | null; last_at: string | null; by_country: KV[]; by_city: KV[]; by_referrer: KV[]; by_day: { day: string; n: number }[] };
  sessions: { total: number; visitors: number; by_source: KV[]; by_country: KV[] };
  outcomes: { views: number; saves: number; configurations: number; cart_adds: number; checkouts: number; orders: number; paid_orders: number; paid_value_inr: number };
  top_designs: { handle: string; n: number }[];
} | null;

const STATUS_LABEL: Record<string, string> = {
  agreed: "Agreed",
  ordered: "Wall ordered",
  delivered: "Wall delivered",
  live: "Content live",
  complete: "Complete",
  cancelled: "Cancelled",
};
const DELIVERABLE_STATUS: Record<string, string> = { pending: "Pending", posted: "Posted", verified: "Verified", late: "Late", waived: "Waived" };
const KINDS = ["reel", "story", "post", "carousel", "youtube", "short", "blog", "ugc_raw", "other"];

const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${Math.round(Number(n)).toLocaleString("en-IN")}`);
const num = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", headers: { "Content-Type": "application/json" }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong.");
  return data as T;
}

function offerLine(c: Pick<Collab, "discount_pct" | "max_value_inr" | "free_shipping">) {
  const what = c.discount_pct >= 100 ? "Free wall" : `${c.discount_pct}% off`;
  return `${what}${c.max_value_inr ? ` up to ${inr(c.max_value_inr)}` : ""}${c.free_shipping ? " · delivery included" : ""}`;
}

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="min-h-10 rounded-full border border-edge px-3 text-xs text-slate hover:border-charcoal"
    >
      {done ? "Copied" : label}
    </button>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-edge pt-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-charcoal">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-slate">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-mist">{hint}</span>}
    </label>
  );
}

const input = "h-10 w-full rounded-lg border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal";
const area = "w-full rounded-lg border border-edge bg-surface p-3 text-sm outline-none focus:border-charcoal";

function Bars({ rows, empty }: { rows: KV[]; empty: string }) {
  if (!rows?.length) return <p className="text-sm text-mist">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3 text-sm">
          <span className="truncate text-charcoal" title={r.key}>{r.key}</span>
          <span className="h-1.5 rounded-full bg-wash">
            <span className="block h-1.5 rounded-full" style={{ width: `${(r.n / max) * 100}%`, background: ACCENT }} />
          </span>
          <span className="text-right tabular-nums text-slate">{r.n.toLocaleString("en-IN")}</span>
        </li>
      ))}
    </ul>
  );
}

// ---- New collaboration --------------------------------------------------

type DraftDeliverable = { kind: string; description: string; due_on: string };

function NewCollab({ prefill, onCreated, onCancel }: { prefill: Partial<Collab> & { inquiry_id?: string | null }; onCreated: (id: string) => void; onCancel: () => void }) {
  const [f, setF] = useState({
    name: prefill.name ?? "",
    email: prefill.email ?? "",
    instagram: prefill.instagram ?? "",
    phone: "",
    city: prefill.city ?? "",
    followers: prefill.followers != null ? String(prefill.followers) : "",
    other_links: (prefill.other_links ?? []).join(" "),
    discount_pct: "100",
    max_value_inr: "",
    allowed_handles: "",
    free_shipping: true,
    code_expires_at: "",
    hashtags: "ZyvorahWalls",
    landing_path: "/",
    code: prefill.code ?? "",
    slug: prefill.slug ?? "",
    notes: "",
  });
  const [dels, setDels] = useState<DraftDeliverable[]>([{ kind: "reel", description: "Before-and-after reveal of the wall", due_on: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...f };
      if (!f.code.trim()) delete payload.code;
      if (!f.slug.trim()) delete payload.slug;
      if (prefill.inquiry_id) payload.inquiry_id = prefill.inquiry_id;
      const { id } = await api<{ id: string }>("/api/admin/collabs", { method: "POST", body: JSON.stringify(payload) });
      for (const d of dels.filter((x) => x.kind)) {
        await api("/api/admin/collabs/deliverables", {
          method: "POST",
          body: JSON.stringify({ collaboration_id: id, kind: d.kind, description: d.description, due_on: d.due_on || null }),
        });
      }
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-charcoal">New collaboration</h1>
        <button type="button" onClick={onCancel} className="min-h-10 text-sm text-slate underline underline-offset-2">Back to all</button>
      </div>
      {prefill.inquiry_id && <p className="text-sm text-slate">Started from a pitch on the Collabs tab — check the details below.</p>}

      <Section title="The creator">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input className={input} value={f.name} onChange={set("name")} /></Field>
          <Field label="Email" hint="The code only works at checkout with this address."><input className={input} type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Instagram"><input className={input} value={f.instagram} onChange={set("instagram")} placeholder="@handle or profile link" /></Field>
          <Field label="Phone"><input className={input} value={f.phone} onChange={set("phone")} /></Field>
          <Field label="City"><input className={input} value={f.city} onChange={set("city")} /></Field>
          <Field label="Followers"><input className={input} inputMode="numeric" value={f.followers} onChange={set("followers")} /></Field>
          <div className="sm:col-span-2"><Field label="Other links (YouTube, blog…)"><input className={input} value={f.other_links} onChange={set("other_links")} /></Field></div>
        </div>
      </Section>

      <Section title="The gift">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Discount (%)" hint="100 is a free wall."><input className={input} inputMode="numeric" value={f.discount_pct} onChange={set("discount_pct")} /></Field>
          <Field label="Up to (₹)" hint="Leave blank for no ceiling."><input className={input} inputMode="numeric" value={f.max_value_inr} onChange={set("max_value_inr")} /></Field>
          <div className="sm:col-span-2">
            <Field label="Only for these designs" hint="Product handles or links, separated by commas. Leave blank for any design.">
              <input className={input} value={f.allowed_handles} onChange={set("allowed_handles")} placeholder="wildflower-reverie, chateau-village" />
            </Field>
          </div>
          <Field label="Order by" hint="Optional. The code stops working after this date."><input className={input} type="date" value={f.code_expires_at} onChange={set("code_expires_at")} /></Field>
          <Field label="Code" hint="Leave blank and one is made from the name."><input className={input} value={f.code} onChange={set("code")} placeholder="ZYV-PRIYA-7K2Q" /></Field>
          <label className="flex min-h-10 items-center gap-2 text-sm text-charcoal">
            <input type="checkbox" checked={f.free_shipping} onChange={(e) => setF((p) => ({ ...p, free_shipping: e.target.checked }))} />
            Delivery included
          </label>
        </div>
      </Section>

      <Section title="Tracking">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Link name" hint="Their link becomes zyvorah.com/c/this-name. Blank makes one from the handle."><input className={input} value={f.slug} onChange={set("slug")} /></Field>
          <Field label="Link opens" hint="A page on zyvorah.com, such as /collections/kids-room."><input className={input} value={f.landing_path} onChange={set("landing_path")} /></Field>
          <div className="sm:col-span-2"><Field label="Hashtags"><input className={input} value={f.hashtags} onChange={set("hashtags")} placeholder="#ZyvorahWalls #ZyvorahxPriya" /></Field></div>
        </div>
      </Section>

      <Section title="Deliverables">
        <div className="space-y-3">
          {dels.map((d, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_10rem_auto]">
              <select className={input} value={d.kind} onChange={(e) => setDels((p) => p.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>
                {KINDS.map((k) => <option key={k} value={k}>{deliverableLabel(k)}</option>)}
              </select>
              <input className={input} value={d.description} placeholder="What it shows" onChange={(e) => setDels((p) => p.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <input className={input} type="date" value={d.due_on} onChange={(e) => setDels((p) => p.map((x, j) => (j === i ? { ...x, due_on: e.target.value } : x)))} />
              <button type="button" onClick={() => setDels((p) => p.filter((_, j) => j !== i))} className="min-h-10 px-2 text-sm text-slate underline underline-offset-2">Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setDels((p) => [...p, { kind: "story", description: "", due_on: "" }])} className="min-h-10 text-sm text-slate underline underline-offset-2">
            Add a deliverable
          </button>
        </div>
      </Section>

      <Section title="Notes">
        <textarea className={area} rows={3} value={f.notes} onChange={set("notes")} placeholder="Anything agreed that is not above." />
      </Section>

      {error && <p role="alert" className="text-sm text-[#A3211E]">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy} onClick={save} className="btn h-11 px-6 text-[0.8rem] disabled:opacity-40">{busy ? "Saving…" : "Create collaboration"}</button>
        <button type="button" onClick={onCancel} className="btn btn-ghost h-11 px-6 text-[0.8rem]">Cancel</button>
      </div>
    </div>
  );
}

// ---- One collaboration --------------------------------------------------

function DeliverableRow({ d, today, onSaved }: { d: Deliverable; today: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    status: d.status,
    url: d.url ?? "",
    due_on: d.due_on ?? "",
    description: d.description ?? "",
    views: d.views?.toString() ?? "",
    reach: d.reach?.toString() ?? "",
    likes: d.likes?.toString() ?? "",
    comments: d.comments?.toString() ?? "",
    saves: d.saves?.toString() ?? "",
    shares: d.shares?.toString() ?? "",
    note: d.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overdue = isOverdue(d, today);
  const metricsChanged = (["views", "reach", "likes", "comments", "saves", "shares"] as const).some((k) => f[k] !== (d[k]?.toString() ?? ""));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { id: d.id, status: f.status, url: f.url, due_on: f.due_on || null, description: f.description, note: f.note };
      if (metricsChanged) for (const k of ["views", "reach", "likes", "comments", "saves", "shares"] as const) body[k] = f[k];
      await api("/api/admin/collabs/deliverables", { method: "PATCH", body: JSON.stringify(body) });
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm("Remove this deliverable?")) return;
    await api("/api/admin/collabs/deliverables", { method: "DELETE", body: JSON.stringify({ id: d.id }) }).catch(() => {});
    onSaved();
  };

  return (
    <li className="border-b border-edge py-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 text-left">
        <span className="font-medium text-charcoal">{deliverableLabel(d.kind)}</span>
        <span className="text-sm text-slate">{d.description}</span>
        <span className="ml-auto text-xs" style={{ color: overdue ? "#A3211E" : d.status === "pending" ? "#6B6B6B" : ACCENT }}>
          {overdue ? `Overdue since ${day(d.due_on)}` : d.status === "pending" ? (d.due_on ? `Due ${day(d.due_on)}` : "Pending") : `${DELIVERABLE_STATUS[d.status]}${d.posted_at ? ` ${day(d.posted_at)}` : ""}`}
        </span>
      </button>
      {!open && (d.url || d.views != null) && (
        <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-mist">
          {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">Open post</a>}
          {d.views != null && <span>{num(d.views)} views</span>}
          {d.reach != null && <span>{num(d.reach)} reach</span>}
          {d.likes != null && <span>{num(d.likes)} likes</span>}
          {d.saves != null && <span>{num(d.saves)} saves</span>}
          {d.shares != null && <span>{num(d.shares)} shares</span>}
          {d.comments != null && <span>{num(d.comments)} comments</span>}
          {d.metrics_at && <span>as of {day(d.metrics_at)}</span>}
        </p>
      )}
      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Status">
              <select className={input} value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))}>
                {Object.entries(DELIVERABLE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Due"><input className={input} type="date" value={f.due_on} onChange={(e) => setF((p) => ({ ...p, due_on: e.target.value }))} /></Field>
            <Field label="Link to the post" hint="Pasting it marks the piece posted."><input className={input} value={f.url} onChange={(e) => setF((p) => ({ ...p, url: e.target.value, status: p.status === "pending" && e.target.value ? "posted" : p.status }))} /></Field>
          </div>
          <Field label="What it shows"><input className={input} value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} /></Field>
          <div>
            <p className="text-xs text-slate">Insights, from the screenshot the creator sends</p>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-6">
              {(["views", "reach", "likes", "comments", "saves", "shares"] as const).map((k) => (
                <input key={k} className={input} inputMode="numeric" placeholder={k[0].toUpperCase() + k.slice(1)} aria-label={k} value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />
              ))}
            </div>
          </div>
          <Field label="Note"><input className={input} value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} /></Field>
          {error && <p role="alert" className="text-sm text-[#A3211E]">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={save} className="btn h-10 px-5 text-xs disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost h-10 px-5 text-xs">Close</button>
            <button type="button" onClick={remove} className="ml-auto min-h-10 text-xs text-slate underline underline-offset-2">Remove</button>
          </div>
        </div>
      )}
    </li>
  );
}

function Detail({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<{ collaboration: Collab; deliverables: Deliverable[]; report: Report; order: Order; designTitles: Record<string, string>; pitch: { reference: string } | null } | null>(null);
  const [days, setDays] = useState(90);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string | boolean> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newDel, setNewDel] = useState({ kind: "story", description: "", due_on: "" });
  const today = istDateKey();

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/admin/collabs?id=${id}&days=${days}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [id, days]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <p role="alert" className="text-sm text-[#A3211E]">{error}</p>;
  if (!data) return <p className="text-sm text-slate">Loading…</p>;
  const c = data.collaboration;
  const r = data.report;
  const link = `https://zyvorah.com${trackingPath(c.slug)}`;
  const tags = (c.hashtags ?? []).map((h) => `#${h}`).join(" ");

  const startEdit = () =>
    setEdit({
      name: c.name, email: c.email, instagram: c.instagram ?? "", phone: c.phone ?? "", city: c.city ?? "",
      followers: c.followers?.toString() ?? "", audience_note: c.audience_note ?? "",
      discount_pct: String(c.discount_pct), max_value_inr: c.max_value_inr?.toString() ?? "",
      allowed_handles: (c.allowed_handles ?? []).join(", "), free_shipping: c.free_shipping,
      code_expires_at: c.code_expires_at?.slice(0, 10) ?? "", code: c.code, slug: c.slug,
      landing_path: c.landing_path, hashtags: tags, notes: c.notes ?? "",
    });

  const patch = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    setNotice(null);
    try {
      await api("/api/admin/collabs", { method: "PATCH", body: JSON.stringify({ id: c.id, ...body }) });
      await load();
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const sendBrief = async () => {
    if (!confirm(`Email the brief to ${c.name} <${c.email}>, from Team Zyvorah with you copied? Outside 9 am to 7 pm, or on a Sunday, it waits for the next working morning.`)) return;
    setBusy("brief");
    setNotice(null);
    try {
      const res = await api<{ scheduledAt: string | null }>("/api/admin/collabs/brief", { method: "POST", body: JSON.stringify({ id: c.id }) });
      setNotice(res.scheduledAt ? `Brief scheduled for ${new Date(res.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} IST.` : "Brief sent.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setBusy(null);
    }
  };

  const addDeliverable = async () => {
    setBusy("deliverable");
    try {
      await api("/api/admin/collabs/deliverables", { method: "POST", body: JSON.stringify({ collaboration_id: c.id, kind: newDel.kind, description: newDel.description, due_on: newDel.due_on || null }) });
      setNewDel({ kind: "story", description: "", due_on: "" });
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not add.");
    } finally {
      setBusy(null);
    }
  };

  const o = r?.outcomes;
  const funnel: [string, number | undefined][] = [
    ["Link clicks", r?.clicks.total],
    ["Visits", r?.sessions.total],
    ["Design views", o?.views],
    ["Walls configured", o?.configurations],
    ["Added to cart", o?.cart_adds],
    ["Checkouts", o?.checkouts],
    ["Paid orders", o?.paid_orders],
  ];
  const totals = data.deliverables.reduce(
    (a, d) => ({ views: a.views + (d.views ?? 0), saves: a.saves + (d.saves ?? 0), shares: a.shares + (d.shares ?? 0) }),
    { views: 0, saves: 0, shares: 0 },
  );
  const giftValue = data.order ? Number(data.order.discount) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="min-h-10 text-sm text-slate underline underline-offset-2">All collaborations</button>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-charcoal">{c.name}</h1>
          <p className="mt-1 text-sm text-slate">
            {c.instagram && <a href={`https://instagram.com/${c.instagram}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">@{c.instagram}</a>}
            {c.instagram && " · "}{c.email}{c.phone ? ` · ${c.phone}` : ""}{c.city ? ` · ${c.city}` : ""}{c.followers ? ` · ${num(c.followers)} followers` : ""}
          </p>
          {data.pitch && <p className="mt-1 text-xs text-mist">From pitch {data.pitch.reference}</p>}
        </div>
        <select
          aria-label="Status"
          className="h-10 rounded-full border border-edge bg-surface px-4 text-sm"
          value={c.status}
          disabled={!!busy}
          onChange={(e) => void patch({ status: e.target.value }, "status")}
        >
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {notice && <p role="status" className="text-sm text-slate">{notice}</p>}

      <Section title="The gift" aside={<span className="text-xs text-mist">{c.redeemed_at ? `Used ${day(c.redeemed_at)}` : "Not used yet"}</span>}>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate">Code</dt><dd className="mt-1 flex items-center gap-2"><span className="font-mono font-semibold text-charcoal">{c.code}</span><Copy text={c.code} /></dd></div>
          <div><dt className="text-xs text-slate">Offer</dt><dd className="mt-1 text-charcoal">{offerLine(c)}</dd></div>
          <div><dt className="text-xs text-slate">Designs</dt><dd className="mt-1 text-charcoal">{c.allowed_handles?.length ? c.allowed_handles.map((h) => data.designTitles[h] ?? h).join(", ") : "Any design"}</dd></div>
          <div><dt className="text-xs text-slate">Order by</dt><dd className="mt-1 text-charcoal">{c.code_expires_at ? day(c.code_expires_at) : "No deadline"}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate">Order</dt>
            <dd className="mt-1 text-charcoal">
              {data.order ? (
                <>
                  {data.order.zvy ?? `#${data.order.order_number}`} · wall {inr(data.order.subtotal)} · gifted {inr(giftValue)} · paid {inr(data.order.total)} · {data.order.status}
                  {data.order.access_token && (
                    <> · <Link href={`/order/${data.order.access_token}`} className="underline underline-offset-2">open</Link></>
                  )}
                </>
              ) : (
                "Not ordered yet. The creator orders on the site with the code."
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={!!busy} onClick={sendBrief} className="btn h-10 px-5 text-xs disabled:opacity-40">{busy === "brief" ? "Sending…" : "Email the brief"}</button>
          <Copy text={`https://zyvorah.com/r/${c.code}`} label="Copy code link" />
          {!edit && <button type="button" onClick={startEdit} className="btn btn-ghost h-10 px-5 text-xs">Edit details</button>}
        </div>
      </Section>

      {edit && (
        <Section title="Edit details">
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["name", "Name"], ["email", "Email"], ["instagram", "Instagram"], ["phone", "Phone"], ["city", "City"], ["followers", "Followers"],
              ["discount_pct", "Discount (%)"], ["max_value_inr", "Up to (₹)"], ["code", "Code"], ["code_expires_at", "Order by"],
              ["slug", "Link name"], ["landing_path", "Link opens"],
            ] as const).map(([k, label]) => (
              <Field key={k} label={label}>
                <input className={input} type={k === "code_expires_at" ? "date" : "text"} value={String(edit[k] ?? "")} onChange={(e) => setEdit((p) => ({ ...p!, [k]: e.target.value }))} />
              </Field>
            ))}
            <div className="sm:col-span-2"><Field label="Only for these designs"><input className={input} value={String(edit.allowed_handles)} onChange={(e) => setEdit((p) => ({ ...p!, allowed_handles: e.target.value }))} /></Field></div>
            <div className="sm:col-span-2"><Field label="Hashtags"><input className={input} value={String(edit.hashtags)} onChange={(e) => setEdit((p) => ({ ...p!, hashtags: e.target.value }))} /></Field></div>
            <div className="sm:col-span-2"><Field label="Audience"><input className={input} value={String(edit.audience_note)} onChange={(e) => setEdit((p) => ({ ...p!, audience_note: e.target.value }))} placeholder="Who follows them, where" /></Field></div>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={!!edit.free_shipping} onChange={(e) => setEdit((p) => ({ ...p!, free_shipping: e.target.checked }))} />Delivery included</label>
            <div className="sm:col-span-2"><Field label="Notes"><textarea className={area} rows={4} value={String(edit.notes)} onChange={(e) => setEdit((p) => ({ ...p!, notes: e.target.value }))} /></Field></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!!busy}
              onClick={async () => {
                // Send only what changed: a redeemed code refuses offer edits.
                const before: Record<string, unknown> = {
                  name: c.name, email: c.email, instagram: c.instagram ?? "", phone: c.phone ?? "", city: c.city ?? "",
                  followers: c.followers?.toString() ?? "", audience_note: c.audience_note ?? "", discount_pct: String(c.discount_pct),
                  max_value_inr: c.max_value_inr?.toString() ?? "", allowed_handles: (c.allowed_handles ?? []).join(", "),
                  free_shipping: c.free_shipping, code_expires_at: c.code_expires_at?.slice(0, 10) ?? "", code: c.code, slug: c.slug,
                  landing_path: c.landing_path, hashtags: tags, notes: c.notes ?? "",
                };
                const changed = Object.fromEntries(Object.entries(edit).filter(([k, v]) => v !== before[k]));
                if (await patch(changed, "edit")) setEdit(null);
              }}
              className="btn h-10 px-5 text-xs disabled:opacity-40"
            >
              {busy === "edit" ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => setEdit(null)} className="btn btn-ghost h-10 px-5 text-xs">Cancel</button>
          </div>
        </Section>
      )}

      <Section title="Link and hashtags">
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all text-charcoal">{link}</span>
            <Copy text={link} />
          </div>
          <p className="text-xs text-mist">
            Opens {c.landing_path}. For a reel about one design, add ?to=/products/&lt;handle&gt; to the link. Every visit is counted with its town and source.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-charcoal">{tags || "No hashtags yet"}</span>
            {tags && <Copy text={tags} />}
          </div>
        </div>
      </Section>

      <Section
        title="Deliverables"
        aside={
          data.deliverables.length ? (
            <span className="text-xs text-mist">
              {data.deliverables.filter((d) => d.status === "posted" || d.status === "verified").length} of {data.deliverables.length} up
              {totals.views ? ` · ${num(totals.views)} views` : ""}{totals.saves ? ` · ${num(totals.saves)} saves` : ""}{totals.shares ? ` · ${num(totals.shares)} shares` : ""}
            </span>
          ) : null
        }
      >
        <ul>
          {data.deliverables.map((d) => <DeliverableRow key={d.id} d={d} today={today} onSaved={load} />)}
        </ul>
        <div className="mt-4 grid gap-2 sm:grid-cols-[10rem_1fr_10rem_auto]">
          <select className={input} value={newDel.kind} onChange={(e) => setNewDel((p) => ({ ...p, kind: e.target.value }))}>
            {KINDS.map((k) => <option key={k} value={k}>{deliverableLabel(k)}</option>)}
          </select>
          <input className={input} placeholder="What it shows" value={newDel.description} onChange={(e) => setNewDel((p) => ({ ...p, description: e.target.value }))} />
          <input className={input} type="date" value={newDel.due_on} onChange={(e) => setNewDel((p) => ({ ...p, due_on: e.target.value }))} />
          <button type="button" disabled={!!busy} onClick={addDeliverable} className="btn btn-ghost h-10 px-4 text-xs disabled:opacity-40">Add</button>
        </div>
      </Section>

      <Section
        title="What it brought"
        aside={
          <select aria-label="Period" className="h-10 rounded-full border border-edge bg-surface px-3 text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        }
      >
        {!r ? (
          <p className="text-sm text-mist">No report yet.</p>
        ) : (
          <div className="space-y-8">
            <table className="w-full max-w-md text-sm">
              <tbody>
                {funnel.map(([label, n]) => (
                  <tr key={label} className="border-b border-edge">
                    <td className="py-2 text-slate">{label}</td>
                    <td className="py-2 text-right tabular-nums text-charcoal">{(n ?? 0).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 text-slate">Sales value</td>
                  <td className="py-2 text-right tabular-nums text-charcoal">{inr(o?.paid_value_inr ?? 0)}</td>
                </tr>
              </tbody>
            </table>
            <div className="grid gap-8 md:grid-cols-2">
              <div><h3 className="mb-3 text-xs text-slate">Clicks by town</h3><Bars rows={r.clicks.by_city} empty="No clicks yet." /></div>
              <div><h3 className="mb-3 text-xs text-slate">Clicks by country</h3><Bars rows={r.clicks.by_country} empty="No clicks yet." /></div>
              <div><h3 className="mb-3 text-xs text-slate">Where clicks came from</h3><Bars rows={r.clicks.by_referrer} empty="No clicks yet." /></div>
              <div><h3 className="mb-3 text-xs text-slate">Clicks by day</h3><Bars rows={r.clicks.by_day.map((d) => ({ key: day(d.day), n: d.n }))} empty="No clicks yet." /></div>
              <div>
                <h3 className="mb-3 text-xs text-slate">Designs their audience looked at</h3>
                <Bars rows={r.top_designs.map((t) => ({ key: t.handle, n: t.n }))} empty="None yet." />
              </div>
            </div>
            <p className="text-xs text-mist">
              Clicks are counted when the link opens. Visits and everything after them follow the same visitor through the site for up to a year, so a sale weeks later still counts. Towns are approximate, as the network reports them.
            </p>
          </div>
        )}
      </Section>

      {c.notes && !edit && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap text-sm text-slate">{c.notes}</p>
        </Section>
      )}
    </div>
  );
}

// ---- The list -----------------------------------------------------------

export default function CollabsPage() {
  const staff = useStaff();
  const [rows, setRows] = useState<Collab[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<{ kind: "list" } | { kind: "new"; prefill: Partial<Collab> & { inquiry_id?: string | null } } | { kind: "one"; id: string }>({ kind: "list" });
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [today] = useState(() => istDateKey());
  const [weekAhead] = useState(() => istDateKey(new Date(new Date().getTime() + 7 * 86400_000)));

  const go = useCallback((next: typeof view) => {
    setView(next);
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    url.searchParams.delete("inquiry");
    url.searchParams.delete("new");
    if (next.kind === "one") url.searchParams.set("id", next.id);
    if (next.kind === "new") url.searchParams.set("new", "1");
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api<{ collaborations: Collab[] }>("/api/admin/collabs");
      setRows(data.collaborations);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    if (staff !== "in") return;
    void load();
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const inquiry = params.get("inquiry");
    if (id) setView({ kind: "one", id });
    else if (inquiry) {
      api<{ prefill: Partial<Collab> & { inquiry_id: string } }>(`/api/admin/collabs?inquiry=${encodeURIComponent(inquiry)}`)
        .then(({ prefill }) => setView({ kind: "new", prefill }))
        .catch((e) => setError(e instanceof Error ? e.message : "Could not open that pitch."));
    } else if (params.get("new")) setView({ kind: "new", prefill: {} });
  }, [staff, load]);

  const shown = useMemo(
    () => (rows ?? []).filter((r) => filter === "all" || !["complete", "cancelled"].includes(r.status)),
    [rows, filter],
  );
  const summary = useMemo(() => {
    const all = rows ?? [];
    const dels = all.flatMap((r) => r.deliverables ?? []);
    return {
      active: all.filter((r) => !["complete", "cancelled"].includes(r.status)).length,
      overdue: dels.filter((d) => isOverdue(d, today)).length,
      dueSoon: dels.filter((d) => d.status === "pending" && d.due_on && d.due_on >= today && d.due_on <= weekAhead).length,
      clicks: all.reduce((s, r) => s + (r.clicks ?? 0), 0),
      gifted: all.reduce((s, r) => s + (r.order ? Number(r.order.discount) : 0), 0),
    };
  }, [rows, today, weekAhead]);

  if (staff !== "in") return <StaffGate state={staff} title="Creator collaborations" />;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {error && <p role="alert" className="mb-4 text-sm text-[#A3211E]">{error}</p>}
      {view.kind === "new" ? (
        <NewCollab
          prefill={view.prefill}
          onCancel={() => go({ kind: "list" })}
          onCreated={(id) => {
            void load();
            go({ kind: "one", id });
          }}
        />
      ) : view.kind === "one" ? (
        <Detail id={view.id} onBack={() => { void load(); go({ kind: "list" }); }} />
      ) : (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-charcoal">Creator collaborations</h1>
              <p className="mt-1 text-sm text-slate">Creators we gift a wall to, what they owe back, and what their audience did.</p>
            </div>
            <button type="button" onClick={() => go({ kind: "new", prefill: {} })} className="btn h-11 px-6 text-[0.8rem]">New collaboration</button>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-5">
            {([
              ["Active", summary.active.toLocaleString("en-IN")],
              ["Deliverables overdue", summary.overdue.toLocaleString("en-IN")],
              ["Due this week", summary.dueSoon.toLocaleString("en-IN")],
              ["Link clicks, 12 months", summary.clicks.toLocaleString("en-IN")],
              ["Walls gifted", inr(summary.gifted)],
            ] as const).map(([label, value]) => (
              <div key={label} className="border-t border-edge py-3">
                <dt className="text-xs text-slate">{label}</dt>
                <dd className="mt-1 text-lg tabular-nums" style={{ color: label === "Deliverables overdue" && summary.overdue ? "#A3211E" : "#2D2D2D" }}>{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex gap-2">
            {(["active", "all"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`min-h-10 rounded-full border px-4 text-xs ${filter === k ? "border-charcoal text-charcoal" : "border-edge text-slate"}`}
              >
                {k === "active" ? "In progress" : "All"}
              </button>
            ))}
            <Link href="/admin/marketing?tab=collabs" className="ml-auto inline-flex min-h-10 items-center text-xs text-slate underline underline-offset-2">Pitches waiting →</Link>
          </div>

          {!rows ? (
            <p className="text-sm text-slate">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-slate">No collaborations yet. Start one here, or from an approved pitch on the Collabs tab.</p>
          ) : (
            <ul className="border-b border-edge">
              {shown.map((r) => {
                const dels = r.deliverables ?? [];
                const up = dels.filter((d) => d.status === "posted" || d.status === "verified").length;
                const overdue = dels.filter((d) => isOverdue(d, today)).length;
                return (
                  <li key={r.id} className="border-t border-edge">
                    <button type="button" onClick={() => go({ kind: "one", id: r.id })} className="grid w-full gap-1 py-4 text-left sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-baseline sm:gap-4">
                      <span>
                        <span className="font-medium text-charcoal">{r.name}</span>
                        {r.instagram && <span className="ml-2 text-sm text-slate">@{r.instagram}</span>}
                      </span>
                      <span className="text-sm text-slate">{offerLine(r)}</span>
                      <span className="text-sm text-slate">
                        {dels.length ? `${up} of ${dels.length} delivered` : "No deliverables"}
                        {overdue ? <span className="text-[#A3211E]"> · {overdue} overdue</span> : null}
                        {` · ${(r.clicks ?? 0).toLocaleString("en-IN")} clicks`}
                      </span>
                      <span className="text-xs sm:text-right" style={{ color: ACCENT }}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
