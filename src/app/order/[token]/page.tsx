
import { brandMetadata, withBrandMetadata } from "@/brand/metadata";
import { OrderQualityReport } from "@/components/OrderQualityReport";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { signDoc } from "@/lib/private-doc";
import { formatINR, CM_PER_FOOT } from "@/lib/pricing";
import { formatMarketMoney, marketGoodsFromInr } from "@/lib/markets";
import { CancelOrderButton } from "@/components/CancelOrderButton";
import { PayOrderButton } from "@/components/PayOrderButton";

export const metadata: Metadata = brandMetadata({ title: "Your order", robots: { index: false, follow: false } });

type Item = {
  product_title: string;
  product_handle: string | null;
  material_name: string | null;
  width_cm: number | null;
  height_cm: number | null;
  area_sqft: number | null;
  quantity: number;
  line_total: number;
  image: string | null;
};
type OrderView = {
  order_number: number;
  /** The ZVY number — what the customer quotes to us and what production, the
   *  courier label and the invoice all carry. Null on pre-0126 orders. */
  zvy: string | null;
  status: string;
  payment_status: string;
  created_at: string;
  subtotal: number | string;
  shipping: number | string;
  total: number | string;
  courier: string | null;
  awb: string | null;
  tracking_url: string | null;
  /** Dispatched – closed (9 Oct 2026): the parcel left with a tracking
   *  number and nobody chases it; delivered can still be recorded later. */
  parcel_closed_at?: string | null;
  gst_invoice_url: string | null;
  order_copy_url: string | null;
  shipping_address: { name?: string; line1?: string; city?: string; state?: string; pincode?: string } | null;
  notes: string | null;
  cancellable: boolean;
  items: Item[];
};

// The six milestones the customer sees, mapped from the internal order status.
const STAGES = [
  { label: "Order placed", desc: "We've received your order." },
  { label: "Order queued", desc: "Queued to print — cut to your exact wall." },
  { label: "Order Printing", desc: "On the press, printing your mural." },
  { label: "Ready for shipping", desc: "Printed, checked, and ready to dispatch." },
  { label: "Shipped in transit", desc: "On its way to you." },
  { label: "Delivered", desc: "Enjoy your new wall." },
];
const STATUS_STAGE: Record<string, number> = {
  pending: 0, paid: 1, in_production: 2, printed: 3, shipped: 4, delivered: 5,
};
const STATUS_PILL: Record<string, string> = {
  pending: "Awaiting payment", paid: "Queued to production", in_production: "Printing",
  printed: "Ready to ship", shipped: "In transit", delivered: "Delivered", cancelled: "Cancelled",
};

