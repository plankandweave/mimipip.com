"use client";

import { useCallback, useEffect, useState } from "react";

// Handing the work to whoever is actually going to walk the building.
//
// This is the delegation story in one screen: an admin types a colleague's name
// and mobile number, and that colleague can then sign in with it. No invitation
// to accept, no password to set, no email that might go to a company inbox they
// do not have — they get a code on the handset they are already holding.
//
// The screen says what adding somebody DOES, in full, before they do it. An
// access control whose consequences are unstated is one people either avoid or
// use carelessly, and both are worse than a sentence.

type Member = {
  id: string;
  name: string | null;
  role: "admin" | "member";
  phone: string | null;
  phoneLabel: string;
  isYou: boolean;
};

export default function TeamPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const fetchTeam = useCallback(async () => {
    const r = await fetch("/api/corporate/team", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "Could not load who has access.");
    return { members: (j.members ?? []) as Member[], manage: Boolean(j.can?.manage) };
  }, []);

  const reload = useCallback(async () => {
    try {
      const { members, manage } = await fetchTeam();
      setMembers(members); setCanManage(manage); setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load who has access.");
    }
  }, [fetchTeam]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { members, manage } = await fetchTeam();
        if (alive) { setMembers(members); setCanManage(manage); setErr(null); }
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Could not load who has access.");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [fetchTeam]);

  async function revoke(m: Member) {
    if (!window.confirm(`Remove ${m.name ?? "this person"}'s access?`)) return;
    setErr(null);
    try {
      const r = await fetch("/api/corporate/team", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", id: m.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not remove that access.");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove that access.");
    }
  }

  if (loading) return <p className="mt-6 text-sm text-slate">Loading…</p>;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[54ch] text-sm text-slate">
          Anyone here can sign in with their mobile number and capture walls.
          They cannot place orders or change your rates — adding someone is
          giving them the phone, not the chequebook.
        </p>
        {canManage && !adding && (
          <button onClick={() => setAdding(true)} className="btn h-10 px-4 text-[0.8rem]">
            Give someone access
          </button>
        )}
      </div>

      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

      {adding && (
        <AddMember onDone={async () => { setAdding(false); await reload(); }}
          onCancel={() => setAdding(false)} />
      )}

      <ul className="mt-5 space-y-1.5">
        {members.map((m) => (
          <li key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-wash px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {m.name ?? "Unnamed"}
                {m.isYou && <span className="ml-2 text-xs text-slate">you</span>}
                {m.role === "admin" && <span className="ml-2 text-xs text-slate">admin</span>}
              </p>
              <p className="mt-0.5 text-xs text-slate">
                {m.phoneLabel ? `+91 ${m.phoneLabel}` : "Signs in by email"}
              </p>
            </div>
            {canManage && !m.isYou && (
              <button onClick={() => void revoke(m)} className="text-xs text-slate underline">
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {members.length === 0 && (
        <p className="mt-4 text-sm text-slate">Nobody has been added yet.</p>
      )}
    </div>
  );
}

function AddMember({
  onDone, onCancel,
}: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/corporate/team", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not give them access.");
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not give them access.");
    } finally { setBusy(false); }
  }

  const field = "w-full rounded-[12px] border border-edge bg-wash px-4 py-2.5 text-sm outline-none focus:border-charcoal";

  return (
    <form onSubmit={save} className="mt-5 rounded-[18px] border border-edge bg-surface p-5">
      <p className="font-display text-sm font-bold">Give someone access</p>
      {/* What happens next, said before they do it — so nobody has to go and
          find out whether the person was notified. */}
      <p className="mt-1 max-w-[52ch] text-xs text-slate">
        They will be able to sign in straight away with this number. Nothing is
        sent to them automatically — tell them the link yourself, and they will
        get a code by text when they open it.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-slate">Their name</span>
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Priyanka Singh" className={`mt-1 ${field}`} />
        </label>
        <label className="block">
          <span className="text-xs text-slate">Their mobile</span>
          <div className="mt-1 flex items-stretch gap-2">
            <span className="flex items-center rounded-[12px] border border-edge bg-wash px-3 text-sm text-slate">+91</span>
            <input required type="tel" inputMode="numeric" maxLength={10} value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="98765 43210" className={field} />
          </div>
        </label>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy || !name.trim() || phone.length !== 10}
          className="btn h-10 px-5 text-[0.8rem] disabled:opacity-50">
          {busy ? "Saving…" : "Give access"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-[10px] border border-edge px-4 py-2 text-xs">Cancel</button>
      </div>
    </form>
  );
}
