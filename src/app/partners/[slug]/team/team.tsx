"use client";

import Link from "next/link";
import PortalTour from "@/components/partners/portal-tour";
import type { TourIdentity } from "@/lib/partner-tour";
import { useCallback, useEffect, useState } from "react";

/**
 * Who from this company can use the portal, and what each of them may do.
 *
 * Run by the partner's own admins — the point of the page is that adding a
 * colleague stops being a WhatsApp message to us and becomes a thing they do
 * at 9pm without asking anyone. Zyvorah staff can also edit here, so the desk
 * can fix an account without needing a member row on it.
 *
 * Every box is a real switch, admin rows included: since 0126 the permission
 * columns bind admins too, so "admin" means "manages access", not "may spend".
 *
 * Everyone on the account can READ this list. Knowing who can spend the
 * company's money is not a secret inside the company, and it answers "who
 * ordered that?" before anyone has to go digging.
 */

type Member = {
  id: string;
  email: string;
  /** How Zyvorah's emails greet them — without it they get a plain "Hello". */
  name: string | null;
  role: "admin" | "member";
  can_upload: boolean;
  can_build: boolean;
  can_order: boolean;
  /** Copied on every dispatch email for the account's orders. */
  notify_dispatch: boolean;
  invited_by_email: string | null;
  created_at: string;
};

type Perms = { can_upload: boolean; can_build: boolean; can_order: boolean };

const CAPS: { key: keyof Perms; label: string; hint: string }[] = [
  { key: "can_upload", label: "Add designs", hint: "upload artwork into the library" },
  { key: "can_build", label: "Prepare orders", hint: "size and crop a wall, save a draft" },
  { key: "can_order", label: "Place orders", hint: "send the order to Zyvorah — this one spends money" },
];

