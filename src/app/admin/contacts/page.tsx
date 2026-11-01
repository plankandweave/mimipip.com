"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminRpc } from "@/lib/admin-rpc";
import { StaffGate, useStaff } from "@/lib/use-staff";

// The trade contact book: architects and interior designers Zyvorah writes to.
// This is the recipient list for the trade letter (WhatsApp first, email
// second, Tuesdays) — an audience, not the customer table and not the CRM.
//
// Three ways in, because contacts arrive three ways: a spreadsheet after a
// show (upload), a handful of business cards (paste), one person from a call
// (the form). Every path lands in admin_trade_contacts_upsert, which matches
// on mobile then email and never overwrites a field already filled by hand.
//
// Same gate as every admin screen: the Google sign-in on the door, and an RPC
// that still checks the database key on the server side.
// Migration: 20260920053735_trade_contacts.

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  kind: "architect" | "designer" | "client" | "other";
  firm: string | null;
  designation: string | null;
  city: string | null;
  website: string | null;
  mobile: string | null;
  email: string | null;
  source: string | null;
  notes: string | null;
  whatsapp_opt_out_at: string | null;
  email_unsubscribed_at: string | null;
  email_bounced_at: string | null;
  created_at: string;
};
type Counts = { total: number; mobiles: number; emails: number; sources: Record<string, number> };
type Book = { counts: Counts; contacts: Contact[] };
type UpsertResult = { inserted: number; updated: number; skipped: { row: number; reason: string; mobile?: string; email?: string }[] };

const KINDS = ["architect", "designer", "client", "other"] as const;
const KIND_LABEL: Record<string, string> = { architect: "Architect", designer: "Designer", client: "Client", other: "Other" };

const fullName = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(" ");

