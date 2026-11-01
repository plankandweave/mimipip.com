
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { partnerCapabilities } from "@/lib/partner-capabilities";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CorporateAccount } from "@/lib/corporate-auth";
import { priceProjectLines } from "@/lib/corporate-project";
import { fetchCorporateQuote, quoteExpired } from "@/lib/corporate-quote";
import PoApproval from "./PoApproval";

// The partner's project, sent to whoever raises the purchase order.
//
// Distinct from /quote/[token], which is the retail customer's OS-minted
// quotation after a site visit. This one is the corporate portal's own: the
// partner composes the walls, the client's procurement opens this, types the PO
// number, and the walls go to print against it. Never indexed.

export const metadata: Metadata = brandMetadata({
  title: "Wallpaper quotation",
  robots: { index: false, follow: false },
});

export const dynamic = "force-dynamic";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const ft = (mm: number) => {
  const total = mm / 304.8;
  const whole = Math.floor(total);
  const inches = Math.round((total - whole) * 12);
  return inches === 12 ? `${whole + 1} ft` : inches ? `${whole} ft ${inches} in` : `${whole} ft`;
};

export default async function CorporateQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await fetchCorporateQuote(token);
  if (!q) notFound();

  const sb = supabaseAdmin();
  const { data: accRow } = sb
    ? await sb.from("corporate_accounts").select("*").eq("id", q.account_id).maybeSingle()
    : { data: null };
  const acc = accRow as CorporateAccount | null;
  if (!acc) notFound();
  if (partnerCapabilities(acc).poRequiredRelease) notFound();

  // Priced here, now, from the account's current rate — the same function the
  // approval uses. A quote page that shows one number and orders another is the
  // one failure this whole flow exists to prevent.
  const priced = await priceProjectLines(acc, q.lines as Record<string, unknown>[]);
  const lines = priced.ok ? priced.lines : [];
  const grandTotal = lines.reduce((s, l) => s + l.price.total, 0);
  const totalSqft = Math.round(lines.reduce((s, l) => s + l.price.areaSqft, 0) * 10) / 10;
  const settled = Boolean(q.approved_at || q.group_ref);
  const expired = quoteExpired(q);

  return (
    <div className="container-x max-w-2xl py-10">
      <p className="caps text-slate">Quotation for approval</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight">
        {q.recipient_name ? `${q.recipient_name}, here's the quotation` : "Here's the quotation"}
      </h1>
      <p className="mt-1.5 text-sm text-slate">
        {acc.name} · {q.walls} wall{q.walls === 1 ? "" : "s"} · sent by {q.created_by_email}
      </p>

      <div className="mt-7 rounded-[18px] border border-edge bg-surface p-5">
        {!priced.ok ? (
          <p className="text-sm text-slate">
            We can&apos;t price these walls any more — {priced.error} Please ask {q.created_by_email} for a fresh quotation.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {lines.map((l, i) => (
                <div key={i} className="flex items-start justify-between gap-4 border-b border-edge pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{i + 1} · {l.printName ?? "Wall"}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {ft(l.widthMm)} × {ft(l.heightMm)} · {l.price.areaSqft.toFixed(1)} sq ft
                    </p>
                    {l.price.excludedSqft > 0 && (
                      <p className="mt-0.5 text-[11px] text-emerald-700">
                        {l.price.excludedSqft.toFixed(1)} sq ft excluded as openings — neither printed nor billed
                      </p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(l.price.total)}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-baseline justify-between border-t border-edge pt-4">
              <span className="font-display font-bold">{totalSqft} sq ft total</span>
              <span className="font-display text-xl font-extrabold tabular-nums">{inr(grandTotal)}</span>
            </div>
            <p className="mt-1 text-right text-[11px] text-mist">Inclusive of {Number(acc.gst_pct)}% GST</p>
          </>
        )}
      </div>

      {(q.state || q.ship_address) && (
        <div className="mt-4 rounded-[18px] border border-edge bg-wash p-5 text-xs text-slate">
          <p className="caps text-mist">Dispatch to</p>
          <p className="mt-1.5 text-sm text-ink">
            {[q.ship_address, q.ship_city, q.ship_pincode, q.state].filter(Boolean).join(", ")}
          </p>
          {q.gstin && <p className="mt-1 font-mono text-[11px]">GSTIN {q.gstin}</p>}
          {q.ship_contact_name && (
            <p className="mt-1">{q.ship_contact_name}{q.ship_contact_phone ? ` · ${q.ship_contact_phone}` : ""}</p>
          )}
        </div>
      )}

      <div className="mt-6">
        {settled ? (
          <div className="rounded-[18px] border border-edge bg-wash p-6 text-center">
            <p className="font-display text-lg font-bold">Approved — thank you</p>
            <p className="mt-1.5 text-sm text-slate">
              {q.po_number ? <>Placed against <strong>PO {q.po_number}</strong>. </> : null}
              {q.group_ref ? <>Project <span className="font-mono text-xs">{q.group_ref}</span>. </> : null}
              These walls are with production, and the PO number carries through to the invoice.
            </p>
          </div>
        ) : q.declined_at ? (
          <div className="rounded-[18px] border border-dashed border-edge bg-wash p-6 text-center">
            <p className="text-sm text-slate">
              This quotation is on hold. Reply to {q.created_by_email} if you&apos;d like it revisited — the measurements are safe.
            </p>
          </div>
        ) : expired ? (
          <div className="rounded-[18px] border border-dashed border-edge bg-wash p-6 text-center">
            <p className="text-sm text-slate">
              This quotation has expired. Ask {q.created_by_email} for a fresh one — the measurements are safe.
            </p>
          </div>
        ) : priced.ok ? (
          <PoApproval token={token} defaultName={q.recipient_name ?? ""} totalLabel={inr(grandTotal)}
            walls={lines.length} />
        ) : null}
      </div>

      <p className="mt-8 text-center text-xs text-mist">
        Questions about anything here? Reply to {q.created_by_email}, or write to hello@zyvorah.com.
      </p>
    </div>
  );
}
