"use client";

import { loadRazorpay } from "@/lib/load-razorpay";
import { SAMPLE_INR } from "@/brand/commerce/sample-policy";
import { isInternalOrder } from "@/lib/internal-orders";
import { useEffect, useRef, useState } from "react";
import { exGst, formatINR } from "@/lib/pricing";
import { useMarket } from "@/components/MarketProvider";
import { InvoiceBreakdown } from "@/components/InvoiceBreakdown";
import { gstinChecksumOk } from "@/lib/gst";
import { SAMPLE_FINISHES, DEFAULT_SAMPLE_FINISH } from "@/lib/sample-finishes";
import { SAMPLE_SCOPE_NOTE } from "@/lib/sample-designs";
import { readSavedContact, writeSavedContact } from "@/lib/saved-contact";
import { gaSamplePurchase, gaEvent } from "@/lib/ga";
import { normalisePhone } from "@/lib/google-ads";
import { metaContentId, metaSamplePurchase } from "@/lib/meta-pixel";
import { openAiIdentify, openAiOrderCreated } from "@/lib/openai-pixel";

const UNIT = SAMPLE_INR; // ₹ per sample line (one design × one material)
/** The sample invitation quotes this, so the button and the charge cannot drift. */
export const SAMPLE_UNIT_INR = UNIT;

type Design = { handle: string; title: string; image?: string | null };
type RazorpayInfo = { razorpayOrderId: string; keyId: string; amount: number };

const SAMPLE_SESSION_KEY = 'mimipip-sample-payment';
function sampleSession(){
  let token=sessionStorage.getItem(SAMPLE_SESSION_KEY);
  if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');sessionStorage.setItem(SAMPLE_SESSION_KEY,token);}
  return token;
}

/**
 * A sample is always a specific DESIGN on a specific MATERIAL — never a vague
 * "how many samples" count. Selecting a design locks the "Design" column;
 * each ticked finish becomes its own explicit line at a fixed qty of 1, so the
 * table and the total can never disagree about what ₹200 buys.
 */
