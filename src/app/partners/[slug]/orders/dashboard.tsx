"use client";

import AccountWorkspace, { type WorkspaceAccess } from "@/components/partners/account-workspace";
import OrderBoard from "@/components/partners/order-board";
import WaitingOnYou, { type WaitingOrder } from "@/components/partners/waiting-on-you";
import { PROPOSAL_ROW_PREFIX, proposalBoardRows, type BoardDocument, type BoardOrder, type ProposalBatch } from "@/lib/partner-order-board";
import { uploadOrderWallPhoto } from "@/lib/order-wall-photo-client";
import type { PartnerInstallation, PartnerInstallerOption } from "@/lib/corporate-os";
import Image from "@/components/SiteImage";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type OsStatus = {
  printStatus: string | null;
  stage: string | null;
  panels: number | null;
  printOrderNo: string | null;
  designRef: string | null;
  approvedAt: string | null;
  printingAt: string | null;
  printedAt: string | null;
  /** Printing finished AND checked — boxed, waiting on a courier. */
  labelReleasedAt: string | null;
  dispatchedAt: string | null;
  /** The courier's delivered scan (Delhivery's OTP handover). */
  deliveredAt?: string | null;
  podNo: string | null;
  courier: string | null;
  trackingUrl: string | null;
};

/** What an order needs, whose move it is, and how long it has waited — the
 *  three things the old "our team is on it" badge never said. */
type Attention = {
  headline: string;
  reason: string;
  party: "zyvorah" | "production";
  since: string | null;
  hours: number | null;
  waiting: string | null;
  overdue: boolean;
  escalatedAt: string | null;
};

/** A document the OS holds for this account — the same list the desk sees. */
type AccountDocument = {
  orderId?: number | null;
  groupRef?: string | null;
  id: number;
  kind: "quotation" | "proforma" | "tax";
  number: string;
  status: string | null;
  batchRef: string | null;
  grandTotal: number | null;
  taxableTotal: number | null;
  ratesIncludeGst: boolean | null;
  createdAt: string | null;
  sentAt: string | null;
};

/** A wall of theirs that was taken at our desk rather than through the portal.
 *  It has no corporate_orders row, so it can be shown but not acted on. */
type DeskOrder = {
  groupRef?: string | null;
  poNumber?: string | null;
  stageLabel?: string;
  os?: OsStatus | null;
  installation?: PartnerInstallation | null;
  osOrderId: number;
  printOrderNo: string | null;
  printName: string | null;
  widthMm: number | null;
  heightMm: number | null;
  printStatus: string | null;
  batchRef: string | null;
  dispatchedAt: string | null;
  createdAt: string | null;
};

type Order = {
  service_breakdown?: { wallpaper: number; customisation: number; total: number } | null;
  batchRef?: string | null;
  os_order_id?: number | null;
  installation?: PartnerInstallation | null;
  id: string;
  order_ref: string;
  /** The ZVY number, persisted from the OS once production knows it. */
  os_print_order_no: string | null;
  print_name: string | null;
  po_number: string | null;
  design_url: string;
  width_mm: number;
  height_mm: number;
  area_sqft: number | null;
  total: number | null;
  list_amount: number | null;
  discount_pct: number | null;
  discount_amount: number | null;
  state: string | null;
  ship_city: string | null;
  placed_by_email: string;
  created_at: string;
  cancel_requested_at: string | null;
  cancel_resolved_at: string | null;
  cancel_outcome: string | null;
  group_ref: string | null;
  status: string;
  frozen_at: string | null;
  /** 'paid' is written only by the verified Razorpay webhook — the browser
   *  callback never sets it, it just refreshes until this flips. */
  payment_status: "created" | "paid" | null;
  razorpay_payment_id: string | null;
  paid_at: string | null;
  proposal_url: string | null;
  proposal_valid_until: string | null;
  po_url: string | null;
  /** Showroom sign-off (migration 0125): the client-facing order copy at the
   *  SELLING price, and whether the client has signed it on-screen. */
  client_quote_url: string | null;
  client_signed_at: string | null;
  os: OsStatus | null;
  stageLabel: string;
  attention: Attention | null;
  /** Server's answer: nothing of this wall is at the printer (lib/cancel-window.ts). */
  canRequestCancel?: boolean;
  /** The photo of the wall this print is for, if one was added. */
  wall_photo_path?: string | null;
  wall_photo_at?: string | null;
};

/** One thing to look at full-size, in the app. `kind` decides how it renders:
 *  a raster goes in an <img>, a PDF in an <object>. */
type Viewing = { title: string; src: string; kind: "image" | "pdf" };

// Load Razorpay Checkout script once — same pattern as the retail checkout.
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// Five real milestones, not four (Roheena 2026-07-29). "Printed" used to cover
// both the run coming off the machine and the checked, boxed piece waiting on a
// courier — so the wait before dispatch looked like nothing was happening. Each
// step maps to a state the OS genuinely records, with its own date.
// Six since 25 Oct 2026: "Delivered" is the courier's own scan (the OTP the
// consignee gives the Delhivery rider), the moment the install sheet is emailed.
const STAGES = ["Rendering", "Pending printing", "Printing complete", "Awaiting pickup", "Dispatched", "Delivered"] as const;

/** The date each milestone actually happened, so the rail states facts rather
 *  than just lighting up. Ordered to match STAGES. */
function stageDates(os: OsStatus | null): Array<string | null> {
  return [
    os?.approvedAt ?? null,
    os?.printingAt ?? null,
    os?.printedAt ?? null,
    os?.labelReleasedAt ?? null,
    os?.dispatchedAt ?? null,
    os?.deliveredAt ?? null,
  ];
}
const dayMon = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : null;

const inr = (n: number | null) =>
  n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
/**
 * The one number a partner should ever see: ZVY-10719.
 *
 * `order_ref` (VS-000090 / MOCO-000042) was a second, portal-only series for
 * the same order — so every job carried two numbers and neither side could
 * quote the other's. The ZVY number is what the OS, the job sheet, the courier
 * label and the invoice all carry, so it is the reference here too. Live status
 * wins over the stored copy (production is the truth); `order_ref` shows only
 * until the first status sync knows the number, and never as a rival to it.
 */
const orderRef = (o: { os_print_order_no?: string | null; order_ref: string; os?: { printOrderNo?: string | null } | null }) =>
  o.os?.printOrderNo ?? o.os_print_order_no ?? o.order_ref;

