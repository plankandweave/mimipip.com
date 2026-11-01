
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { CopyButton } from "../../copy-button";
import { MBPL_BANK, MBPL_PAYEE, MBPL_UPI_ID, formatAmount, upiLink } from "@/lib/mbpl-payment";
import { fetchPayDocument } from "@/lib/pay-document";

export const dynamic = "force-dynamic";

export const metadata: Metadata = brandMetadata({
  title: "Pay Zyvorah",
  description: "Pay a Zyvorah quotation or invoice by bank transfer or UPI.",
  robots: { index: false, follow: false },
});

/**
 * Where a Zyvorah quotation, proforma or tax invoice sends its customer to
 * pay (Roheena, 29 October 2026): bank transfer with each detail one tap to
 * copy, and GPay / any UPI app with the amount filled in.
 *
 * It shows our bank account, so it opens only for a real document's own link
 * — /pay/<id>/<signature>, printed on the PDF by the OS — and the OS confirms
 * the document and gives its number and amount. Anything else, a bare /pay
 * included, is "page not found" (Roheena: "should not be visible to anyone").
 */
export default async function PayPage({ params }: { params: Promise<{ id: string; sig: string }> }) {
  const { id, sig } = await params;
  const docu = await fetchPayDocument(id, sig);
  if (!docu) notFound();

  const pay = { ref: docu.number, amount: docu.amount };
  const upi = upiLink(pay);
  const qrSvg = await QRCode.toString(upi, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const rows: [string, string][] = [
    ["Account name", MBPL_BANK.accountName],
    ["Account number", MBPL_BANK.accountNumber],
    ["IFSC", MBPL_BANK.ifsc],
    ["Bank", `${MBPL_BANK.bankName}, ${MBPL_BANK.branch}`],
  ];

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl">
        <span className="caps text-slate">Payment</span>
        <h1 className="mt-3 text-[clamp(2rem,4vw,2.8rem)] leading-tight">Pay Zyvorah</h1>
        <p className="mt-4 text-slate">
          For <strong className="text-charcoal">{docu.number}</strong>
          {docu.amount ? <> · <strong className="text-charcoal">{formatAmount(docu.amount)}</strong></> : null}
        </p>

        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold">GPay or any UPI app</h2>
          <a href={upi} className="btn mt-4 inline-flex h-12 px-6 text-[0.8rem] md:hidden">
            Pay with GPay / UPI
          </a>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <div
              className="h-44 w-44 shrink-0 rounded-lg border border-edge bg-white p-2"
              aria-label="UPI QR code"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="text-sm text-slate">
              <p>Scan with GPay, PhonePe, Paytm or your bank&apos;s app.</p>
              <p className="mt-2 flex items-center gap-3">
                <span>UPI ID <strong className="text-charcoal">{MBPL_UPI_ID}</strong></span>
                <CopyButton value={MBPL_UPI_ID} label="UPI ID" />
              </p>
              <p className="mt-2">Paid to {MBPL_PAYEE}.</p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold">Bank transfer (NEFT, RTGS or IMPS)</h2>
          <dl className="mt-4 divide-y divide-edge rounded-lg border border-edge text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <dt className="text-slate">{k}</dt>
                  <dd className="font-medium text-charcoal">{v}</dd>
                </div>
                {k !== "Bank" && <CopyButton value={v} label={k} />}
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-slate">
            Please put <strong className="text-charcoal">{docu.number}</strong> in the payment remarks so we can match it.
          </p>
        </section>

        <p className="mt-10 text-sm text-slate">
          Questions about a payment? Email{" "}
          <a href="mailto:hello@zyvorah.com" className="underline">hello@zyvorah.com</a>.
        </p>
      </div>
    </div>
  );
}