const ft = (cm: number | null | undefined) => (cm ? Math.round((cm / CM_PER_FOOT) * 10) / 10 : null);

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await supabase.rpc("order_by_token", { p_token: token });
  const order = data as OrderView | null;
  if (!order) notFound();

  // The order documents live in a private bucket, so the stored URL is a
  // reference, not something a browser can open. Sign both for this render.
  const [orderCopyUrl, gstInvoiceUrl] = await Promise.all([
    signDoc(order.order_copy_url),
    signDoc(order.gst_invoice_url),
  ]);

  const cancelled = order.status === "cancelled";
  // Placed, but the payment leg never happened — the checkout response was lost
  // before Razorpay opened (see /api/checkout). This page used to render that
  // as a cheerful "Order placed" with the timeline ticking at stage one, which
  // is how Shades watched #54 sit for eighteen days believing it was on its
  // way. An order nobody has paid for is not in production, and the page has to
  // say so — and offer the payment window she never got.
  const unpaid = order.status === "pending" && order.payment_status !== "paid";
  const current = STATUS_STAGE[order.status] ?? 0;
  const placedOn = new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const addr = order.shipping_address;
  const shipping = Number(order.shipping) || 0;
  let marketNote: {
    marketCountry?: string;
    presentmentCurrency?: "INR" | "USD";
    presentmentGoods?: number;
    presentmentDelivery?: number;
    presentmentTotal?: number;
  } = {};
  try {
    marketNote = JSON.parse(order.notes ?? "{}");
  } catch {
    marketNote = {};
  }
  const displayCurrency = marketNote.presentmentCurrency === "USD" ? "USD" : "INR";
  const displayMoney = (inr: number) =>
    displayCurrency === "USD"
      ? formatMarketMoney(marketGoodsFromInr(inr, marketNote.marketCountry ?? "US"), "USD")
      : formatINR(inr);
  const displayTotal = displayCurrency === "USD" && Number(marketNote.presentmentTotal) > 0
    ? formatMarketMoney(Number(marketNote.presentmentTotal), "USD")
    : formatINR(Number(order.total));
  return (
    <div className="container-x py-10">
      {/* header */}
      <div className="mx-auto max-w-3xl">
        <div className={`rounded-[28px] px-7 py-8 ${cancelled ? "bg-blush/40" : "bg-lavender/30"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="caps text-slate">Your order</span>
              <h1 className="mt-1 text-[clamp(1.7rem,3.2vw,2.4rem)] leading-tight">Order {order.zvy ?? `#${order.order_number}`}</h1>
              <p className="mt-1 text-sm text-slate">Placed on {placedOn}</p>
            </div>
            <span className="rounded-full bg-charcoal px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-surface">
              {unpaid ? "Payment pending" : order.status === "shipped" && order.parcel_closed_at ? "Dispatched" : STATUS_PILL[order.status] ?? order.status}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-3xl gap-8 lg:grid-cols-[300px_1fr]">
        {/* timeline */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          {unpaid ? (
            <div className="rounded-[20px] bg-blush/40 px-5 py-5">
              <p className="text-sm font-semibold text-charcoal">Payment wasn&apos;t completed</p>
              <p className="mt-1.5 text-sm text-charcoal/80">
                We have your order and nothing about it is lost — but the payment never went
                through, so it hasn&apos;t gone to print yet. Pay here and it joins the queue straight
                away.
              </p>
              <div className="mt-4">
                <PayOrderButton token={token} amountLabel={displayTotal} />
              </div>
              <p className="mt-3 text-xs text-charcoal/70">
                Prefer to sort it out with a person? Email{" "}
                <a href="mailto:hello@zyvorah.com" className="underline underline-offset-2">hello@zyvorah.com</a>.
              </p>
            </div>
          ) : cancelled ? (
            <div className="rounded-[20px] bg-blush/40 px-5 py-5 text-sm text-charcoal">
              This order has been cancelled. If it was paid, your refund is being processed to your
              original payment method and typically completes within 7 working days.
            </div>
          ) : (
            <ol className="relative pl-1">
              {STAGES.map((s, i) => {
                const done = i < current;
                const active = i === current;
                const last = i === STAGES.length - 1;
                return (
                  <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
                    {!last && (
                      <>
                        <span className={`absolute left-[11px] top-6 h-[calc(100%-12px)] w-px ${done ? "bg-sage" : "bg-edge"}`} aria-hidden />
                        <svg
                          aria-hidden
                          viewBox="0 0 12 12"
                          className={`absolute left-[11px] bottom-[7px] h-2.5 w-2.5 -translate-x-1/2 ${done ? "text-sage" : "text-mist/60"}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 4.5l3 3 3-3" />
                        </svg>
                      </>
                    )}
                    <span
                      className={`relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.65rem] font-bold ${
                        done ? "bg-sage text-charcoal" : active ? "bg-charcoal text-surface ring-4 ring-charcoal/10" : "bg-wash text-mist"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <div className="pb-1">
                      <p className={`text-sm ${active ? "font-bold text-charcoal" : done ? "font-medium text-slate" : "text-mist"}`}>{s.label}</p>
                      <p className={`mt-0.5 text-xs ${active ? "text-slate" : "text-mist"}`}>{s.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {/* tracking when shipped */}
          {order.status === "shipped" && (order.tracking_url || order.awb) && (
            <div className="mt-6 rounded-[18px] border border-edge p-5">
              <p className="text-sm font-semibold">Tracking</p>
              {order.courier && <p className="mt-1 text-sm text-slate">Courier: {order.courier}</p>}
              {order.awb && <p className="text-sm text-slate">AWB: {order.awb}</p>}
              {order.tracking_url && (
                <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="btn mt-3 inline-flex h-11 px-5 text-[0.8rem]">
                  Track your parcel
                </a>
              )}
            </div>
          )}
        </div>

        {/* order details */}
        <div className="space-y-6">
          {order.items.length > 0 && (
            <div className="rounded-[20px] border border-edge p-5">
              <p className="caps mb-4 text-slate">In this order</p>
              <div className="space-y-4">
                {order.items.map((it, i) => {
                  const w = ft(it.width_cm), h = ft(it.height_cm);
                  return (
                    <div key={i} className="flex gap-4">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[12px] bg-wash">
                        {it.image && <Image src={it.image} alt={it.product_title} fill sizes="80px" className="object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        {it.product_handle ? (
                          <Link href={`/products/${it.product_handle}`} className="font-display text-sm font-semibold hover:underline">
                            {it.product_title}
                          </Link>
                        ) : (
                          <p className="font-display text-sm font-semibold">{it.product_title}</p>
                        )}
                        <p className="mt-0.5 text-xs text-slate">
                          {[w && h ? `${w} × ${h} ft` : null, it.material_name, it.quantity > 1 ? `× ${it.quantity}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="text-sm font-semibold">{displayMoney(Number(it.line_total))}</div>
                    </div>
                  );
                })}
              </div>

              <dl className="mt-5 space-y-1.5 border-t border-edge pt-4 text-sm">
                <div className="flex justify-between text-slate"><dt>Goods</dt><dd>{displayCurrency === "USD" && marketNote.presentmentGoods != null ? formatMarketMoney(Number(marketNote.presentmentGoods), "USD") : formatINR(Number(order.subtotal))}</dd></div>
                <div className="flex justify-between text-slate"><dt>Delivery</dt><dd>{displayCurrency === "USD" ? `${formatMarketMoney(Number(marketNote.presentmentDelivery ?? 0), "USD")} · included` : shipping > 0 ? formatINR(shipping) : "Free"}</dd></div>
                {displayCurrency === "USD" && <div className="flex justify-between text-slate"><dt>Duties &amp; customs</dt><dd>Not included</dd></div>}
                <div className="mt-1 flex justify-between border-t border-edge pt-2 font-semibold text-charcoal"><dt>{displayCurrency === "INR" ? "Total (incl. GST)" : "Total"}</dt><dd>{displayTotal}</dd></div>
              </dl>

            </div>
          )}

          {/* shipping address */}
          {addr && (addr.line1 || addr.city) && (
            <div className="rounded-[20px] border border-edge p-5">
              <p className="caps mb-2 text-slate">Delivery address</p>
              <p className="text-sm text-charcoal">{addr.name}</p>
              <p className="text-sm text-slate">
                {[addr.line1, addr.city, addr.state, addr.pincode, (addr as { country?: string }).country].filter(Boolean).join(", ")}
              </p>
            </div>
          )}

          {/* documents */}
          {(orderCopyUrl || gstInvoiceUrl) && (
            <div className="rounded-[20px] border border-edge p-5">
              <p className="caps mb-3 text-slate">Documents</p>
              <div className="flex flex-wrap gap-3">
                {orderCopyUrl && (
                  <a href={orderCopyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-sm">
                    Order copy (PDF)
                  </a>
                )}
                {gstInvoiceUrl && (
                  <a href={gstInvoiceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost text-sm">
                    {displayCurrency === "USD" ? "Commercial invoice (PDF)" : "GST invoice (PDF)"}
                  </a>
                )}
              </div>
            </div>
          )}

          {order.payment_status === "paid" && <OrderQualityReport token={token} />}

          {/* cancel while still queued */}
          {order.cancellable && !cancelled && (
            <div className="rounded-[20px] bg-wash p-5">
              <p className="text-sm text-slate">
                Production is automated and can begin very soon. You can cancel while this order is
                still queued — once printing starts it can no longer be cancelled.
              </p>
              <div className="mt-3">
                <CancelOrderButton token={token} />
              </div>
            </div>
          )}

          <Link href="/collections/wall-art" className="inline-block text-sm font-semibold underline underline-offset-2">
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
