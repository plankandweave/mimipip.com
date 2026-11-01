"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * The account's own page: what we agreed, and who to contact.
 *
 * The split down the middle is the point. The COMMERCIAL TERMS are shown to
 * the account's owners and to nobody else — and they are read-only for the
 * owners too, because they are what the entity signed, not a preference. The
 * CONTACTS below them are the partner's own working details, theirs to keep
 * current without asking us.
 */

type Terms = {
  account_type: string;
  account_type_label: string;
  credit_limit_waived: boolean;
  pricing_mode: "flat_rate" | "website";
  rate_per_sqft: number;
  discount_pct: number;
  gst_pct: number;
  print_gate: "credit" | "payment_first";
  credit_limit_inr: number | null;
  credit_terms_days: number | null;
  min_order_value_inr: number | null;
  proposal_validity_days: number;
  agreement_required: string | null;
  agreement_signed_on: string | null;
};

type Account = {
  slug: string; name: string; legal_name: string | null;
  email_domain: string; logo_path: string | null;
  channel_kind: "online" | "offline"; ship_states: string[] | null;
};

type Contacts = {
  install_contact_name: string | null;
  install_contact_phone: string | null;
  followup_email: string | null;
  bill_cc_emails: string[] | null;
};

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const when = (s: string) =>
  new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export default function AccountSettings({
  slug, accountName, isOwner, embedded = false,
}: {
  slug: string; accountName: string; isOwner: boolean; embedded?: boolean;
}) {
  const [account, setAccount] = useState<Account | null>(null);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Draft state for the editable half.
  const [installName, setInstallName] = useState("");
  const [installPhone, setInstallPhone] = useState("");
  const [apEmail, setApEmail] = useState("");
  const [billCc, setBillCc] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/corporate/account", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setAccount(j.account as Account);
      setTerms((j.terms ?? null) as Terms | null);
      const c = j.contacts as Contacts;
      setContacts(c);
      setInstallName(c.install_contact_name ?? "");
      setInstallPhone(c.install_contact_phone ?? "");
      setApEmail(c.followup_email ?? "");
      setBillCc((c.bill_cc_emails ?? []).join(", "));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveContacts(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setNote(null);
    try {
      const r = await fetch("/api/corporate/account", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          install_contact_name: installName,
          install_contact_phone: installPhone,
          followup_email: apEmail,
          bill_cc_emails: billCc,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not save that.");
      await load();
      setNote("Saved.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save that.");
    } finally { setBusy(false); }
  }

  const dirty = contacts !== null && (
    installName !== (contacts.install_contact_name ?? "") ||
    installPhone !== (contacts.install_contact_phone ?? "") ||
    apEmail !== (contacts.followup_email ?? "") ||
    billCc !== (contacts.bill_cc_emails ?? []).join(", ")
  );

  return (
    <div className={embedded ? "py-3" : "container-x py-8 sm:py-10"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-extrabold leading-tight sm:text-2xl">Account</h1>
          <p className="truncate text-xs text-slate">{accountName} · your details and terms</p>
        </div>
        <div hidden={embedded} className={embedded ? "hidden" : "flex flex-wrap items-center gap-3"}>
          <Link href={`/partners/${slug}/library`} className="text-sm text-slate underline">Design library</Link>
          <Link href={`/partners/${slug}/orders`} className="text-sm text-slate underline">Your orders</Link>
          <Link href={`/partners/${slug}/team`} className="text-sm text-slate underline">Team</Link>
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      {note && <p className="mt-4 text-sm text-emerald-700">{note}</p>}

      {loading ? (
        <p className="mt-6 text-sm text-slate">Loading…</p>
      ) : !account ? (
        <p className="mt-6 text-sm text-red-600">Could not load the account.</p>
      ) : (
        <>
          <section className="mt-8">
            <p className="caps text-slate">Your business</p>
            <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <Row label="Trading name" value={account.name} />
              <Row label="Registered name" value={account.legal_name ?? "—"} />
              <Row label="Sign-in domain" value={`@${account.email_domain}`} />
              <Row
                label="Ships to"
                value={account.ship_states?.length ? account.ship_states.join(", ") : "No restriction"}
              />
            </dl>
          </section>

          {isOwner && terms && (
            <section className="mt-9">
              <p className="caps text-slate">Your terms</p>
              <p className="mt-1 text-xs text-mist">
                Visible to account admins only — not to members. These are what your business agreed with
                Zyvorah, so they aren&apos;t editable here. To change any of them, talk to us.
              </p>
              <div className="mt-3 rounded-[18px] border border-edge bg-wash p-4 sm:p-5">
                <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  <Row label="Account type" value={terms.account_type_label} />
                  {terms.pricing_mode === "flat_rate" ? (
                    <Row label="Your price" value={`${rupees(terms.rate_per_sqft)} per sq.ft — flat rate`} />
                  ) : (
                    <Row label="Your price" value={`Website list price, less ${terms.discount_pct}%`} />
                  )}
                  <Row label="GST" value={`${terms.gst_pct}%`} />
                  <Row
                    label="Payment"
                    value={terms.print_gate === "credit"
                      ? "On credit — we print first, invoice after"
                      : "Payment first — printing starts once paid"}
                  />
                  <Row
                    label="Credit limit"
                    value={terms.credit_limit_waived ? "No limit"
                      : terms.print_gate === "payment_first" ? "Not applicable — you pay upfront"
                      : terms.credit_limit_inr === null ? "Not set" : rupees(terms.credit_limit_inr)}
                  />
                  <Row
                    label="Payment terms"
                    value={terms.credit_limit_waived ? "—"
                      // An account that pays before we print has no terms to
                      // run — saying "Not set" there reads as a gap in the
                      // record rather than a thing that does not apply.
                      : terms.print_gate === "payment_first" ? "Not applicable — you pay upfront"
                      : terms.credit_terms_days === null ? "Not set" : `${terms.credit_terms_days} days`}
                  />
                  <Row
                    label="Minimum order"
                    value={terms.min_order_value_inr === null
                      ? "None" : `${rupees(terms.min_order_value_inr)} (ex-GST)`}
                  />
                  <Row label="Quotes valid for" value={`${terms.proposal_validity_days} days`} />
                  <Row
                    label="Agreement"
                    value={terms.agreement_signed_on
                      ? `Signed ${when(terms.agreement_signed_on)}`
                      : terms.agreement_required
                        ? `Accepted in the portal (${terms.agreement_required})`
                        : "On file with Zyvorah"}
                  />
                </dl>
              </div>
            </section>
          )}

          {!isOwner && (
            <section className="mt-9">
              <p className="caps text-slate">Your terms</p>
              <p className="mt-2 text-sm text-slate">
                Pricing, credit and payment terms are shown to your account admins only. Ask one of them if
                you need the numbers.
              </p>
            </section>
          )}

          <section className="mt-9">
            <p className="caps text-slate">Contacts</p>
            <p className="mt-1 text-xs text-mist">
              {isOwner
                ? "Yours to keep current — no need to tell us separately."
                : "Read-only — ask one of your account admins to change these."}
            </p>

            <form onSubmit={saveContacts} className="mt-3 rounded-[18px] border border-edge bg-surface p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Site contact — name"
                  hint="Printed on the install sheet the fitter carries."
                  value={installName} onChange={setInstallName} disabled={!isOwner} maxLength={80}
                />
                <Field
                  label="Site contact — phone"
                  hint="Who our dispatch team calls about a delivery."
                  value={installPhone} onChange={setInstallPhone} disabled={!isOwner} maxLength={30}
                />
                <Field
                  label="Accounts payable"
                  hint="Where invoices and payment reminders go."
                  value={apEmail} onChange={setApEmail} disabled={!isOwner} type="email"
                />
                <Field
                  label="Copy bills to"
                  hint="Comma-separated. Up to 10 addresses."
                  value={billCc} onChange={setBillCc} disabled={!isOwner}
                />
              </div>

              {isOwner && (
                <button type="submit" disabled={busy || !dirty}
                  className="btn mt-5 h-11 px-5 text-[0.8rem] disabled:opacity-40">
                  {busy ? "Saving…" : "Save contacts"}
                </button>
              )}
            </form>
          </section>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-mist">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-charcoal">{value}</dd>
    </div>
  );
}

function Field({
  label, hint, value, onChange, disabled, type = "text", maxLength,
}: {
  label: string; hint: string; value: string; onChange: (v: string) => void;
  disabled: boolean; type?: string; maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs text-mist">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        disabled={disabled} maxLength={maxLength}
        className="mt-1 h-11 w-full rounded-[12px] border border-edge bg-surface px-3 text-sm disabled:bg-wash disabled:text-slate"
      />
      <span className="mt-1 block text-xs text-mist">{hint}</span>
    </label>
  );
}