export function OrderSample({ initialDesign = null }: { initialDesign?: Design | null }) {
  const { market, ready: marketReady } = useMarket();
  const [design, setDesign] = useState<Design | null>(initialDesign);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Design[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Starts on the wallpaper finish alone — see DEFAULT_SAMPLE_FINISH.
  const [finishes, setFinishes] = useState<Set<string>>(new Set([DEFAULT_SAMPLE_FINISH]));
  // Pre-fill from whatever this browser already gave us — on the sample form
  // or at checkout — so a returning customer isn't asked for it twice.
  const [form, setForm] = useState(() => ({
    name: "",
    email: "",
    phone: "",
    line1: "",
    city: "",
    state: "",
    pincode: "",
    gstin: "",
    billingName: "",
    ...readSavedContact(),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ orderNumber: string; paymentPending: boolean } | null>(null);

  const [paymentsOpen,setPaymentsOpen]=useState(false);
  const [paymentOpen,setPaymentOpen]=useState(false);
  const [pending,setPending]=useState(false);
  async function checkPayment(){
    const token=sessionStorage.getItem(SAMPLE_SESSION_KEY);
    if(!token)return;
    setBusy(true);
    try{
      const res=await fetch('/api/checkout/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
      const data=await res.json();
      if(res.ok && data.paid){setPlaced({orderNumber:data.orderNumber,paymentPending:false});sessionStorage.removeItem(SAMPLE_SESSION_KEY);sessionStorage.removeItem(SAMPLE_SESSION_KEY+'-started');setPending(false);}
      else setError(data.message || data.error || 'Payment is not confirmed. Check again before paying.');
    }catch{setError('We could not check the payment. If charged, please contact hello@mimipip.com before paying again.');}
    finally{setBusy(false);}
  }
  useEffect(()=>{
    fetch('/api/sample-order/readiness').then(r=>r.json()).then(d=>setPaymentsOpen(d.open===true)).catch(()=>setPaymentsOpen(false));
    if(sessionStorage.getItem(SAMPLE_SESSION_KEY+'-started')){setPending(true);void checkPayment();}
  },[]);

  const locked = !!initialDesign; // product-page context — design isn't user-changeable

  useEffect(() => {
    if (locked) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        // No query browses the sampleable collection — see SAMPLE_SCOPE_NOTE.
        const res = await fetch(`/api/design-search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, locked]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleFinish = (f: string) =>
    setFinishes((p) => {
      const n = new Set(p);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });

  // One explicit line per selected material — this IS the source of truth for
  // both the table shown to the customer and the amount charged.
  const lines = design ? [...finishes].map((material) => ({ design: design.title, material, qty: 1, price: UNIT })) : [];
  const total = lines.length * UNIT;

  const gstinOk = !form.gstin.trim() || gstinChecksumOk(form.gstin);
  // A WhatsApp-reachable Indian mobile is required. The ₹200 swatch is the
  // first step of a ₹25–40k made-to-measure order, and that order closes in a
  // conversation (the April 2025 sample→order SOP: a call within three days).
  // With phone optional, most samples arrived with nothing to follow up on.
  const phoneE164 = normalisePhone(form.phone);
  const phoneOk = !!phoneE164 && /^\+91[6-9]\d{9}$/.test(phoneE164);
  const valid =
    !!design &&
    finishes.size > 0 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) &&
    form.name.trim() &&
    phoneOk &&
    form.line1.trim() &&
    form.city.trim() &&
    /^[1-9]\d{5}$/.test(form.pincode.trim()) &&
    gstinOk && (!form.gstin.trim() || form.billingName.trim().length >= 2);

  const order = async () => {
    if (!valid || busy || paymentOpen || !paymentsOpen || !design) return;
    const paymentToken=sampleSession();
    const finishesAtOrder = [...finishes];
    setBusy(true);
    setError(null);
    gaEvent("sample_checkout_start", { item_id: design.handle, currency: "INR", value: total });
    try {
      const res = await fetch("/api/sample-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token:paymentToken, countryCode:market.countryCode,
          email: form.email.trim(),
          name: form.name.trim(),
          phone: phoneE164,
          gstin: form.gstin.trim().toUpperCase() || null,
          billingName: form.billingName.trim() || null,
          design: { handle: design.handle, title: design.title },
          finishes: finishesAtOrder,
          address: { line1: form.line1, city: form.city, state: form.state, pincode: form.pincode },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        gaEvent("sample_payment_error", { stage: "order_initialization", item_id: design.handle });
        setError(
          data?.error === "payment_init_failed"
            ? "We couldn't start the secure payment just now — please try again in a moment."
            : data?.error === "design_not_sampleable"
              ? `${SAMPLE_SCOPE_NOTE} Please pick one of those designs.`
              : data.error || "Something went wrong — please try again.",
        );
        return;
      }

      if(data.paid){await checkPayment();return;}
      setPending(true);
      sessionStorage.setItem(SAMPLE_SESSION_KEY+'-started','1');
      // Order accepted with this contact + address — remember it so checkout
      // (or a second sample order) doesn't ask again in this browser.
      writeSavedContact({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        line1: form.line1.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
      });

      const rzp: RazorpayInfo | null = data.razorpay ?? null;
      if (rzp) {
        const ready = await loadRazorpay();
        if (!ready) {
          gaEvent("sample_payment_error", { stage: "payment_script", item_id: design.handle });
          setError("Couldn't load the payment window — please try again.");
          return;
        }
        const RZP = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
        const rp = new RZP({
          key: rzp.keyId,
          order_id: rzp.razorpayOrderId,
          amount: rzp.amount,
          currency: "INR",
          name: "Mimi Pip",
          description: `${design.title} sample${finishesAtOrder.length > 1 ? "s" : ""} · order #${data.orderNumber}`,
          prefill: { name: form.name, email: form.email, contact: form.phone },
          theme: { color: "#1a1a1a" },
          handler: async (resp: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const v = await fetch("/api/checkout/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({token:paymentToken,...resp}),
              });
              const verified = await v.json();
              if (v.ok && verified.paid) {
                const paidAmount = Number(data.amount);
                const transactionId = `sample-${data.orderNumber}`;
                gaSamplePurchase({
                  transactionId,
                  amount: paidAmount,
                  designHandle: design.handle,
                  designTitle: design.title,
                  finishes: finishesAtOrder,
                  user: { email: form.email, phone: form.phone },
                });
                if (!isInternalOrder(form.email) && Number.isFinite(paidAmount) && paidAmount > 0) {
                  const value = exGst(paidAmount);
                  metaSamplePurchase({
                    pixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID,
                    orderId: transactionId,
                    currency: "INR",
                    value,
                    shipping: 0,
                    tax: paidAmount - value,
                    handles: [design.handle],
                  });
                  // A paid sample is a real order — the same rupees Meta is
                  // told about, told to OpenAI. `paidAmount` is already the
                  // GST-inclusive total the card was charged.
                  openAiIdentify({ email: form.email, phone: form.phone });
                  openAiOrderCreated({
                    orderId: transactionId,
                    currency: "INR",
                    amount: paidAmount,
                    contents: [{ id: metaContentId(design.handle), name: design.title, quantity: 1, amount: paidAmount }],
                  });
                }
                setPlaced({ orderNumber: data.orderNumber, paymentPending: false });
                sessionStorage.removeItem(SAMPLE_SESSION_KEY);sessionStorage.removeItem(SAMPLE_SESSION_KEY+'-started');setPending(false);
              } else {
                gaEvent("sample_payment_error", { stage: "verification_response", item_id: design.handle });
                setError(
                  "We couldn't confirm your payment. If money was deducted, email hello@mimipip.com with order #" +
                    data.orderNumber + ".",
                );
              }
            } catch {
              gaEvent("sample_payment_error", { stage: "verification_network", item_id: design.handle });
              setError("We couldn’t confirm payment. If charged, contact hello@mimipip.com with order #" + data.orderNumber + " before paying again.");
            } finally {setPaymentOpen(false);}
          },
          modal: {
            ondismiss: () => {
              setPaymentOpen(false);
              gaEvent("sample_payment_cancel", { item_id: design.handle });
              setError("Payment has not been confirmed — check your sample order (#" + data.orderNumber + ").");
            },
          },
        });
        gaEvent("sample_payment_open", { item_id: design.handle });
        setPaymentOpen(true);
        try {rp.open();} catch(error){setPaymentOpen(false);throw error;}
        return;
      }

      // A successful response always carries a Razorpay order to pay now. If it
      // somehow didn't, treat it as a payment failure — never claim a link is
      // on its way.
      setError("We couldn't start the secure payment just now — please try again in a moment.");
    } catch {
      setError("Couldn't reach the store just now — please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (placed) {
    return (
      <div className="rounded-[18px] border border-edge bg-sage/30 p-6">
        <p className="font-display text-lg font-bold">Sample order #{placed.orderNumber} placed ✦</p>
        <p className="mt-2 text-sm text-slate">
          {placed.paymentPending
            ? "Your order is saved. Please check payment status before paying again."
            : "Payment received. Your sample order is confirmed."}
        </p>
      </div>
    );
  }

  // Samples are cut, printed and posted within India, and charged in rupees.
  // Wherever this form is embedded — the materials page, the sample modal — it
  // must say so abroad rather than put a shopper through a rupee checkout that
  // cannot ship to them. The CTAs that open it are gated too (ProductGallery,
  // ProductConfigurator); this is the last line of defence for any that is not.
  if (marketReady && market.countryCode !== "IN") {
    return (
      <div className="rounded-[18px] border border-edge bg-surface p-6">
        <p className="font-display text-lg font-bold">Design samples</p>
        <p className="mt-1 text-sm text-slate">
          Design samples are prepared and posted within India only, so we cannot send one to{" "}
          {market.countryName} yet. Every design is prepared for your order at full production quality, and
          your order price includes international delivery.
        </p>
        <p className="mt-3 rounded-[12px] bg-wash px-4 py-3 text-xs leading-relaxed text-slate">
          If you would like to judge colour or finish before committing, tell us the design and the
          room and we will send close-up photography of the finished material.{" "}
          <a href="/contact" className="link-underline">Talk to us</a>.
        </p>
      </div>
    );
  }

  const field = "h-11 w-full rounded-[12px] border border-edge bg-surface px-4 text-sm outline-none focus:border-charcoal";

  return (
    <div className="rounded-[18px] border border-edge bg-surface p-6">
      <p className="font-display text-lg font-bold">Order a design sample</p>
      <p className="mt-1 text-sm text-slate">
        {formatINR(UNIT)} per design, on our Soft Matte wallpaper finish. Available for delivery within India.
      </p>

      {/* unambiguous scope of what a sample is */}
      <p className="mt-3 rounded-[12px] bg-wash px-4 py-3 text-xs leading-relaxed text-slate">
        Your A4 sample shows the selected design on Soft Matte, so you can see its colour, detail and finish before choosing your wallpaper.
      </p>

      {/* design — locked (product page) or searchable (standalone) */}
      <p className="caps mt-4 mb-2 text-slate">Design</p>
      {design ? (
        <div className="flex items-center justify-between gap-3 rounded-[12px] border-2 border-charcoal px-4 py-2.5 text-sm">
          <span className="font-semibold">{design.title}</span>
          {!locked && (
            <button
              type="button"
              onClick={() => { setDesign(null); setQuery(""); }}
              className="text-xs text-slate underline underline-offset-2 hover:text-charcoal"
            >
              Change
            </button>
          )}
        </div>
      ) : (
        <div>
          {/* The sampleable set is one collection, so the list is BROWSABLE
              rather than a blind search box — a customer who doesn't know a
              design by name can still pick one. Search narrows the same set. */}
          <p className="mb-2 text-xs text-slate">{SAMPLE_SCOPE_NOTE}</p>
          <input
            className={field}
            placeholder="Search these designs by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-2 max-h-64 overflow-y-auto rounded-[12px] border border-edge">
            {searching ? (
              <p className="px-4 py-3 text-xs text-slate">Searching…</p>
            ) : results.length ? (
              results.map((r) => (
                <button
                  key={r.handle}
                  type="button"
                  onClick={() => { setDesign(r); setQuery(""); }}
                  className="flex w-full items-center gap-3 border-b border-edge px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-wash"
                >
                  {r.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" className="h-9 w-9 shrink-0 rounded-[6px] object-cover" />
                  )}
                  {r.title}
                </button>
              ))
            ) : (
              <p className="px-4 py-3 text-xs text-slate">
                {query.trim() ? `No sampleable design matches “${query}”.` : "Loading designs…"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* finishes */}
      <p className="caps mt-4 mb-2 text-slate">Finishes to include</p>
      <div className="space-y-2">
        {SAMPLE_FINISHES.map((f) => (
          <label key={f.name} className={`flex cursor-pointer items-center gap-3 rounded-[12px] border-2 px-4 py-2.5 text-sm ${finishes.has(f.name) ? "border-charcoal" : "border-edge"}`}>
            <input type="checkbox" checked={finishes.has(f.name)} onChange={() => toggleFinish(f.name)} className="accent-charcoal" />
            <span>
              {f.label}
              <span className="block text-xs text-slate">{f.blurb}</span>
            </span>
          </label>
        ))}
      </div>

      {/* explicit line-item table — exactly what's being bought */}
      {lines.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-[12px] border border-edge">
          <table className="w-full table-fixed text-xs sm:text-sm">
            <colgroup><col className="w-[38%]" /><col className="w-[28%]" /><col className="w-[12%]" /><col className="w-[22%]" /></colgroup>
            <thead>
              <tr className="border-b border-edge bg-wash text-left text-[0.68rem] font-semibold uppercase tracking-wide text-mist">
                <th className="break-words px-1.5 py-2 sm:px-3">Design</th>
                <th className="break-words px-1.5 py-2 sm:px-3">Material</th>
                <th className="break-words px-1.5 py-2 sm:px-3 text-center">Qty</th>
                <th className="break-words px-1.5 py-2 sm:px-3 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className={i > 0 ? "border-t border-edge" : ""}>
                  <td className="break-words px-1.5 py-2 sm:px-3">{l.design}</td>
                  <td className="break-words px-1.5 py-2 sm:px-3 text-slate">{l.material}</td>
                  <td className="break-words px-1.5 py-2 sm:px-3 text-center tabular-nums">{l.qty}</td>
                  <td className="break-words px-1.5 py-2 sm:px-3 text-right font-semibold tabular-nums">{formatINR(l.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* contact + address */}
      <div className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={field} placeholder="Full name" value={form.name} onChange={set("name")} />
          <input className={field} type="tel" inputMode="tel" autoComplete="tel" placeholder="WhatsApp number" aria-label="WhatsApp number, for delivery updates" value={form.phone} onChange={set("phone")} />
        </div>
        {/* Consent for the follow-up call (src/lib/voice-followup.ts): said
            where the number is given, before it is given. */}
        <p className="text-xs text-charcoal/70">We may call or WhatsApp you about your order. Our assistant may be an AI; reply STOP anytime.</p>
        {form.phone.trim() && !phoneOk && (
          <p className="rounded-[12px] bg-blush/50 px-3 py-2 text-xs text-charcoal">Enter a 10-digit Indian mobile number for delivery enquiries.</p>
        )}
        <input className={field} type="email" placeholder="Email" value={form.email} onChange={set("email")} />
        <input className={field} placeholder="Address" value={form.line1} onChange={set("line1")} />
        <div className="grid gap-3 sm:grid-cols-3">
          <input className={field} placeholder="City" value={form.city} onChange={set("city")} />
          <input className={field} placeholder="State" value={form.state} onChange={set("state")} />
          <input className={field} placeholder="PIN code" inputMode="numeric" maxLength={6} value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "") }))} />
        </div>
        <input
          className={`${field} ${form.gstin.trim() && !gstinOk ? "border-blush" : ""}`}
          placeholder="GSTIN (optional — for a GST invoice)"
          value={form.gstin}
          maxLength={15}
          autoCapitalize="characters"
          onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase().slice(0, 15) }))}
        />
        {form.gstin.trim() && <input className={field} aria-label="Registered business name" placeholder="Registered business name" value={form.billingName} maxLength={200} onChange={set("billingName")} />}
        {form.gstin.trim() && !gstinOk && (
          <p className="text-xs text-charcoal/80">Please enter a valid 15-character GSTIN.</p>
        )}
      </div>

      {/* mini-invoice — GST backed out of each ₹200 line */}
      {lines.length > 0 && (
        <div className="mt-5 rounded-[14px] bg-wash p-4">
          <InvoiceBreakdown
            lines={lines.map((l) => ({ label: `${l.design} — ${l.material}`, incl: l.price }))}
          />
        </div>
      )}

      {error && <p className="mt-3 rounded-[12px] bg-blush/50 px-4 py-3 text-sm text-charcoal">{error}</p>}

      <button onClick={order} disabled={!valid || busy || paymentOpen || !paymentsOpen} className="btn mt-5 h-12 w-full text-[0.82rem] disabled:opacity-40">
        {busy ? "Processing…" : lines.length ? `Pay ${formatINR(total)} · order ${lines.length} sample${lines.length > 1 ? "s" : ""}` : "Select a design and finish"}
      </button>
      {!paymentsOpen && <p role="status" className="mt-3 text-sm text-slate">Sample ordering is not available yet. <a href="/contact" className="underline">Ask us for a close-up of your design.</a></p>}
      {pending && <button type="button" onClick={()=>void checkPayment()} disabled={busy||paymentOpen} className="mt-3 w-full text-sm underline">Check payment status</button>}
      <p className="mt-2 text-center text-xs text-mist">Free delivery across India · secure payment via Razorpay</p>
    </div>
  );
}
