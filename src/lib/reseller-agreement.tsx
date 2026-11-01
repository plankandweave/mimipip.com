import type { ReactNode } from "react";

// The standard reseller agreement, as versioned content (Roheena, 14 Aug 2026).
//
// The WORDING is the contract: it was drafted as a document and reviewed as a
// document, so this file renders that document faithfully — clause numbering
// included — rather than paraphrasing it into UI copy. Two values are dynamic
// (the account's discount/rate and its minimum order) so one document serves
// every reseller with their own Schedule numbers; everything else is fixed for
// a given version. Changing ANY fixed wording is a new version string, a row
// in corporate_agreements per re-acceptance, never an edit in place — the
// version is what a signature record points at.

export const RESELLER_AGREEMENT_VERSION = "reseller-1.0";
export const RESELLER_AGREEMENT_DATE = "14 August 2026";

// TODO(roheena): confirm exact legal entity name
export const ZYVORAH_LEGAL_ENTITY = "Magnitude Brands Private Limited";
export const ZYVORAH_GSTIN = "27AATCM2315A1ZP";

/** The per-account Schedule numbers the document renders with. */
export type AgreementCommercials = {
  pricingMode: "flat_rate" | "website";
  /** Discount off published website price (website mode). */
  discountPct: number;
  /** Contracted ex-GST ₹/sq ft (flat_rate mode). */
  ratePerSqft: number;
  /** Minimum order value, ₹ ex-GST per order. Null = no minimum set. */
  minOrderInr: number | null;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function rateSentence(c: AgreementCommercials): ReactNode {
  return c.pricingMode === "website" ? (
    <>The Reseller&apos;s net rate is the published zyvorah.com price for the product, less a
    discount of <strong>{c.discountPct}%</strong>, exclusive of GST. The discount is flat and
    does not vary with volume.</>
  ) : (
    <>The Reseller&apos;s net rate is <strong>{inr(c.ratePerSqft)} per square foot</strong>,
    exclusive of GST. The rate is flat and does not vary with volume.</>
  );
}

function rateSummary(c: AgreementCommercials): string {
  return c.pricingMode === "website"
    ? `${c.discountPct}% off website price, flat, ex-GST — irrespective of volume`
    : `${inr(c.ratePerSqft)}/sq ft flat, ex-GST — irrespective of volume`;
}

function minOrderSentence(c: AgreementCommercials): string {
  return c.minOrderInr && c.minOrderInr > 0
    ? `${inr(c.minOrderInr)} exclusive of GST, per order.`
    : "No minimum order value is currently set for this account.";
}

function Clause({ no, title, children }: { no: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="flex items-baseline gap-2.5 font-display text-base font-bold text-charcoal">
        <span className="min-w-[1.6rem] text-sm font-semibold tabular-nums text-mist">{no}</span>
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate">{children}</div>
    </section>
  );
}

function Sub({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-10 marker:text-mist">
      {items.map((it, i) => <li key={i} className="pl-1">{it}</li>)}
    </ol>
  );
}

/**
 * The full agreement text, rendered with this account's own numbers. Server
 * and client safe; no state, no handlers — the acceptance block is a separate
 * component so the words and the signature never entangle.
 */
export function ResellerAgreementText({ commercials: c }: { commercials: AgreementCommercials }) {
  return (
    <article>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
        Standard terms · All resellers · Web-signed
      </p>
      <h1 className="mt-2 font-display text-2xl font-extrabold text-charcoal">
        Zyvorah Authorised Reseller Agreement
      </h1>
      <p className="mt-1.5 text-xs text-mist">
        Version 1.0 — {RESELLER_AGREEMENT_DATE} · Applies to reseller accounts only (architects and
        designers are covered by the separate trade commission programme)
      </p>

      <div className="mt-6 space-y-3 border-y border-edge py-5 text-sm leading-relaxed text-slate">
        <p>
          This Agreement is made between <strong className="text-charcoal">{ZYVORAH_LEGAL_ENTITY}</strong>,
          GSTIN {ZYVORAH_GSTIN}, trading as <strong className="text-charcoal">Zyvorah</strong> (&quot;Zyvorah&quot;,
          &quot;we&quot;), and the business entity identified in the acceptance record below
          (the &quot;Reseller&quot;, &quot;you&quot;).
        </p>
        <p>
          This is a commercial agreement between two businesses. It is contractual, not personal: it
          binds the Reseller entity, not the individual accepting it, and the individual accepting
          warrants that they are authorised to bind that entity.
        </p>
      </div>

      <Clause no={1} title="Relationship">
        <p>
          The Reseller is appointed as a non-exclusive authorised reseller of Zyvorah products.
          Nothing in this Agreement creates an agency, partnership, franchise, joint venture or
          employment relationship. The Reseller buys from Zyvorah and sells onward as principal, in
          its own name and at its own risk. No territory is granted or implied; Zyvorah may sell to
          anyone, anywhere, including in the Reseller&apos;s city, directly or through others.
        </p>
      </Clause>

      <Clause no={2} title="Pricing to the Reseller">
        <Sub items={[
          rateSentence(c),
          <>Published prices may change at any time. Once an order is committed (&quot;frozen&quot;) in the
          portal, its price is locked for 30 days.</>,
          <>GST applies at the prevailing rate on the net amount and is shown in the portal before
          payment.</>,
        ]} />
      </Clause>

      <Clause no={3} title="Pricing to the Reseller's customers">
        <p>
          What the Reseller charges its own customers is entirely the Reseller&apos;s decision — for
          catalogue designs and equally for custom orders made from the Reseller&apos;s own images.
          Zyvorah invoices the Reseller at the net rate only, never the Reseller&apos;s customer, and
          never discloses the net rate or the Reseller&apos;s margin to the Reseller&apos;s customer.
        </p>
      </Clause>

      <Clause no={4} title="Ordering and payment">
        <Sub items={[
          <>All orders are placed through the Reseller&apos;s portal on zyvorah.com. Draft orders may be
          created, priced and revised freely, at no commitment.</>,
          <>Committing (freezing) an order and paying for it in full through the portal is what
          places it. Production begins only after full payment is received.</>,
          <>Minimum order value: {minOrderSentence(c)}</>,
          <>Freight is always to-pay (collect): shipping charges are payable by the Reseller to the
          carrier on delivery and are never included in the portal payment.</>,
        ]} />
      </Clause>

      <Clause no={5} title="Cancellation — one window only">
        <p>
          An order may be cancelled at exactly one stage: after it is committed and <em>before</em> it
          is paid. Payment releases the order to production immediately and irrevocably. After
          payment, the order cannot be cancelled, amended or refunded, in whole or in part. Every
          Zyvorah product is made to the Reseller&apos;s measurements for a specific wall; it has no
          resale value to anyone else and cannot be restocked.
        </p>
      </Clause>

      <Clause no={6} title="Custom images supplied by the Reseller">
        <Sub items={[
          <>The Reseller may order custom prints from images it uploads to its portal library. All
          such images are supplied by the Reseller: the Reseller warrants that it owns the image or
          holds every licence and consent needed to print it commercially, that the content is
          lawful, and that printing it infringes no third party&apos;s copyright, trademark, privacy or
          other right. The Reseller indemnifies Zyvorah in full against any claim arising from an
          image it supplied.</>,
          <>Zyvorah will enhance and upscale supplied images to print resolution as part of
          production. This enhancement is a best-effort service: the achievable result is limited by
          the supplied image, and enhancement is not a warranty of any particular sharpness,
          likeness or effect.</>,
          <>On-screen previews are indicative. Reasonable variation between screen colour and
          printed colour, and between batches, is inherent to wide-format printing and is not a
          defect.</>,
        ]} />
      </Clause>

      <Clause no={7} title="Delivery and risk">
        <p>
          Dispatch is from Zyvorah&apos;s facility, by surface carrier, freight to-pay. Risk in the goods
          passes to the Reseller when the goods are handed to the carrier. Lead times quoted in the
          portal are indicative, not guaranteed; delay is not grounds for cancellation or
          compensation.
        </p>
      </Clause>

      <Clause no={8} title="Installation">
        <p>
          Zyvorah supplies material only. Installation, and everything that happens on site, is the
          Reseller&apos;s responsibility. Zyvorah&apos;s installation guides are provided for convenience and
          create no liability for site work, surfaces or workmanship.
        </p>
      </Clause>

      <Clause no={9} title="Defects and claims">
        <Sub items={[
          <>Claims for manufacturing defects or transit damage must be raised within 48 hours of
          delivery, with photographs of the material and packaging, before installation begins.</>,
          <>The sole remedy for a valid claim is a reprint of the affected panels. No claim is
          accepted for material that has been cut, pasted or installed, and no claim results in a
          monetary refund.</>,
        ]} />
      </Clause>

      <Clause no={10} title="Tax and invoicing">
        <p>
          Zyvorah issues a B2B tax invoice to the Reseller&apos;s GSTIN for each order. The Reseller is
          solely responsible for its own tax compliance on onward sales, and shall not represent
          itself as Zyvorah, as Zyvorah&apos;s branch or agent, or invoice in Zyvorah&apos;s name.
        </p>
      </Clause>

      <Clause no={11} title="Brand use and customer relationships">
        <p>
          The Reseller may use the Zyvorah name and marketing material we provide to promote genuine
          Zyvorah products, and this permission ends with this Agreement. The Reseller shall not
          register or claim any Zyvorah mark or confusingly similar name. The Reseller&apos;s customer
          relationships remain the Reseller&apos;s; customer details shared with Zyvorah for shipping are
          used to fulfil that order.
        </p>
      </Clause>

      <Clause no={12} title="Liability">
        <p>
          Zyvorah&apos;s total liability arising out of any order is capped at the amount paid for that
          order. Neither party is liable to the other for indirect or consequential loss, loss of
          profit or loss of business.
        </p>
      </Clause>

      <Clause no={13} title="Term, changes and termination">
        <Sub items={[
          <>This Agreement runs until either party ends it with 30 days&apos; written notice. Orders
          already paid are completed on these terms.</>,
          <>Zyvorah may revise these standard terms with 15 days&apos; notice given in the portal or by
          email; placing an order after the notice period is acceptance of the revised terms.</>,
          <>Zyvorah may suspend the portal account immediately for non-payment, misuse of the brand,
          or breach of clause 6.</>,
        ]} />
      </Clause>

      <Clause no={14} title="Governing law and jurisdiction">
        <p>
          This Agreement is governed by the laws of India. The courts at{" "}
          <strong className="text-charcoal">Pune, Maharashtra</strong> have exclusive jurisdiction
          over every dispute arising out of or in connection with this Agreement, the portal, and
          every order placed under it.
        </p>
      </Clause>

      <Clause no={15} title="Electronic acceptance">
        <p>
          This Agreement is executed electronically under the Information Technology Act, 2000.
          Acceptance in the portal — ticking the acceptance box and continuing — constitutes the
          Reseller&apos;s signature. Zyvorah&apos;s record of the acceptance (name, business, email, GSTIN if
          provided, timestamp, IP address and agreement version) is conclusive evidence of
          execution.
        </p>
      </Clause>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-edge py-2 pr-4 text-left text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-mist">Commercial summary</th>
              <th className="border-b border-edge py-2 text-left text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-mist">Standard reseller terms</th>
            </tr>
          </thead>
          <tbody className="text-slate">
            {[
              [c.pricingMode === "website" ? "Discount" : "Rate", rateSummary(c)],
              ["Payment", "100% in the portal, before production"],
              ["Minimum order", c.minOrderInr && c.minOrderInr > 0
                ? `${inr(c.minOrderInr)} ex-GST per order`
                : "No minimum currently set"],
              ["Cancellation", "Only between commit and payment; never after payment"],
              ["Freight", "Always to-pay, borne by the Reseller"],
              ["Installation", "Reseller's responsibility"],
              ["Claims", "48 hours, pre-installation, remedy is reprint"],
              ["Territory", "None — strictly non-exclusive"],
              ["Jurisdiction", "Courts at Pune, Maharashtra"],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="border-b border-edge py-2 pr-4 align-top font-medium text-charcoal">{k}</td>
                <td className="border-b border-edge py-2 align-top">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