const ftIn = (mm: number) => {
  const t = mm / 25.4, f = Math.floor(t / 12), i = Math.round(t - f * 12);
  return i === 12 ? `${f + 1} ft` : i ? `${f} ft ${i} in` : `${f} ft`;
};

export default function OrdersDashboard({
  slug, accountName, logoPath, email, installName, installPhone, workspace,
}: {
  workspace?: WorkspaceAccess;
  slug: string;
  accountName: string;
  logoPath: string | null;
  email: string;
  installName: string | null;
  installPhone: string | null;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [documents, setDocuments] = useState<AccountDocument[]>([]);
  const [installerOptions, setInstallerOptions] = useState<PartnerInstallerOption[]>([]);
  const [deskOrders, setDeskOrders] = useState<DeskOrder[]>([]);
  // Store proposals waiting on this account's approval (EBD Gurgaon, 25 Oct 2026).
  const [proposals, setProposals] = useState<ProposalBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [documentQuery, setDocumentQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Artwork and documents open INSIDE the portal (Roheena 2026-08-11) — a 64 px
  // thumbnail and a link that throws you into a new tab is not "seeing" the
  // thing you are about to spend money printing.
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  // Dispatched orders are done — nothing left to act on or watch. Once a
  // partner has a few weeks of history the board is mostly finished business,
  // burying the handful of orders that actually need eyes on them. Collapsed
  // by default; one click opens it back up for the session.
  const [showDispatched, setShowDispatched] = useState(false);

  // Esc closes the viewer — a modal you can only leave by aiming at a small ×
  // is the kind that gets called broken.
  useEffect(() => {
    if (!viewing) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    viewerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewing(null);
      if (e.key !== "Tab") return;
      const items = Array.from(viewerRef.current?.querySelectorAll<HTMLElement>("a[href], button, iframe") ?? []);
      const first = items[0], last = items[items.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previousFocus?.focus(); };
  }, [viewing]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/corporate/orders", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 401 ? "Your session has expired. Sign in again to refresh this account." : "Could not refresh the account. Your last loaded orders remain below.");
      const j = await r.json();
      if (j.accountSlug && j.accountSlug !== slug) {
        // Leave the stale form context too: a new order must never be submitted
        // under a different account from the one displayed when it was prepared.
        window.location.assign(`/partners/${slug}${window.location.hash}`);
        return;
      }
      setOrders((j.orders ?? []) as Order[]);
      setDocuments((j.documents ?? []) as AccountDocument[]);
      setDeskOrders((j.deskOrders ?? []) as DeskOrder[]);
      setInstallerOptions(j.installerOptions ?? []);
      // A proposal is a shortcut onto the board: its read failing never blanks the orders.
      void fetch("/api/corporate/site-batch", { cache: "no-store" })
        .then(b => (b.ok ? b.json() : null))
        .then(b => { if (b) setProposals((b.batches ?? []) as ProposalBatch[]); })
        .catch(() => {});
      setUpdatedAt(new Date().toISOString()); setLoadError(null);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Could not refresh the account."); }
    finally { setLoading(false); }
  }, [slug]);

  useEffect(() => {
    void load();
    // Production status moves without us — keep the board fresh.
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  /** A repeat is a NEW order to a destination the person chooses. It used to
   *  be placed here in one click, inheriting the parent's state with no
   *  address — which is how ZVY-20476 (meant for Virar) was recorded for
   *  Ahmedabad and boxed with a Shahibaug wall. The form pre-fills the
   *  artwork and size; step 2 (where it ships) is left to be answered. */
  function repeat(o: Order) {
    window.location.assign(`/partners/${slug}/new?repeat=${encodeURIComponent(o.id)}`);
  }

  /** Build (or rebuild) the client-facing proposal PDF, optionally emailing it
   *  straight to the partner's own customer. */
  async function makeProposal(o: Order, send: boolean) {
    const sendTo = send
      ? prompt(`Email the proposal for ${orderRef(o)} to your client:\n\nTheir email address`)?.trim()
      : "";
    if (send && !sendTo) return;
    setBusy(o.id);
    try {
      const r = await fetch(`/api/corporate/orders/${o.id}/proposal`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendTo ? { sendTo } : {}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not build the proposal.");
      await load();
      if (j.warning) alert(j.warning);
      else if (j.emailed) alert(`Proposal sent to ${sendTo}.`);
      else if (j.proposalUrl) window.open(j.proposalUrl, "_blank", "noopener");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not build the proposal.");
    } finally { setBusy(null); }
  }

  /** Commit the quote: locks the price and releases it to production (or to the
   *  payment gate). Irreversible from the partner's side, so it confirms. */
  async function freeze(o: Order) {
    if (!confirm(
      `Confirm ${orderRef(o)} and lock the price?\n\n` +
      `${o.print_name || "Custom wall"} · ${ftIn(o.width_mm)} × ${ftIn(o.height_mm)} · ${inr(o.total)}\n\n` +
      `Once confirmed the price is fixed and we begin processing. You cannot edit it after this.`,
    )) return;
    setBusy(o.id);
    try {
      const r = await fetch(`/api/corporate/orders/${o.id}/freeze`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not confirm the order.");
      await load();
      alert(j.warning ?? (j.paymentFirst
        ? `${orderRef(o)} confirmed. Pay right here with the Pay now button (card / UPI / netbanking), or use the UPI QR on the proforma invoice that's on its way — printing starts once payment reaches us.`
        : `${orderRef(o)} confirmed and sent to production.`));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not confirm the order.");
    } finally { setBusy(null); }
  }

  /** Keep refreshing until the webhook lands (the webhook — never this
   *  browser — is what marks the order paid and releases production). */
  async function pollPaid(orderId: string) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3_000));
      const r = await fetch("/api/corporate/orders", { cache: "no-store" });
      if (!r.ok) continue;
      const list = ((await r.json()).orders ?? []) as Order[];
      setOrders(list);
      if (list.find((x) => x.id === orderId)?.payment_status === "paid") {
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    alert("Payment received — the confirmation is on its way. This page updates on its own; printing starts the moment it lands.");
  }

  /** Pay a frozen order by card/UPI/netbanking. The server computes the amount
   *  from the frozen price and returns a Razorpay order; standard Razorpay
   *  Checkout collects it. Confirmation comes from the webhook, not from here. */
  async function payNow(o: Order) {
    setBusy(o.id);
    try {
      const r = await fetch(`/api/corporate/orders/${o.id}/pay`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not start the payment.");
      const ready = await loadRazorpay();
      if (!ready) throw new Error("Couldn't load the payment window — please try again.");
      const RZP = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
      new RZP({
        key: j.keyId,
        order_id: j.razorpayOrderId,
        amount: j.amount,
        currency: "INR",
        name: "Zyvorah",
        description: `${o.print_name || "Print order"} · ${orderRef(o)}`,
        prefill: { name: accountName, email },
        theme: { color: "#1a1a1a" },
        // The callback only triggers a refresh — the verified webhook is the
        // sole authority on "paid", so a spoofed callback can release nothing.
        handler: () => { void pollPaid(o.id); },
        modal: { ondismiss: () => setBusy(null) },
      }).open();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start the payment.");
      setBusy(null);
    }
  }

  async function uploadPo(o: Order, file: File) {
    setBusy(o.id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const poNumber = prompt("PO number (optional)")?.trim();
      if (poNumber) fd.append("poNumber", poNumber);
      const r = await fetch(`/api/corporate/orders/${o.id}/po`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not upload the PO.");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not upload the PO.");
    } finally { setBusy(null); }
  }

  /** The wall this print is for, photographed — added or replaced any time;
   *  the installer's sheet carries it. */
  async function sendWallPhoto(o: Order, file: File) {
    setBusy(o.id);
    try {
      await uploadOrderWallPhoto(o.id, file);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "That photo didn't save.");
    } finally { setBusy(null); }
  }

  async function requestCancel(o: Order) {
    if (!confirm(`Request cancellation of ${orderRef(o)}?\n\nOur team will confirm.`)) return;
    setBusy(o.id);
    const r = await fetch(`/api/corporate/orders/${o.id}/cancel`, { method: "POST" });
    if (!r.ok) alert(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not request the cancellation.");
    await load();
    setBusy(null);
  }

  /**
   * The fitter's copy of a job — the design, its finished size, and how many
   * strips it came in, one page per piece.
   *
   * It opens in the portal viewer like the proposal and the invoice do, so it
   * can be read here, opened in a tab, or downloaded and sent on: the installer
   * who trimmed the header strips off every Shahibaug roll needs it on
   * WhatsApp, not behind a login he does not have.
   */
  function openInstallSheet(sel: { order?: string; group?: string; po?: string }, title: string) {
    const q = new URLSearchParams(
      Object.entries(sel).filter(([, v]) => v) as [string, string][],
    );
    setViewing({ title, src: `/api/corporate/orders/install-sheet?${q}`, kind: "pdf" });
  }

  /** Printed lines sharing one purchase order. A partner's PO is one store's
   *  job — the fourteen Shahibaug walls carry one — so the whole set is worth
   *  one sheet rather than fourteen clicks. */
  const poSet = (o: Order) =>
    o.po_number
      ? orders.filter((x) => x.po_number === o.po_number && (x.os?.printOrderNo ?? x.os_print_order_no))
      : [];

  // Walls placed together (one group_ref) read as ONE project, not strays.
  // Order preserved: a block sits where its newest line would have.
  const blocks: Array<{ groupRef: string | null; items: Order[] }> = [];
  for (const o of orders) {
    const hit = o.group_ref ? blocks.find((b) => b.groupRef === o.group_ref) : undefined;
    if (hit) hit.items.push(o);
    else blocks.push({ groupRef: o.group_ref, items: [o] });
  }


  // Done and quiet — every wall in the block dispatched, and nothing about
  // it is asking for attention (a dispatched order shouldn't have any, but
  // this is the one place that matters if it ever does). A part-dispatched
  // project stays active — it isn't finished yet.
  const isDispatched = (o: Order) => (o.stageLabel === "Dispatched" || o.stageLabel === "Delivered") && !o.attention;
  const activeBlocks = blocks.filter((b) => !b.items.every(isDispatched));
  const dispatchedBlocks = blocks.filter((b) => b.items.every(isDispatched));

  /** One order/project block, unchanged from how it always rendered — pulled
   *  into its own function so the active list and the collapsed dispatched
   *  list can share it instead of duplicating ~250 lines of markup. */
  function renderBlock(blk: { groupRef: string | null; items: Order[] }) {
            const cards = blk.items.map((o) => {
            const stageIdx = STAGES.indexOf(o.stageLabel as typeof STAGES[number]);
            const attention = o.stageLabel === "Needs attention";
            const isDraft = o.stageLabel === "Draft";
            const awaitingPayment = o.stageLabel === "Awaiting payment";
            const paid = o.payment_status === "paid";
            // The money is verified but the OS mirror hasn't caught up yet —
            // the server relabels it so nobody reads "Awaiting payment" on
            // an order they just paid.
            const paidInProduction = o.stageLabel === "Paid — in production";
            return (
              <div key={o.id} className="rounded-[18px] border border-edge bg-surface p-5">
                <div className="flex flex-wrap items-start gap-4">
                  {/* Via the proxy: library and uploaded art sit in a private
                      bucket. Click to see it full-size without leaving the
                      portal — at 64 px you cannot check what you are printing. */}
                  <button type="button"
                    onClick={() => setViewing({
                      title: `${o.print_name || "Artwork"} · ${orderRef(o)}`,
                      src: `/api/corporate/orders/${o.id}/image`,
                      kind: "image",
                    })}
                    className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-[12px] border border-edge"
                    aria-label={`View artwork for ${o.print_name || orderRef(o)} full size`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/corporate/orders/${o.id}/image`} alt=""
                      className="h-full w-full object-cover transition group-hover:opacity-70" />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-charcoal/0 text-[10px] font-bold text-white opacity-0 transition group-hover:bg-charcoal/55 group-hover:opacity-100">
                      View
                    </span>
                  </button>
                  {/* The wall it goes on. Tapping an empty tile adds one; a
                      photo opens full-size, with Replace under it. */}
                  <div className="flex shrink-0 flex-col items-center gap-0.5">
                    {o.wall_photo_path ? (
                      <button type="button"
                        onClick={() => setViewing({
                          title: `Wall photo · ${o.print_name || "Untitled print"} · ${orderRef(o)}`,
                          src: `/api/corporate/orders/${o.id}/wall-photo?v=${encodeURIComponent(o.wall_photo_at ?? "")}`,
                          kind: "image",
                        })}
                        className="group relative h-16 w-24 overflow-hidden rounded-[12px] border border-edge"
                        aria-label={`View the wall photo for ${o.print_name || orderRef(o)}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/corporate/orders/${o.id}/wall-photo?v=${encodeURIComponent(o.wall_photo_at ?? "")}`} alt=""
                          className="h-full w-full object-cover transition group-hover:opacity-70" />
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-charcoal/55 py-0.5 text-center text-[9px] font-bold text-white">
                          Wall
                        </span>
                      </button>
                    ) : (
                      <label className={`flex h-16 w-24 cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-edge text-center text-[10px] font-semibold text-slate hover:bg-wash ${busy === o.id ? "pointer-events-none opacity-40" : ""}`}>
                        <span>+ Wall photo</span>
                        <span className="font-normal text-mist">where it goes</span>
                        <input type="file" accept="image/*" hidden disabled={busy === o.id}
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void sendWallPhoto(o, f); }} />
                      </label>
                    )}
                    {o.wall_photo_path && (
                      <label className={`cursor-pointer text-[10px] text-slate underline ${busy === o.id ? "pointer-events-none opacity-40" : ""}`}>
                        {busy === o.id ? "Uploading…" : "replace"}
                        <input type="file" accept="image/*" hidden disabled={busy === o.id}
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void sendWallPhoto(o, f); }} />
                      </label>
                    )}
                  </div>
                  <div className="min-w-[210px] flex-1">
                    <p className="font-display text-base font-bold leading-tight">
                      {o.print_name || "Untitled print"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate">
                      <span className="font-mono">{orderRef(o)}</span>
                      {o.po_number ? <> · PO {o.po_number}</> : null}
                      {" · "}{ftIn(o.width_mm)} × {ftIn(o.height_mm)}
                      {o.area_sqft ? <> · {Number(o.area_sqft).toFixed(1)} sq ft</> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-mist">
                      {o.ship_city ? `${o.ship_city}, ` : ""}{o.state ?? "—"} · placed by <span className="text-charcoal">{o.placed_by_email}</span>
                      {" · "}{new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-display text-lg font-bold">{inr(o.total)}</p>
                    {o.service_breakdown && <p className="mt-1 text-xs text-slate">Wallpaper {inr(o.service_breakdown.wallpaper)} + customisation {inr(o.service_breakdown.customisation)} (no discount). GST included.</p>}
                    <p className="text-[11px] text-mist">incl. GST</p>
                  </div>
                </div>

                <InstallationStatus installation={o.installation} />
                {!isDraft && o.os_order_id && <InstallerChoice orderId={o.os_order_id} options={installerOptions} onAssigned={load} />}

                {/* Draft: quote your client, then commit. */}
                {isDraft && (
                  <div className="mt-4 rounded-[14px] border border-dashed border-edge bg-wash p-3">
                    <p className="text-xs text-slate">
                      Draft — not sent to production yet. Share the proposal with your client, then confirm to lock the price.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button onClick={() => void makeProposal(o, false)} disabled={busy === o.id || Boolean(workspace && !workspace.form?.canOrder)}
                        className="rounded-full border border-edge px-3 py-1.5 text-xs font-semibold disabled:opacity-40">
                        {o.proposal_url ? "Rebuild proposal PDF" : "Create proposal PDF"}
                      </button>
                      <button onClick={() => void makeProposal(o, true)} disabled={busy === o.id || Boolean(workspace && !workspace.form?.canOrder)}
                        className="rounded-full border border-edge px-3 py-1.5 text-xs font-semibold disabled:opacity-40">
                        Email it to my client
                      </button>
                      {/* The screen you turn to face your client: selling
                          price only, sign on the glass. Their cost chain
                          never renders on that page. */}
                      <Link href={`/partners/${slug}/quote/${o.id}`}
                        className="rounded-full border border-edge px-3 py-1.5 text-xs font-semibold">
                        Showroom sign-off
                      </Link>
                      <button onClick={() => void freeze(o)} disabled={busy === o.id || Boolean(workspace && !workspace.form?.canOrder)}
                        className="btn h-8 rounded-full px-4 text-xs disabled:opacity-40">
                        Confirm &amp; lock price
                      </button>
                    </div>
                  </div>
                )}

                {/* Documents trail — proposal, PO, and what they still owe us. */}
                {(o.proposal_url || o.po_url || o.client_quote_url || awaitingPayment) && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    {/* Both documents sit in a private bucket, so the link is
                        a gated route that signs a fresh URL per click rather
                        than a stored one that would expire. */}
                    {/* Open in the portal by default; the modal still offers
                        a new tab and a download for anyone who wants one. */}
                    {o.proposal_url && (
                      <button type="button" className="underline"
                        onClick={() => setViewing({
                          title: `Proposal · ${orderRef(o)}`,
                          src: `/api/corporate/orders/${o.id}/proposal`,
                          kind: "pdf",
                        })}>
                        Proposal PDF
                      </button>
                    )}
                    {o.client_quote_url && (
                      <button type="button" className="underline"
                        onClick={() => setViewing({
                          title: `Client order copy · ${orderRef(o)}`,
                          src: `/api/corporate/orders/${o.id}/client-quote`,
                          kind: "pdf",
                        })}>
                        Client order copy{o.client_signed_at ? " (signed)" : ""}
                      </button>
                    )}
                    {o.po_url && (
                      <button type="button" className="underline"
                        onClick={() => setViewing({
                          title: `Purchase order · ${orderRef(o)}`,
                          src: `/api/corporate/orders/${o.id}/po`,
                          kind: "pdf",
                        })}>
                        Purchase order
                      </button>
                    )}
                    {!o.po_url && !isDraft && (
                      <label className="cursor-pointer text-slate underline">
                        Attach a PO
                        <input type="file" accept=".pdf,image/*" hidden
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPo(o, f); e.target.value = ""; }} />
                      </label>
                    )}
                    {o.proposal_valid_until && isDraft && (
                      <span className="text-mist">Quote held until {new Date(o.proposal_valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span>
                    )}
                  </div>
                )}

                {awaitingPayment && !paid && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-amber-50 px-3 py-2">
                    <p className="text-xs text-amber-900">
                      Awaiting payment — pay now by card, UPI or netbanking, or scan the UPI QR on your proforma invoice. Printing begins the moment it reaches us.
                    </p>
                    <button onClick={() => void payNow(o)} disabled={busy === o.id || Boolean(workspace && !workspace.form?.canOrder)}
                      className="btn h-8 rounded-full px-4 text-xs disabled:opacity-40">
                      Pay now · {inr(o.total)}
                    </button>
                  </div>
                )}

                {/* Paid: the facts of the payment, where the ask used to be. */}
                {paid && (
                  <p className="mt-3 rounded-[12px] bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    Paid {inr(o.total)}
                    {o.paid_at ? ` on ${new Date(o.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}` : ""}
                    {o.razorpay_payment_id ? <> · payment id <span className="font-mono">{o.razorpay_payment_id}</span></> : null}
                    {" — released to production."}
                  </p>
                )}

                {/* WHAT it needs, not just that it needs something. Says whose
                    move it is and how long it has been waiting, so nobody has
                    to ring us to find out whether anything is happening. */}
                {o.attention && (
                  <div className={`mt-3 rounded-[12px] border px-3 py-2.5 ${
                    o.attention.overdue
                      ? "border-red-200 bg-red-50"
                      : "border-amber-200 bg-amber-50"
                  }`}>
                    <p className={`text-xs font-semibold ${o.attention.overdue ? "text-red-900" : "text-amber-900"}`}>
                      {o.attention.headline}
                    </p>
                    <p className={`mt-0.5 text-xs ${o.attention.overdue ? "text-red-800" : "text-amber-900"}`}>
                      {o.attention.reason}
                    </p>
                    <p className="mt-1.5 text-[11px] text-slate">
                      {o.attention.waiting === "just now"
                        ? "Noticed just now"
                        : `Waiting ${o.attention.waiting}`}
                      {" · with "}
                      {o.attention.party === "production" ? "our production team" : "the Zyvorah desk"}
                      {/* Being told an escalation happened is the difference
                          between "our team is on it" as a promise and as a fact. */}
                      {o.attention.escalatedAt
                        ? ` · escalated to Roheena on ${new Date(o.attention.escalatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`
                        : o.attention.overdue
                          ? " · being escalated to Roheena"
                          : ""}
                    </p>
                  </div>
                )}

                {/* Status rail */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {attention ? (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      o.attention?.overdue ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"
                    }`}>
                      {o.attention?.headline ?? "Needs attention"}
                      {o.attention?.waiting ? ` — ${o.attention.waiting}` : ""}
                    </span>
                  ) : isDraft ? (
                    // The production rail would be a lie here — nothing has
                    // been sent to production yet.
                    <span className="rounded-full bg-wash px-3 py-1 text-xs font-semibold text-slate">
                      Draft — not yet confirmed
                    </span>
                  ) : awaitingPayment ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                      Awaiting payment
                    </span>
                  ) : paidInProduction ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                      Paid — in production
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-start gap-1.5">
                      {STAGES.map((s, i) => {
                        const on = dayMon(stageDates(o.os)[i]);
                        return (
                          <span key={s} className="flex items-start gap-1.5">
                            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${i <= stageIdx ? "bg-charcoal" : "bg-edge"}`} />
                            <span className="leading-tight">
                              <span className={`block text-[11px] ${i === stageIdx ? "font-semibold text-charcoal" : i < stageIdx ? "text-slate" : "text-mist"}`}>{s}</span>
                              {on && <span className="block text-[10px] text-mist">{on}</span>}
                            </span>
                            {i < STAGES.length - 1 && <span className="mx-0.5 mt-1 h-px w-4 bg-edge" />}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* The production facts our own board carries: what it is
                      called on the shop floor, and how many panels it splits
                      into (which is what arrives in the tube). */}
                  {o.os?.panels ? (
                    <span className="text-[11px] text-mist">
                      {o.os.panels} panel{o.os.panels > 1 ? "s" : ""}
                    </span>
                  ) : null}

                  {o.os?.podNo && (
                    <span className="text-xs text-slate">
                      {o.os.courier ? `${o.os.courier} · ` : ""}
                      <span className="font-mono font-semibold text-charcoal">{o.os.podNo}</span>
                      {o.os.trackingUrl && (
                        <> · <a href={o.os.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline">track</a></>
                      )}
                    </span>
                  )}

                  <span className="ml-auto flex items-center gap-3">
                    {/* Once production has the job there is a piece to hang,
                        so there is a sheet for it — printing, dispatched or
                        already up. */}
                    {(o.os?.printOrderNo ?? o.os_print_order_no) && (
                      <>
                        <button onClick={() => openInstallSheet({ order: o.id }, `Install sheet · ${orderRef(o)}`)}
                          className="text-xs font-semibold underline">
                          Install sheet
                        </button>
                        {poSet(o).length > 1 && (
                          <button onClick={() => openInstallSheet(
                            { po: o.po_number! }, `Install sheet · PO ${o.po_number}`)}
                            title={`One sheet covering all ${poSet(o).length} printed walls on PO ${o.po_number}`}
                            className="text-xs text-slate underline">
                            whole PO ({poSet(o).length})
                          </button>
                        )}
                      </>
                    )}
                    <button onClick={() => void repeat(o)} disabled={busy === o.id || Boolean(workspace && !workspace.form?.canOrder)}
                      className="text-xs font-semibold underline disabled:opacity-40">
                      Print this again
                    </button>
                    {/* Nothing to cancel on a draft — it was never sent — and never
                        offered once anything of the wall is at the printer. */}
                    {!isDraft && o.canRequestCancel === true && (
                      <button onClick={() => void requestCancel(o)} disabled={busy === o.id || Boolean(workspace && !workspace.form?.canOrder)}
                        className="text-xs text-slate underline disabled:opacity-40">
                        Request cancellation
                      </button>
                    )}
                    {/* A request the desk has answered stops reading as pending.
                        Both answers are an answer: the partner should be able to
                        see whether the piece is dead or still coming. */}
                    {o.cancel_requested_at && !o.cancel_resolved_at && (
                      <span className="text-xs text-amber-700">Cancellation requested</span>
                    )}
                    {o.cancel_outcome === "cancelled" && (
                      <span className="text-xs text-blush">Cancelled</span>
                    )}
                    {o.cancel_outcome === "declined" && (
                      <span className="text-xs text-slate">
                        Too late to stop — this one is printing
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
            });

            if (!blk.groupRef) return cards;
            const sqft = blk.items.reduce((s, o) => s + Number(o.area_sqft ?? 0), 0);
            const tot = blk.items.reduce((s, o) => s + Number(o.total ?? 0), 0);
            // A project goes in as ONE submission, so it is one person's
            // — surface them on the group header so you don't have to open
            // a card to see who placed twenty walls.
            const placer = blk.items[0].placed_by_email;
            return (
              <div key={blk.groupRef} className="rounded-[22px] border-2 border-charcoal/15 bg-wash p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-2 pb-2">
                  <p className="font-display text-sm font-bold">
                    Project <span className="font-mono">{blk.groupRef}</span> · {blk.items.length} walls
                  </p>
                  <p className="flex items-center gap-3 text-xs text-slate">
                    {blk.items.some((o) => o.os?.printOrderNo ?? o.os_print_order_no) && (
                      <button onClick={() => openInstallSheet(
                        { group: blk.groupRef! }, `Install sheet · project ${blk.groupRef}`)}
                        className="font-semibold text-charcoal underline">
                        Install sheet
                      </button>
                    )}
                    <span>{sqft.toFixed(1)} sq ft · ₹{Math.round(tot).toLocaleString("en-IN")} incl. GST</span>
                  </p>
                </div>
                <p className="px-2 pb-2 text-[11px] text-mist">
                  Placed by <span className="text-charcoal">{placer}</span>
                </p>
                <div className="space-y-3">{cards}</div>
              </div>
            );
  }

  const viewer = viewing && (
        <div
          ref={viewerRef}
          role="dialog"
          aria-modal="true"
          aria-label={viewing.title}
          onClick={() => setViewing(null)}
          className="fixed inset-0 z-50 flex flex-col bg-charcoal/80 p-4 backdrop-blur-sm sm:p-8"
        >
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 pb-3">
            <p className="truncate text-sm font-semibold text-white">{viewing.title}</p>
            <div className="flex shrink-0 items-center gap-3 text-xs">
              {!workspace && <a href={viewing.src} target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-white/80 underline hover:text-white">
                Open in new tab
              </a>}
              <a href={viewing.src} download
                onClick={(e) => e.stopPropagation()}
                className="text-white/80 underline hover:text-white">
                Download
              </a>
              <button type="button" onClick={() => setViewing(null)}
                aria-label="Close"
                className="rounded-full border border-white/40 px-3 py-1 font-semibold text-white hover:bg-white/15">
                Close
              </button>
            </div>
          </div>
          {/* Stop propagation so clicking the artwork itself doesn't close it —
              only the backdrop does. */}
          <div onClick={(e) => e.stopPropagation()}
            className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 items-center justify-center overflow-auto rounded-[14px] bg-surface">
            {viewing.kind === "pdf" ? (
              // An iframe, not <object type="application/pdf">: a purchase order
              // may be attached as an IMAGE (the upload accepts .pdf,image/*),
              // and a hardcoded PDF type would fall through to the error text
              // for exactly those. An iframe renders whatever content-type the
              // signed URL returns, PDF or raster. Both routes 302 to a signed
              // Supabase URL, which serves inline (no attachment disposition),
              // so the browser's own viewer handles it.
              <iframe src={viewing.src} title={viewing.title}
                className="h-full min-h-[70vh] w-full rounded-[14px]" />
            ) : (
              // object-contain, not cover: this is for checking the artwork, so
              // it must never be cropped by the viewer.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewing.src} alt={viewing.title}
                className="max-h-full max-w-full object-contain" />
            )}
          </div>
          <p className="mx-auto max-w-6xl pt-2 text-center text-[11px] text-white/60">
            Press Esc or click outside to close.
          </p>
        </div>
      );
  function openDocument(d: BoardDocument) {
    setViewing({ title: `${d.kind === "tax" ? "Tax invoice" : d.kind === "proforma" ? "Proforma" : "Quotation"} · ${d.number}`, src: `/api/corporate/documents/${d.id}`, kind: "pdf" });
  }
  if (workspace) {
    const boardRows: BoardOrder[] = [
      ...orders.map(o => ({ key: o.id, ref: orderRef(o), name: o.print_name || "Wallpaper", po: o.po_number,
        group: o.group_ref, batch: o.batchRef ?? null, osId: o.os_order_id ?? null,
        width: o.width_mm, height: o.height_mm, stage: o.cancel_outcome === "cancelled" ? "Cancelled" : o.stageLabel,
        attention: o.attention?.headline ?? null, createdAt: o.created_at, dispatchedAt: o.os?.dispatchedAt ?? null,
        pod: o.os?.podNo ?? null, courier: o.os?.courier ?? null, trackingUrl: o.os?.trackingUrl ?? null,
        imageUrl: `/api/corporate/orders/${o.id}/image`, location: [o.ship_city, o.state].filter(Boolean).join(", "), fromDesk: false })),
      ...deskOrders.map(o => ({ key: `desk-${o.osOrderId}`, ref: o.printOrderNo ?? `#${o.osOrderId}`, name: o.printName || "Wallpaper",
        po: o.poNumber ?? null, group: o.groupRef ?? null, batch: o.batchRef, osId: o.osOrderId,
        width: o.widthMm, height: o.heightMm, stage: o.stageLabel ?? (o.dispatchedAt ? "Dispatched" : "Received"),
        attention: o.os?.printStatus === "needs_input" ? "Production needs information" : null,
        createdAt: o.createdAt, dispatchedAt: o.os?.dispatchedAt ?? o.dispatchedAt,
        pod: o.os?.podNo ?? null, courier: o.os?.courier ?? null, trackingUrl: o.os?.trackingUrl ?? null,
        location: "", fromDesk: true })),
      ...proposalBoardRows(proposals),
    ];
    const matchingDocs = documents.filter(d => [d.number, d.kind, d.batchRef, d.groupRef].filter(Boolean).join(" ").toLowerCase().includes(documentQuery.toLowerCase()));
    const documentPanel = <div className="space-y-4">
      <div><h2 className="text-xl font-semibold">Invoices &amp; documents</h2><p className="mt-1 text-sm text-stone-500">Your account’s quotations, proformas and tax invoices. Open or download a copy here.</p></div>
      <input aria-label="Search invoices" placeholder="Search invoice or batch number…" value={documentQuery} onChange={e => setDocumentQuery(e.target.value)} className="w-full max-w-md rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm" />
      {loadError && <p role="alert" className="text-sm text-amber-700">{loadError}</p>}
      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {matchingDocs.map(d => <div key={d.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="text-sm font-semibold">{d.number} <span className="ml-2 text-xs font-normal text-stone-500">{d.kind === "tax" ? "Tax invoice" : d.kind === "proforma" ? "Proforma" : "Quotation"}</span></p><p className="mt-1 text-xs text-stone-400">{d.sentAt ? `Sent ${new Date(d.sentAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "No send date recorded"}{d.status ? ` · ${d.status}` : ""}</p></div><div className="flex items-center gap-4 text-xs"><span className="font-semibold">{inr(d.grandTotal)}</span><button onClick={() => openDocument(d)} className="font-medium text-indigo-600">View PDF</button><a href={`/api/corporate/documents/${d.id}`} download className="text-stone-500 underline">Download</a></div></div>)}
        {!matchingDocs.length && <p className="p-8 text-sm text-stone-500">{loading ? "Loading documents…" : documentQuery ? "No documents match this search." : "Issued documents will appear here."}</p>}
      </div>
    </div>;
    return <><AccountWorkspace slug={slug} accountName={accountName} email={email} access={workspace} query={query} setQuery={setQuery} onPlaced={() => { setQuery(""); void load(); }} documents={documentPanel}
      dashboard={<><WaitingOnYou slug={slug} isAdmin={workspace.isAdmin} canOrder={Boolean(workspace.form?.canOrder)}
        orders={orders.flatMap((o): WaitingOrder[] => o.cancel_outcome !== "cancelled" && (o.stageLabel === "Draft" || o.stageLabel === "Awaiting payment")
          ? [{ ref: orderRef(o), name: o.print_name || "Untitled print", stage: o.stageLabel }] : [])}
        onOpenOrder={ref => { setQuery(ref); window.scrollTo({ top: 0 }); }} />
        <OrderBoard rows={boardRows} documents={documents} query={query} loading={loading} error={loadError} refresh={() => void load()} updatedAt={updatedAt} openDocument={openDocument}
        renderDetails={row => {
          if (row.key.startsWith(PROPOSAL_ROW_PREFIX)) {
            const id = (row.batch ?? "").replace(/^site-batch:/, "");
            return <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"><p className="text-sm font-semibold">{row.ref}</p><p className="mt-1 text-xs text-stone-600">The artwork for this store is ready. Approve each wall, or all at once; every approval sends that wall to print.</p><a href={`/partners/${slug}/site-batches/${id}`} className="mt-3 inline-block rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">Review and approve</a></div>;
          }
          const portalOrder = orders.find(o => o.id === row.key);
          if (portalOrder) return renderBlock({groupRef: null, items: [portalOrder]});
          const deskOrder = deskOrders.find(o => o.osOrderId === row.osId);
          return <div className="rounded-xl border border-stone-200 bg-white p-4"><p className="text-sm font-semibold">{row.ref} · {row.name}</p><p className="mt-1 text-xs text-stone-500">Placed with the Zyvorah desk · {row.stage}</p><InstallationStatus installation={deskOrder?.installation} /><InstallerChoice orderId={row.osId!} options={installerOptions} onAssigned={load} /></div>;
        }} />{installName && <p className="mt-5 text-xs text-stone-500">Installation: {installName}{installPhone ? ` · ${installPhone}` : ""}. Arranged and billed directly by the installer.</p>}</>}
    />{viewer}</>;
  }

  return (
    <div className="container-x py-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {logoPath && (
            <Image src={logoPath} alt="" width={40} height={40} className="rounded-[10px]" />
          )}
          <div>
            <h1 className="font-display text-2xl font-extrabold leading-tight">{accountName}</h1>
            <p className="text-xs text-slate">Print portal · signed in as {email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/partners/${slug}/library`}
            className="h-11 rounded-full border border-edge px-4 text-[0.8rem] leading-[2.75rem] text-slate hover:text-charcoal">
            Design library
          </Link>
          <Link href={`/partners/${slug}/stores`}
            className="h-11 rounded-full border border-edge px-4 text-[0.8rem] leading-[2.75rem] text-slate hover:text-charcoal">
            Stores
          </Link>
          <Link href={`/partners/${slug}/team`}
            className="h-11 rounded-full border border-edge px-4 text-[0.8rem] leading-[2.75rem] text-slate hover:text-charcoal">
            Team
          </Link>
          <Link href={`/partners/${slug}/settings`}
            className="h-11 rounded-full border border-edge px-4 text-[0.8rem] leading-[2.75rem] text-slate hover:text-charcoal">
            Account
          </Link>
          <Link href={`/partners/${slug}/new`} className="btn h-11 px-5 text-[0.8rem]">New print order</Link>
          <form action="/api/corporate/logout" method="post">
            <button formAction="/api/corporate/logout"
              onClick={async (e) => { e.preventDefault(); await fetch("/api/corporate/logout", { method: "POST" }); location.href = `/partners/${slug}`; }}
              className="h-11 rounded-full border border-edge px-4 text-[0.8rem] text-slate hover:text-charcoal">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Installation contact — they arrange and pay this directly. */}
      {installName && (
        <div className="mt-6 rounded-[16px] border border-edge bg-wash px-5 py-4 text-sm">
          <span className="font-semibold text-charcoal">Installation:</span>{" "}
          <span className="text-slate">
            arranged directly with {installName}
            {installPhone ? <> — <a href={`tel:${installPhone}`} className="underline">{installPhone}</a></> : null}
            {" "}(Pune, Bengaluru & Mumbai). Billed by them to you; not part of your Zyvorah invoice.
          </span>
        </div>
      )}

      {/* Orders */}
      <div className="mt-8">
        {loading ? (
          <p className="text-sm text-slate">Loading your orders…</p>
        ) : orders.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-edge bg-wash p-12 text-center">
            <p className="font-display text-lg font-bold">No orders yet</p>
            <p className="mt-1 text-sm text-slate">Upload your artwork and we&apos;ll print it to your exact wall size.</p>
            <Link href={`/partners/${slug}/new`} className="btn mt-5 inline-flex h-11 px-6 text-[0.8rem]">Place your first order</Link>
          </div>
        ) : (
          <div className="space-y-3">
              {activeBlocks.map(renderBlock)}
              {dispatchedBlocks.length > 0 && (
                <div className="pt-2">
                  <button type="button" onClick={() => setShowDispatched((v) => !v)}
                    className="flex w-full items-center gap-2 rounded-[14px] border border-edge bg-wash px-4 py-3 text-left hover:border-slate">
                    <span aria-hidden className={`text-slate transition-transform ${showDispatched ? "rotate-90" : ""}`}>▸</span>
                    <span className="text-sm font-semibold text-charcoal">
                      Dispatched · {dispatchedBlocks.length} {dispatchedBlocks.length === 1 ? "order" : "orders"}
                    </span>
                    <span className="ml-auto text-xs text-slate">{showDispatched ? "Hide" : "Show"}</span>
                  </button>
                  {showDispatched && (
                    <div className="mt-3 space-y-3">{dispatchedBlocks.map(renderBlock)}</div>
                  )}
                </div>
              )}
          </div>
        )}

        {/* ── Walls taken at our desk ───────────────────────────────────────
            Their walls, ordered by phone or in person rather than here. They
            have no row in this portal to act on, so they are shown and not
            offered buttons — but leaving them out entirely is what made this
            page disagree with the desk about how much work is on the account. */}
        {deskOrders.length > 0 && (
          <div className="mt-8">
            <p className="caps text-slate">Taken at our desk · {deskOrders.length}</p>
            <p className="mt-1 text-xs text-mist">
              Ordered with us directly rather than through this portal. Shown here so your
              account reads the same on both sides; they are managed by our desk.
            </p>
            <div className="mt-3 divide-y divide-edge rounded-[18px] border border-edge bg-surface">
              {deskOrders.map((d) => (
                <div key={d.osOrderId} className="flex items-baseline justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      <span className="font-mono">{d.printOrderNo ?? `#${d.osOrderId}`}</span>
                      {d.printName ? <span className="font-normal text-slate"> · {d.printName}</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-mist">
                      {d.widthMm && d.heightMm ? `${ftIn(d.widthMm)} × ${ftIn(d.heightMm)}` : "—"}
                      {d.batchRef ? <> · batch <span className="font-mono">{d.batchRef}</span></> : null}
                    </p>
                    <InstallationStatus installation={d.installation} />
                    <InstallerChoice orderId={d.osOrderId} options={installerOptions} onAssigned={load} />
                  </div>
                  <span className="shrink-0 text-xs text-slate">
                    {d.dispatchedAt ? "Dispatched" : (d.printStatus ?? "In hand")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Invoices & documents ──────────────────────────────────────────
            Every document we hold for this account, which until now lived only
            on our side — including the tax invoice they are asked to pay. */}
        {documents.length > 0 && (
          <div className="mt-8">
            <p className="caps text-slate">Invoices &amp; documents · {documents.length}</p>
            <div className="mt-3 divide-y divide-edge rounded-[18px] border border-edge bg-surface">
              {documents.map((d) => (
                <div key={d.id} className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      <span className="font-mono">{d.number}</span>
                      <span className="ml-2 rounded-full border border-edge px-2 py-0.5 text-[10px] font-normal uppercase tracking-wide text-slate">
                        {d.kind === "tax" ? "Tax invoice" : d.kind === "proforma" ? "Proforma" : "Quotation"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-mist">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—"}
                      {d.batchRef ? <> · batch <span className="font-mono">{d.batchRef}</span></> : null}
                      {d.sentAt ? " · sent" : null}
                    </p>
                  </div>
                  <div className="flex items-baseline gap-4">
                    {d.grandTotal != null && (
                      <span className="text-sm font-semibold tabular-nums">
                        ₹{Math.round(d.grandTotal).toLocaleString("en-IN")}
                      </span>
                    )}
                    <button type="button" className="text-xs underline"
                      onClick={() => setViewing({
                        title: `${d.kind === "tax" ? "Tax invoice" : d.kind === "proforma" ? "Proforma" : "Quotation"} · ${d.number}`,
                        src: `/api/corporate/documents/${d.id}`,
                        kind: "pdf",
                      })}>
                      View PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── In-app viewer. Artwork and documents are both gated routes that
          stream from a private bucket, so the same modal serves both: a raster
          in an <img>, a PDF in an <object> (the browser's own viewer, no
          library, and it degrades to a download link if the browser has none). */}
      {viewer}
    </div>
  );
}

function InstallationStatus({ installation: i }: { installation?: PartnerInstallation | null }) {
  if (!i) return null;
  const status = i.status === "accepted" ? "Accepted" : i.status === "declined" ? "Declined — awaiting reassignment" : "Awaiting installer response";
  return <div className="mt-3 rounded-xl border border-edge bg-wash px-3 py-2 text-xs">
    <p className="font-semibold">Installer: {i.installerName} · {status}</p>
    <p className="mt-1 text-slate"><a href={`tel:${i.installerPhone}`} className="underline">{i.installerPhone}</a> · Tentative date: {dayMon(`${i.tentativeDate}T00:00:00+05:30`)}</p>
    <p className="mt-1 text-slate">{i.paidBy === "us" ? "Our team coordinates the installation." : "The installer coordinates directly with your site/client."} Installation covers the full order; dispatches may arrive in parts.</p>
    {!i.emailSentAt && <p className="mt-1 text-amber-700">Assignment saved. Installer email pending.</p>}
    {i.status === "pending" && i.responseDueAt && <p className="mt-1 text-slate">Response due: {new Date(i.responseDueAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>}
  </div>;
}

function InstallerChoice({ orderId, options, onAssigned }: { orderId: number; options: PartnerInstallerOption[]; onAssigned: () => Promise<void> }) {
  const [phone, setPhone] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  if (!options.length) return null;
  async function assign() {
    setSaving(true); setError("");
    try {
      const r = await fetch("/api/corporate/orders/installer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, installerPhone: phone }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || "Could not assign installer");
      await onAssigned(); setPhone("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not assign installer"); } finally { setSaving(false); }
  }
  return <div className="mt-2 text-xs"><div className="flex flex-wrap gap-2">
    <select aria-label="Choose installer" disabled={saving} className="rounded-lg border border-edge bg-surface p-2" value={phone} onChange={e => setPhone(e.target.value)}><option value="">Choose installer…</option>{options.map(i => <option key={i.phone} value={i.phone}>{i.name} · {i.city}</option>)}</select>
    <button disabled={!phone || saving} onClick={() => void assign()} className="rounded-lg border border-edge px-3 py-2 font-semibold disabled:opacity-40">{saving ? "Assigning…" : "Assign installer"}</button>
  </div>{error && <p role="alert" className="mt-1 text-red-700">{error}</p>}</div>;
}