const when = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default function TeamManager({
  slug, accountName, emailDomain, email, canManage, privateWorkflow = false, tourIdentity, embedded = false,
}: {
  slug: string; accountName: string; emailDomain: string; email: string; canManage: boolean; embedded?: boolean; privateWorkflow?: boolean; tourIdentity?: TourIdentity;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "member">("member");
  const [newPerms, setNewPerms] = useState<Perms>({ can_upload: !privateWorkflow, can_build: true, can_order: false });
  const caps = privateWorkflow ? [
    { key: "can_build" as const, label: "Specify walls", hint: "Create customer options and record decisions" },
    { key: "can_order" as const, label: "Purchasing", hint: "Confirm accepted selections and accept a PO" },
  ] : CAPS;

  const load = useCallback(async () => {
    const r = await fetch("/api/corporate/members", { cache: "no-store" });
    if (r.ok) setMembers(((await r.json()).members ?? []) as Member[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(payload: Record<string, unknown>, key: string) {
    setBusy(key); setErr(null); setNote(null);
    try {
      const r = await fetch("/api/corporate/members", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not save that.");
      await load();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save that.");
      return false;
    } finally { setBusy(null); }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const address = newEmail.trim().toLowerCase();
    if (!address) return;
    const ok = await save({ email: address, name: newName.trim(), role: newRole, ...newPerms }, "new");
    if (ok) {
      setNote(`${address} now has access — we've emailed them a link to sign in.`);
      setNewEmail("");
      setNewName("");
      setNewRole("member");
      setNewPerms({ can_upload: !privateWorkflow, can_build: true, can_order: false });
    }
  }

  return (
    <div className={embedded ? "py-3" : "container-x py-8 sm:py-10"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold leading-tight sm:text-2xl">Team</h1>
          <p className="truncate text-xs text-slate">
            {accountName} · who can use this portal
            {canManage && <span className="ml-1 font-semibold text-charcoal">· you manage access</span>}
          </p>
        </div>
        <div hidden={embedded} data-portal-tour="navigation" className={embedded ? "hidden" : "flex flex-wrap items-center gap-3"}>
          {slug === "homelane" && tourIdentity && (
            <PortalTour slug={slug} identity={tourIdentity} page="team" />
          )}
          {privateWorkflow ? (
            <>
              <Link href={`/partners/${slug}/projects`} className="text-sm underline">Customer projects</Link>
              <Link href={`/partners/${slug}/documents`} className="text-sm underline">Documents</Link>
            </>
          ) : (
            <>
              <Link href={`/partners/${slug}/library`} className="text-sm text-slate underline">Design library</Link>
              <Link href={`/partners/${slug}/orders`} className="text-sm text-slate underline">Your orders</Link>
            </>
          )}
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      {note && <p className="mt-4 text-sm text-emerald-700">{note}</p>}

      {canManage && (
        <form data-portal-tour="invite" onSubmit={add} className="mt-6 rounded-[18px] border border-edge bg-wash p-4 sm:p-5">
          <p className="font-display text-base font-bold">Give someone access</p>
          <p className="mt-1 text-xs text-slate">
            Any @{emailDomain} address. They sign in with a code sent to that inbox — no password, and
            nothing for Zyvorah to approve.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              placeholder={`name@${emailDomain}`} required
              className="h-11 min-w-[240px] flex-1 rounded-[12px] border border-edge bg-surface px-3 text-sm"
            />
            <input
              type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Their name (how our emails greet them)" maxLength={80}
              className="h-11 min-w-[200px] flex-1 rounded-[12px] border border-edge bg-surface px-3 text-sm"
            />
            <select
              value={newRole}
              onChange={(e) => {
                const role = e.target.value as "admin" | "member";
                setNewRole(role);
                // An admin STARTS with everything, but each box below stays a
                // real switch — untick before adding if this admin shouldn't
                // spend the company's money.
                if (role === "admin") setNewPerms({ can_upload: !privateWorkflow, can_build: true, can_order: !privateWorkflow });
              }}
              className="h-11 rounded-[12px] border border-edge bg-surface px-3 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin — can manage access</option>
            </select>
          </div>

          <div data-portal-tour="permissions" className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {caps.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm" title={c.hint}>
                <input
                  type="checkbox"
                  checked={newPerms[c.key]}
                  onChange={(e) => setNewPerms({ ...newPerms, [c.key]: e.target.checked })}
                  className="h-4 w-4"
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>

          <button type="submit" disabled={busy === "new" || !newEmail.trim()}
            className="btn mt-4 h-11 px-5 text-[0.8rem] disabled:opacity-40">
            {busy === "new" ? "Adding…" : "Add to the team"}
          </button>
        </form>
      )}

      <section data-portal-tour="roster" className="mt-8">
        <p className="caps text-slate">On the account ({members.length})</p>
        {loading ? (
          <p className="mt-3 text-sm text-slate">Loading…</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs text-mist">
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  {caps.map((c) => (
                    <th key={c.key} className="px-3 py-2 font-semibold">{c.label}</th>
                  ))}
                  <th className="px-3 py-2 font-semibold" title="Copied on every dispatch email for the account's orders">
                    Shipment emails
                  </th>
                  {canManage && <th className="py-2 pl-3" />}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const you = m.email === email;
                  const admin = m.role === "admin";
                  return (
                    <tr key={m.id} className="border-b border-edge/60 align-top">
                      <td className="py-3 pr-3">
                        <p className="font-medium text-charcoal">
                          {m.name ? `${m.name} · ` : ""}{m.email}
                          {you && <span className="ml-2 text-xs text-mist">you</span>}
                        </p>
                        <p className="mt-0.5 text-xs text-mist">
                          {admin ? "Admin · manages access" : "Member"}
                          {m.invited_by_email === "self-join" ? " · joined with their work email" : m.invited_by_email && ` · added by ${m.invited_by_email}`}
                          {` · since ${when(m.created_at)}`}
                          {canManage && (
                            <button
                              onClick={() => {
                                const v = prompt(`Name for ${m.email} — it's how our emails greet them:`, m.name ?? "");
                                if (v !== null) void save({ email: m.email, name: v.trim() }, m.id);
                              }}
                              disabled={busy === m.id}
                              className="ml-2 text-xs text-slate underline disabled:opacity-40">
                              {m.name ? "edit name" : "set name"}
                            </button>
                          )}
                        </p>
                      </td>
                      {caps.map((c) => (
                        <td key={c.key} className="px-3 py-3">
                          {canManage ? (
                            <input
                              type="checkbox" checked={m[c.key]} disabled={busy === m.id}
                              title={c.hint}
                              onChange={(e) => void save(
                                { email: m.email, [c.key]: e.target.checked }, m.id,
                              )}
                              className="h-4 w-4"
                            />
                          ) : (
                            <span className={m[c.key] ? "text-emerald-700" : "text-mist"}>
                              {m[c.key] ? "✓" : "—"}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3">
                        {canManage ? (
                          <input
                            type="checkbox" checked={m.notify_dispatch} disabled={busy === m.id}
                            title="Copied on every dispatch email for the account's orders"
                            onChange={(e) => void save(
                              { email: m.email, notify_dispatch: e.target.checked }, m.id,
                            )}
                            className="h-4 w-4"
                          />
                        ) : (
                          <span className={m.notify_dispatch ? "text-emerald-700" : "text-mist"}>
                            {m.notify_dispatch ? "✓" : "—"}
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="py-3 pl-3 text-right">
                          {!you && (
                            <div className="flex flex-wrap items-center justify-end gap-3">
                              <button
                                onClick={() => void save(
                                  { email: m.email, role: admin ? "member" : "admin" }, m.id,
                                )}
                                disabled={busy === m.id}
                                className="text-xs text-slate underline disabled:opacity-40">
                                {admin ? "Make member" : "Make admin"}
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Remove ${m.email}? They won't be able to sign in.`)) {
                                    void save({ action: "revoke", email: m.email }, m.id);
                                  }
                                }}
                                disabled={busy === m.id}
                                className="text-xs text-red-700 underline disabled:opacity-40">
                                Remove
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!canManage && !loading && (
          <p className="mt-3 text-xs text-mist">
            Read-only — ask one of the admins above to change access.
          </p>
        )}
      </section>
    </div>
  );
}