export default function TradeContactsPage() {
  const staff = useStaff();
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [q, setQ] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [panel, setPanel] = useState<"none" | "add" | "upload" | "paste">("none");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [lastResult, setLastResult] = useState<UpsertResult | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await adminRpc("admin_trade_contacts_list");
    if (e || data == null) {
      setError(e && e.message !== "unauthorized" ? e.message : "You're not signed in.");
      setBook(null);
      return;
    }
    setError(null);
    setBook(data as Book);
  }, []);

  useEffect(() => {
    if (staff === "in") void load();
  }, [staff, load]);

  const sources = useMemo(() => Object.keys(book?.counts.sources ?? {}).sort(), [book]);

  const visible = useMemo(() => {
    const list = book?.contacts ?? [];
    const needle = q.trim().toLowerCase();
    return list.filter((c) => {
      if (filterKind !== "all" && c.kind !== filterKind) return false;
      if (filterSource !== "all" && (c.source ?? "—") !== filterSource) return false;
      if (!needle) return true;
      return [fullName(c), c.firm, c.city, c.email, c.mobile, c.designation]
        .some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [book, q, filterKind, filterSource]);

  const exportCsv = useCallback(() => {
    const cols = ["first_name", "last_name", "kind", "firm", "designation", "city", "mobile", "email", "source", "notes"] as const;
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.join(","), ...visible.map((c) => cols.map((k) => esc(c[k])).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zyvorah-trade-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [visible]);

  const remove = useCallback(async (c: Contact) => {
    if (!window.confirm(`Remove ${fullName(c)} from the trade book?`)) return;
    const { error: e } = await adminRpc("admin_trade_contact_delete", { p_id: c.id });
    if (e) { setError(e.message); return; }
    setEditing(null);
    void load();
  }, [load]);

  if (staff !== "in") return <StaffGate state={staff} title="Trade contacts" />;

  const counts = book?.counts;

  return (
    <div className="container-x py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Trade contacts</h1>
          <p className="mt-1 text-xs text-slate">
            Architects &amp; designers who receive the trade letter.{" "}
            {counts
              ? `${counts.total} people · ${counts.mobiles} on WhatsApp · ${counts.emails} on email`
              : error ? "Not loaded." : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setPanel(panel === "upload" ? "none" : "upload")} className={`btn h-9 px-4 text-[0.72rem] ${panel === "upload" ? "" : "btn-ghost"}`}>
            Upload a sheet
          </button>
          <button onClick={() => setPanel(panel === "paste" ? "none" : "paste")} className={`btn h-9 px-4 text-[0.72rem] ${panel === "paste" ? "" : "btn-ghost"}`}>
            Paste rows
          </button>
          <button onClick={() => setPanel(panel === "add" ? "none" : "add")} className={`btn h-9 px-4 text-[0.72rem] ${panel === "add" ? "" : "btn-ghost"}`}>
            Add one
          </button>
          <button onClick={exportCsv} className="text-xs text-slate underline underline-offset-2">Export CSV</button>
          <button onClick={() => load()} className="text-xs text-slate underline underline-offset-2">Refresh</button>
        </div>
      </div>

      {error && <p className="mt-4 text-xs text-charcoal/80">{error}</p>}

      {panel === "upload" && (
        <UploadPanel sources={sources} onDone={(r) => { setLastResult(r); void load(); }} />
      )}
      {panel === "paste" && (
        <PastePanel sources={sources} onDone={(r) => { setLastResult(r); void load(); }} />
      )}
      {panel === "add" && (
        <AddOnePanel sources={sources} onDone={(r) => { setLastResult(r); void load(); setPanel("none"); }} />
      )}

      {lastResult && (
        <div className="mt-4 rounded-[14px] bg-wash px-4 py-3 text-xs">
          <p>
            <span className="font-semibold">{lastResult.inserted} added</span> · {lastResult.updated} already here (blank details filled in)
            {lastResult.skipped.length > 0 && <> · <span className="font-semibold">{lastResult.skipped.length} skipped</span></>}
          </p>
          {lastResult.skipped.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-slate">
              {lastResult.skipped.slice(0, 20).map((s) => (
                <li key={s.row}>Row {s.row}: {s.reason}{s.email ? ` — "${s.email}"` : ""}{s.mobile ? ` — "${s.mobile}"` : ""}</li>
              ))}
              {lastResult.skipped.length > 20 && <li>…and {lastResult.skipped.length - 20} more</li>}
            </ul>
          )}
          <button onClick={() => setLastResult(null)} className="mt-2 underline">Dismiss</button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, firm, city, email, mobile"
          className="h-10 w-[min(360px,100%)] rounded-[12px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal"
        />
        <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} className="h-10 rounded-[12px] border border-edge bg-surface px-3 text-sm">
          <option value="all">All kinds</option>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="h-10 rounded-[12px] border border-edge bg-surface px-3 text-sm">
          <option value="all">All sources</option>
          {sources.map((s) => <option key={s} value={s}>{s} ({counts?.sources[s]})</option>)}
        </select>
        <span className="text-xs text-slate">{visible.length} shown</span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-[14px] border border-edge">
        <table className="w-full text-left text-sm">
          <thead className="bg-wash text-xs text-slate">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Firm</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">WhatsApp</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} onClick={() => setEditing(c)} className="cursor-pointer border-t border-edge hover:bg-wash/60">
                <td className="px-3 py-2">
                  <span className="font-medium">{fullName(c)}</span>
                  {c.designation && <span className="block text-xs text-slate">{c.designation}</span>}
                </td>
                <td className="px-3 py-2">{c.firm ?? <span className="text-slate">—</span>}</td>
                <td className="px-3 py-2 text-xs">{KIND_LABEL[c.kind]}</td>
                <td className="px-3 py-2 text-xs">{c.city ?? "—"}</td>
                <td className="px-3 py-2 text-xs tabular-nums">
                  {c.mobile ? (c.whatsapp_opt_out_at ? <s className="text-slate">{c.mobile}</s> : c.mobile) : <span className="text-slate">—</span>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {c.email ? (c.email_unsubscribed_at || c.email_bounced_at ? <s className="text-slate">{c.email}</s> : c.email) : <span className="text-slate">—</span>}
                </td>
                <td className="px-3 py-2 text-xs text-slate">{c.source ?? "—"}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-slate">{book ? "No one matches." : "Loading…"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditDrawer
          contact={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
          onDelete={() => remove(editing)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

const field = "h-10 w-full rounded-[12px] border border-edge bg-surface px-3 text-sm outline-none focus:border-charcoal";

function SourceInput({ value, onChange, sources }: { value: string; onChange: (v: string) => void; sources: string[] }) {
  return (
    <div>
      <input list="trade-sources" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Where did you meet them? e.g. Design Mumbai 2026" className={field} />
      <datalist id="trade-sources">{sources.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

function UploadPanel({ sources, onDone }: { sources: string[]; onDone: (r: UpsertResult) => void }) {
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr("Choose a .xlsx or .csv first."); return; }
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("source", source);
    const res = await fetch("/api/admin/trade-contacts", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(json.detail ?? json.error ?? "Upload failed."); return; }
    if (fileRef.current) fileRef.current.value = "";
    onDone(json.result as UpsertResult);
  };

  return (
    <section className="mt-4 rounded-[18px] bg-wash p-4">
      <p className="text-sm font-semibold">Upload a spreadsheet</p>
      <p className="mt-1 text-xs text-slate">
        Any .xlsx or .csv. Columns are matched by their headers — name (or first/last), mobile, email, company, designation, city — in any order.
        People already in the book are updated, never duplicated. Rows without a mobile or a valid email are listed back, not lost silently.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="text-sm" />
        <SourceInput value={source} onChange={setSource} sources={sources} />
        <button onClick={submit} disabled={busy} className="btn h-10 px-5 text-[0.75rem]">{busy ? "Importing…" : "Import"}</button>
      </div>
      {err && <p className="mt-2 text-xs text-charcoal/80">{err}</p>}
    </section>
  );
}

function PastePanel({ sources, onDone }: { sources: string[]; onDone: (r: UpsertResult) => void }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    // One person per line: "Name, mobile, email, firm" — commas or tabs, any
    // of the last three optional. Quick enough for a stack of business cards.
    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const parts = line.split(/\t|,/).map((p) => p.trim()).filter(Boolean);
      const name = parts.shift() ?? "";
      const r: Record<string, string> = {};
      const [first, ...rest] = name.replace(/^(ar|id|mr|ms|mrs|dr)\.?\s+/i, "").split(/\s+/);
      r.first_name = first; if (rest.length) r.last_name = rest.join(" ");
      for (const p of parts) {
        if (p.includes("@")) r.email = p;
        else if (/\d{10}/.test(p.replace(/\D/g, ""))) r.mobile = p;
        else if (!r.firm) r.firm = p;
        else r.city = p;
      }
      return r;
    });
    if (rows.length === 0) { setErr("Nothing to import."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await adminRpc("admin_trade_contacts_upsert", { p_rows: rows, p_source: source || null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setText("");
    onDone(data as UpsertResult);
  };

  return (
    <section className="mt-4 rounded-[18px] bg-wash p-4">
      <p className="text-sm font-semibold">Paste rows</p>
      <p className="mt-1 text-xs text-slate">One person per line: <code>Name, mobile, email, firm</code> — commas or tabs; anything after the name is optional.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={"Ar. Ali Baldiwala, 9820087309, ali@baldiwala.com, Baldiwala Edge\nPriya Shah, 98200 12345"} className="mt-3 w-full rounded-[12px] border border-edge bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-charcoal" />
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
        <SourceInput value={source} onChange={setSource} sources={sources} />
        <button onClick={submit} disabled={busy} className="btn h-10 px-5 text-[0.75rem]">{busy ? "Saving…" : "Add them"}</button>
      </div>
      {err && <p className="mt-2 text-xs text-charcoal/80">{err}</p>}
    </section>
  );
}

const EMPTY = { first_name: "", last_name: "", kind: "architect", firm: "", designation: "", city: "", website: "", mobile: "", email: "", source: "", notes: "" };

function AddOnePanel({ sources, onDone }: { sources: string[]; onDone: (r: UpsertResult) => void }) {
  const [f, setF] = useState<Record<string, string>>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    if (!f.first_name.trim()) { setErr("A first name is needed."); return; }
    if (!f.mobile.trim() && !f.email.trim()) { setErr("A mobile or an email is needed."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await adminRpc("admin_trade_contacts_upsert", { p_rows: [f], p_source: null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const r = data as UpsertResult;
    if (r.skipped.length) { setErr(r.skipped[0].reason); return; }
    setF(EMPTY);
    onDone(r);
  };

  return (
    <section className="mt-4 rounded-[18px] bg-wash p-4">
      <p className="text-sm font-semibold">Add one person</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input value={f.first_name} onChange={set("first_name")} placeholder="First name *" className={field} />
        <input value={f.last_name} onChange={set("last_name")} placeholder="Last name" className={field} />
        <select value={f.kind} onChange={set("kind")} className={field}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <input value={f.firm} onChange={set("firm")} placeholder="Firm / studio" className={field} />
        <input value={f.designation} onChange={set("designation")} placeholder="Designation" className={field} />
        <input value={f.city} onChange={set("city")} placeholder="City" className={field} />
        <input value={f.mobile} onChange={set("mobile")} placeholder="Mobile (WhatsApp)" className={field} />
        <input value={f.email} onChange={set("email")} placeholder="Email" className={field} />
        <input value={f.website} onChange={set("website")} placeholder="Website" className={field} />
        <SourceInput value={f.source} onChange={(v) => setF((s) => ({ ...s, source: v }))} sources={sources} />
        <input value={f.notes} onChange={set("notes")} placeholder="Notes" className={`${field} lg:col-span-2`} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={submit} disabled={busy} className="btn h-10 px-5 text-[0.75rem]">{busy ? "Saving…" : "Save"}</button>
        {err && <p className="text-xs text-charcoal/80">{err}</p>}
      </div>
    </section>
  );
}

function EditDrawer({ contact, onClose, onSaved, onDelete }: {
  contact: Contact; onClose: () => void; onSaved: () => void; onDelete: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>({
    first_name: contact.first_name, last_name: contact.last_name ?? "", kind: contact.kind,
    firm: contact.firm ?? "", designation: contact.designation ?? "", city: contact.city ?? "",
    website: contact.website ?? "", mobile: contact.mobile ?? "", email: contact.email ?? "",
    source: contact.source ?? "", notes: contact.notes ?? "",
  });
  const [waOut, setWaOut] = useState(!!contact.whatsapp_opt_out_at);
  const [emOut, setEmOut] = useState(!!contact.email_unsubscribed_at);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    setBusy(true); setErr(null);
    const patch: Record<string, unknown> = { ...f, whatsapp_opt_out: waOut, email_unsubscribed: emOut };
    if (!f.mobile.trim()) patch.mobile = null;
    if (!f.email.trim()) patch.email = null;
    const { error } = await adminRpc("admin_trade_contact_update", { p_id: contact.id, p_patch: patch });
    setBusy(false);
    if (error) {
      setErr(error.message === "bad_mobile" ? "That isn't an Indian mobile number." : error.message === "bad_email" ? "That email doesn't look right." : error.message);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-charcoal/30" onClick={onClose}>
      <aside className="h-full w-[min(440px,100%)] overflow-y-auto bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-lg font-bold">{fullName(contact)}</p>
            <p className="text-xs text-slate">Added {new Date(contact.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
          <button onClick={onClose} className="text-xs text-slate underline">Close</button>
        </div>
        <div className="mt-4 grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={f.first_name} onChange={set("first_name")} placeholder="First name" className={field} />
            <input value={f.last_name} onChange={set("last_name")} placeholder="Last name" className={field} />
          </div>
          <select value={f.kind} onChange={set("kind")} className={field}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
          <input value={f.firm} onChange={set("firm")} placeholder="Firm / studio" className={field} />
          <input value={f.designation} onChange={set("designation")} placeholder="Designation" className={field} />
          <input value={f.city} onChange={set("city")} placeholder="City" className={field} />
          <input value={f.website} onChange={set("website")} placeholder="Website" className={field} />
          <input value={f.mobile} onChange={set("mobile")} placeholder="Mobile (WhatsApp)" className={field} />
          <input value={f.email} onChange={set("email")} placeholder="Email" className={field} />
          <input value={f.source} onChange={set("source")} placeholder="Source" className={field} />
          <textarea value={f.notes} onChange={set("notes")} placeholder="Notes" rows={3} className="w-full rounded-[12px] border border-edge bg-surface px-3 py-2 text-sm outline-none focus:border-charcoal" />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={waOut} onChange={(e) => setWaOut(e.target.checked)} className="h-4 w-4 accent-charcoal" />
            Asked to stop WhatsApp messages
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={emOut} onChange={(e) => setEmOut(e.target.checked)} className="h-4 w-4 accent-charcoal" />
            Unsubscribed from email
          </label>
          {contact.email_bounced_at && <p className="text-xs text-slate">Email bounced on {new Date(contact.email_bounced_at).toLocaleDateString("en-IN")}.</p>}
        </div>
        {err && <p className="mt-3 text-xs text-charcoal/80">{err}</p>}
        <div className="mt-5 flex items-center justify-between">
          <button onClick={save} disabled={busy} className="btn h-10 px-5 text-[0.75rem]">{busy ? "Saving…" : "Save"}</button>
          <button onClick={onDelete} className="text-xs text-slate underline underline-offset-2">Remove from book</button>
        </div>
      </aside>
    </div>
  );
}
