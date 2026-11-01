"use client";
import { useEffect, useState } from "react";
import { StaffGate, useStaff } from "@/lib/use-staff";
import type { PartnerCapabilities } from "@/lib/partner-capabilities";
type Account = {
  id: string;
  name: string;
  slug: string;
  capabilities: PartnerCapabilities;
};
const labels: Record<
  Exclude<keyof PartnerCapabilities, "dispatchPromiseDays">,
  string
> = {
  catalogue: "Catalogue",
  customSizing: "Custom dimensions and composition",
  artworkUpload: "Printable artwork uploads",
  customLibrary: "Custom artwork library",
  customerProjects: "Customer, room and wall projects",
  optionDecisions: "Accepted/rejected option history",
  purchaseApproval: "Separate purchasing confirmation",
  poRequiredRelease: "PO required before operational release",
  automatedRelease: "Automatic durable release",
  exclusiveCollections: "Exclusive collections (Autograph, Saanjha, Atelier)",
};
export default function Features() {
  const staff = useStaff();
  const [accounts, setAccounts] = useState<Account[]>([]),
    [id, setId] = useState(""),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (staff !== "in") return;
    fetch("/api/admin/partner-features")
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw new Error(v.error);
        setAccounts(v.accounts);
        setId(v.accounts[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, [staff]);
  const a = accounts.find((a) => a.id === id);
  function change(caps: PartnerCapabilities) {
    setAccounts(
      accounts.map((x) => (x.id === id ? { ...x, capabilities: caps } : x)),
    );
  }
  if (staff !== "in") return <StaffGate state={staff} title="Partner features" />;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl">Partner features</h1>
      <p className="mt-3 text-sm text-stone-500">
        Configure each partner workflow. Pricing, account type, catalogue
        entitlement and credit terms are managed separately.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-red-700">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mt-4">
          {note}
        </p>
      )}
      <label className="mt-6 block">
        Partner
        <select
          className="mt-2 w-full rounded border p-3"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {a && (
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setNote("");
            try {
              const r = await fetch("/api/admin/partner-features", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  accountId: id,
                  capabilities: a.capabilities,
                }),
              });
              const v = await r.json();
              if (!r.ok) throw new Error(v.error);
              setNote("Partner features saved");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save");
            } finally {
              setBusy(false);
            }
          }}
        >
          {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
            <label key={k} className="block">
              <input
                type="checkbox"
                checked={a.capabilities[k]}
                onChange={(e) =>
                  change({ ...a.capabilities, [k]: e.target.checked })
                }
              />{" "}
              {labels[k]}
            </label>
          ))}
          <label className="block">
            Dispatch promise (calendar days)
            <input
              type="number"
              min={1}
              max={90}
              value={a.capabilities.dispatchPromiseDays}
              onChange={(e) =>
                change({
                  ...a.capabilities,
                  dispatchPromiseDays: Number(e.target.value),
                })
              }
              className="ml-3 rounded border p-2"
            />
          </label>
          <button
            disabled={busy}
            className="rounded bg-stone-800 px-5 py-3 text-white"
          >
            {busy ? "Saving…" : "Save partner features"}
          </button>
        </form>
      )}
    </main>
  );
}
