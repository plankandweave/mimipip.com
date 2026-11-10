"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "@/components/SiteImage";
import { CM_PER_FOOT, type InvoiceLine } from "@/lib/pricing";
import { useCart } from "@/components/CartProvider";
import { MarketInvoiceBreakdown } from "@/components/MarketInvoiceBreakdown";
import { useMarket } from "@/components/MarketProvider";
import { formatMarketMoney } from "@/lib/markets";
import { ChatShop } from "@/components/ChatShop";
import { VoiceCall } from "@/components/VoiceCall";
import { useAuthGate } from "@/components/AuthGate";
import { SubscribeDisclosure } from "@/components/SubscribeDisclosure";
import { EMAIL_RE, requestEmailCode, verifyEmailCode } from "@/lib/email-code";
import { conversionSignUp } from "@/lib/conversions";
import { sendConciergeEvent } from "@/lib/concierge-tracking";
import type { ClientEvent, EventExtra } from "@/lib/concierge-events";
import { downscaleForUpload } from "@/lib/upload";

type Product = {
  handle: string;
  title: string;
  image: string | null;
  fromPricePerSqft: number | null;
  /** True for Canvas Wall Art — show a finished "from ₹X", never ₹/sq ft. */
  isCanvas?: boolean;
  /** Lowest finished fixed-size price (canvas), for the "from ₹X" line. */
  fromPrice?: number | null;
  /** Short "why this one" line the concierge gives for this specific pick. */
  reason?: string;
};

type WallSizeFt = { widthFt: number; heightFt: number };

/** The live cart, attached by the server whenever the concierge touched it. */
type ChatCartItem = {
  handle: string;
  title: string;
  materialName: string;
  widthCm: number;
  heightCm: number;
  areaSqft: number;
  quantity: number;
  lineTotal: number;
  installation: number;
  personalisation?: number;
  childName?: string | null;
  bespokeNote?: string | null;
};
type ChatCart = { items: ChatCartItem[]; subtotal: number };

type Msg = {
  role: "user" | "assistant";
  content: string;
  products?: Product[];
  wallSizeFt?: WallSizeFt | null;
  /** Itemised cart snapshot to render under this reply (concierge cart actions). */
  cart?: ChatCart;
  /** A photo the customer attached — kept only for this tab's session (not
   *  persisted to localStorage, to keep the saved transcript small). */
  imagePreview?: string;
};

/** The same GST mini-invoice the cart page shows, compacted for the chat. */
function ChatCartCard({ cart }: { cart: ChatCart }) {
  if (!cart.items.length) {
    return (
      <div className="mt-2 rounded-[16px] bg-surface p-4 text-sm text-slate shadow-sm">
        Your cart is empty.
      </div>
    );
  }
  const lines: InvoiceLine[] = cart.items.flatMap((it) => {
    if (it.handle === "bespoke-customisation") {
      return [{ label: "Bespoke customisation", incl: it.lineTotal }];
    }
    const naming = it.personalisation ?? 0;
    const rows: InvoiceLine[] = [
      {
        label: `${it.title} · ${(it.widthCm / CM_PER_FOOT).toFixed(1)} × ${(it.heightCm / CM_PER_FOOT).toFixed(1)} ft`,
        incl: it.lineTotal - it.installation - naming,
      },
    ];
    if (naming > 0) rows.push({ label: `Child's name${it.childName ? ` · “${it.childName}”` : ""}`, incl: naming });
    if (it.installation > 0) rows.push({ label: "Installation", incl: it.installation });
    return rows;
  });
  const areaSqFt = cart.items.reduce((sum, item) => sum + item.areaSqft * item.quantity, 0);
  const tubeCount = Math.max(1, cart.items.reduce((sum, item) => sum + item.quantity, 0));
  return (
    <div className="mt-2 rounded-[16px] bg-surface p-4 shadow-sm">
      <p className="caps mb-2 text-[0.62rem] text-mist">Your cart</p>
      <MarketInvoiceBreakdown lines={lines} areaSqFt={areaSqFt} tubeCount={tubeCount} />
      <div className="mt-3 flex gap-2">
        <Link href="/checkout" className="btn h-9 flex-1 items-center justify-center text-[0.72rem]">
          Checkout
        </Link>
        <Link href="/cart" className="btn btn-ghost h-9 flex-1 items-center justify-center text-[0.72rem]">
          View cart
        </Link>
      </div>
    </div>
  );
}

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi! I'm the MimiPip concierge. Tell me about your room — the style you love, the mood you want, or your wall size — and I'll find the right mural and price it for you. You can also attach a photo of your room or a look you like.",
};

// H8 (30 Sep 2026 first-buyer walkthrough): a first-time visitor facing a
// blank input box doesn't know what's worth asking a wallpaper concierge.
// Shown only before the first real message (see `msgs.length <= 1` below) —
// tapping one sends it exactly like typing it would.
const STARTER_QUESTIONS = [
  "Will it fit my wall?",
  "Who installs it?",
  "When will it arrive?",
  "What if it arrives damaged?",
];

// Cross-visit memory: remembers the conversation on this device so returning
// customers can pick up where they left off, instead of restarting cold.
const STORAGE_KEY = "zyv:concierge-session";
const MAX_MEMORY_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type SavedSession = {
  sessionId: string | null;
  msgs: Msg[];
  wallSizeFt: WallSizeFt | null;
  savedAt: number;
};

// External links the concierge is allowed to make clickable: courier tracking
// and the customer's own invoice / order-copy PDFs. Everything else external
// stays inert text (defence against the model surfacing an arbitrary URL).
function isSafeExternal(href: string): boolean {
  try {
    const u = new URL(href);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "shiprocket.co" ||
      host.endsWith(".shiprocket.co") ||
      host.endsWith(".supabase.co") ||
      host === "mimipip.com" ||
      host.endsWith(".mimipip.com")
    );
  } catch {
    return false;
  }
}

/** Renders plain text with markdown links and **bold** spans. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
          const href = link[2];
          if (href.startsWith("/")) {
            return (
              <Link key={i} href={href} className="font-semibold underline underline-offset-2">
                {link[1]}
              </Link>
            );
          }
          if (isSafeExternal(href)) {
            return (
              <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                {link[1]}
              </a>
            );
          }
          return <span key={i} className="font-semibold">{link[1]}</span>;
        }
        const bold = part.match(/^\*\*([^*]+)\*\*$/);
        if (bold) {
          return (
            <strong key={i} className="font-semibold">
              {bold[1]}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function Concierge({disconnected=false}:{disconnected?:boolean}={}) {
  const { refresh } = useCart();
  const { market, money, quote } = useMarket();
  // No conversation starts without a VERIFIED email (founder, 6 Oct 2026):
  // the visitor enters their email, we send a one-time code, and the chat
  // opens only once the code is entered — the same code, and the same
  // sign-in, as the account modal. A signed-in customer skips straight to
  // the chat. /api/concierge refuses anyone else before any model call
  // (src/lib/concierge-gate.ts); this is only the friendly half.
  const { signedIn, loading: authLoading } = useAuthGate();
  const [verifyStep, setVerifyStep] = useState<"email" | "code">("email");
  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [partnerPortal, setPartnerPortal] = useState<{ portal: string; accountName: string } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  // Set when the server refuses a turn although this tab thought it was
  // signed in (an expired session): ask for the code again.
  const [serverRefused, setServerRefused] = useState(false);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Real progress label while a reply is in flight — set from the server's
  // {type:"status"} stream events as each tool call actually starts, e.g.
  // "Calculating your 10 ft × 8 ft wall price…". Never a fake/timed message.
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // A card the customer tapped — opens the shop-in-chat panel over the thread.
  const [shop, setShop] = useState<Product | null>(null);
  // The most recent wall size the customer gave the concierge (via price_mural)
  // — handed to the shop-in-chat panel so they never have to re-type a size
  // they already stated in conversation.
  const [wallSizeFt, setWallSizeFt] = useState<WallSizeFt | null>(null);
  // A photo attached to the message currently being composed.
  const [pendingImage, setPendingImage] = useState<{ base64: string; previewUrl: string } | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // One id per conversation so the server can stitch turns back into a
  // transcript for the weekly intelligence report.
  const sessionId = useRef<string | null>(null);
  const hydrated = useRef(false);
  // Explicit test label only; it never grants access or skips email verification.
  const isTest = useRef(false);
  const authPromptRecorded = useRef(false);
  const chatReadyRecorded = useRef(false);
  useEffect(() => { isTest.current = new URLSearchParams(location.search).get("concierge_diagnostic") === "1"; }, []);

  const ensureSessionId = useCallback(() => {
    if (!sessionId.current && typeof crypto !== "undefined" && crypto.randomUUID) {
      sessionId.current = crypto.randomUUID();
    }
    return sessionId.current;
  }, []);

  const track = useCallback((event: ClientEvent, extra: EventExtra = {}, turnId?: string) => {
    const id = ensureSessionId();
    if (id) void sendConciergeEvent({ sessionId: id, turnId, isTest: isTest.current }, event, extra);
  }, [ensureSessionId]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        track("closed");
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, track]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy, open]);

  const needsEmail = !authLoading && (!signedIn || serverRefused);

  useEffect(() => {
    if (!open || authLoading) return;
    if (needsEmail && !authPromptRecorded.current) {
      authPromptRecorded.current = true;
      track("auth_prompted");
    } else if (!needsEmail && !chatReadyRecorded.current) {
      chatReadyRecorded.current = true;
      track("chat_ready");
    }
  // Track state transitions once per opening, rather than renders/keystrokes.
  }, [open, authLoading, needsEmail, track]);

  const sendCode = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailBusy(true);
    setEmailError(null);
    setPartnerPortal(null);
    track("code_requested");
    const res = await requestEmailCode(email, { sessionId: ensureSessionId()!, isTest: isTest.current });
    setEmailBusy(false);
    if (!res.ok) {
      track("code_request_failed");
      setEmailError(res.error);
      if (res.portal) setPartnerPortal({ portal: res.portal, accountName: res.accountName ?? "your company" });
      return;
    }
    track("code_request_succeeded");
    setCodeInput("");
    setVerifyStep("code");
  };

  const verifyCode = async () => {
    const email = emailInput.trim().toLowerCase();
    const token = codeInput.trim();
    if (token.length < 6) {
      setEmailError("Enter the code we emailed you.");
      return;
    }
    setEmailBusy(true);
    setEmailError(null);
    track("verification_started");
    let verified = false;
    try { verified = await verifyEmailCode(email, token); } catch { /* transport failure is a failed verification */ }
    if (!verified) {
      track("verification_failed");
      setEmailBusy(false);
      setEmailError("That code didn't work. Please check it, or send a new one.");
      return;
    }
    // Same post-sign-in step as the account modal: links the customer
    // record and subscribes the address under the line shown here.
    track("verification_succeeded");
    const completion = await fetch("/api/auth/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "concierge", sessionId: ensureSessionId(), isTest: isTest.current }),
    }).catch(() => null);
    if (!completion?.ok) track("auth_completion_failed", completion ? { status: completion.status } : {});
    conversionSignUp({ method: "email_otp", user: { email, phone: null } });
    setEmailBusy(false);
    setServerRefused(false);
    setVerifyStep("email");
    setCodeInput("");
  };

  // Rehydrate a returning customer's conversation from this device — once,
  // right after mount (never during SSR, so this can't cause a hydration mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(isTest.current ? `${STORAGE_KEY}:diagnostic` : STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedSession;
      if (!saved?.savedAt || Date.now() - saved.savedAt > MAX_MEMORY_AGE_MS) return;
      if (!Array.isArray(saved.msgs) || saved.msgs.length <= 1) return;
      sessionId.current = saved.sessionId ?? null;
      // Restore device memory only after mount, keeping SSR hydration stable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMsgs(saved.msgs);
      setWallSizeFt(saved.wallSizeFt ?? null);
    } catch {
      // Corrupt or blocked storage — start fresh, memory is a nicety not a requirement.
    } finally {
      hydrated.current = true;
    }
  }, []);

  // Keep the saved transcript in sync — skipped until the initial hydration
  // check above has run, so a fresh mount never clobbers saved history with
  // the default single-greeting state before it's had a chance to load.
  useEffect(() => {
    if (!hydrated.current) return;
    if (msgs.length <= 1) return;
    try {
      const toSave: SavedSession = {
        sessionId: sessionId.current,
        msgs: msgs.map((m) => ({ role: m.role, content: m.content, products: m.products, wallSizeFt: m.wallSizeFt, cart: m.cart })),
        wallSizeFt,
        savedAt: Date.now(),
      };
      localStorage.setItem(isTest.current ? `${STORAGE_KEY}:diagnostic` : STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Storage full or blocked — nothing to do, memory is best-effort.
    }
  }, [msgs, wallSizeFt]);

  const resetConversation = () => {
    try {
      localStorage.removeItem(isTest.current ? `${STORAGE_KEY}:diagnostic` : STORAGE_KEY);
    } catch {
      // ignore
    }
    sessionId.current = null;
    setMsgs([GREETING]);
    setWallSizeFt(null);
    setShop(null);
    setPendingImage(null);
  };

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) return;
    setAttachError(null);
    setAttaching(true);
    try {
      const blob = await downscaleForUpload(file);
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      if (!base64) throw new Error("empty");
      setPendingImage({ base64, previewUrl: dataUrl });
    } catch {
      setAttachError("Couldn't read that photo — please try another.");
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Accepts an override so a tapped starter question (H8) can send itself
  // without a round trip through the input state.
  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if ((!text && !pendingImage) || busy) return;
    // A verified email first — every message here can cost several model calls.
    if (!signedIn || serverRefused) return;
    ensureSessionId();
    const turnId = crypto.randomUUID();
    // send() runs only on a click/key event, never during rendering.
    // eslint-disable-next-line react-hooks/purity
    const started = performance.now();
    track("message_submitted", {}, turnId);
    setInput("");
    const image = pendingImage;
    setPendingImage(null);
    const next: Msg[] = [
      ...msgs,
      {
        role: "user",
        content: text || (image ? "[Attached a photo]" : ""),
        ...(image ? { imagePreview: image.previewUrl } : {}),
      },
    ];
    setMsgs(next);
    setBusy(true);
    setStatusMsg("Understanding your room…");
    const friendlyError = (err: string) =>
      err === "not_configured"
        ? "I'm still being set up — please check back very soon, or email hello@mimipip.com."
        : err === "busy"
          ? "I'm helping a lot of people right now — give me a few seconds and try again."
          : "Something went wrong on my side — please try that again.";
    try {
      const res = await fetch("/api/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId.current, turnId, isTest: isTest.current,
          countryCode: market.countryCode,
          messages: next
            .slice(1) // drop the local greeting
            .map((m) => ({ role: m.role, content: m.content })),
          imageBase64: image?.base64 ?? undefined,
        }),
      });
      if (!res.ok) {
        track("reply_error", { status: res.status }, turnId);
        let data: { error?: string; code?: string } = {};
        try {
          data = await res.json();
        } catch {
          // non-JSON error body — fall through to the generic message
        }
        if (data.code === "email_required" || data.code === "auth_required") {
          // The server has no verified email for this caller: put the
          // question back and ask for the code.
          setMsgs(msgs);
          setInput(text);
          setServerRefused(true);
          return;
        }
        setMsgs((m) => [...m, { role: "assistant", content: friendlyError(data.error ?? "") }]);
        return;
      }
      if (!res.body) throw new Error("No response body");

      // Server streams newline-delimited JSON: {type:"status",message} lines
      // as each tool call starts, then one final {type:"done"|"error", ...}.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let settled = false;
      while (!settled) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let evt: { type?: string; message?: string; reply?: string; products?: Product[]; wallSizeFt?: WallSizeFt; cart?: ChatCart; error?: string };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "status" && evt.message) {
            setStatusMsg(evt.message);
          } else if (evt.type === "done") {
            // This clock runs in the response handler for that user event.
            // eslint-disable-next-line react-hooks/purity
            track("reply_received", { durationMs: Math.min(Math.round(performance.now() - started), 600_000) }, turnId);
            setMsgs((m) => [...m, { role: "assistant", content: evt.reply ?? "", products: evt.products, cart: evt.cart }]);
            if (evt.wallSizeFt) setWallSizeFt(evt.wallSizeFt);
            // The concierge wrote to the real cart — refresh the header/cart badge.
            if (evt.cart) void refresh();
            settled = true;
          } else if (evt.type === "error") {
            track("reply_error", {}, turnId);
            setMsgs((m) => [...m, { role: "assistant", content: friendlyError(evt.error ?? "") }]);
            settled = true;
          }
        }
      }
      if (!settled) {
        track("stream_incomplete", {}, turnId);
        setMsgs((m) => [
          ...m,
          { role: "assistant", content: "I couldn't reach the store just now — please try again." },
        ]);
      }
    } catch {
      track("network_error", {}, turnId);
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: "I couldn't reach the store just now — please try again." },
      ]);
    } finally {
      setBusy(false);
      setStatusMsg(null);
    }
  };

  return (
    <>
      {/* launcher */}
      <button
        ref={launcherRef}
        type="button"
        onClick={() => {
          if(!disconnected) track(open ? "closed" : "opened");
          authPromptRecorded.current = false;
          chatReadyRecorded.current = false;
          setOpen((v) => !v);
          setShop(null);
        }}
        aria-label={open ? "Close concierge chat" : "Ask MimiPip"}
        aria-expanded={open}
        aria-controls={open ? "zyvorah-concierge" : undefined}
        className="flex min-h-11 shrink-0 items-center gap-1.5 justify-self-end rounded-full px-3 font-display text-xs font-semibold text-charcoal transition-colors hover:bg-surface/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal"
      >
        <span aria-hidden="true"><Sparkle /></span>
        <span className="rounded-full border border-charcoal/15 bg-surface/70 px-2.5 py-1">
          {open ? "Close" : <><span className="hidden sm:inline">Questions? </span><span>Ask us</span></>}
        </span>
      </button>

      {/* panel */}
      {open && disconnected && <div id="zyvorah-concierge" role="region" aria-label="MimiPip concierge" className="absolute right-3 z-50 max-w-sm rounded-2xl bg-surface p-6 shadow-xl"><h2>MimiPip concierge</h2><p>Chat and voice are unavailable in local review.</p><button onClick={()=>setOpen(false)}>Close concierge</button></div>}
      {open && !disconnected && (
        <div id="zyvorah-concierge" role="region" aria-label="MimiPip Concierge" className="absolute top-[calc(100%+0.5rem)] right-3 z-50 flex h-[min(600px,72dvh)] max-h-[calc(100dvh-9rem-var(--sticky-cta-h,0px))] w-[min(400px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-[24px] bg-cloud text-left shadow-2xl ring-1 ring-edge sm:right-5">
          <div className="flex items-start justify-between gap-2 bg-gradient-to-r from-lavender via-blush to-peach px-5 py-4">
            <div>
              <p className="font-display text-base font-bold text-charcoal">MimiPip Concierge</p>
              <p className="text-xs text-charcoal/70">Your personal wallpaper stylist</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {/* Voice call — currently dark; see VOICE_ENABLED in @/lib/voice-flag. */}
              <VoiceCall />
              {msgs.length > 1 && (
                <button
                  onClick={resetConversation}
                  className="whitespace-nowrap text-[0.66rem] font-semibold text-charcoal/70 underline underline-offset-2 hover:text-charcoal"
                >
                  New conversation
                </button>
              )}
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {needsEmail && (
              <form
                data-concierge-email-gate
                onSubmit={(e) => {
                  e.preventDefault();
                  void (verifyStep === "email" ? sendCode() : verifyCode());
                }}
                className="rounded-[16px] bg-surface p-4 shadow-sm"
              >
                <p className="font-display text-sm font-bold text-charcoal">
                  {verifyStep === "email" ? "Start with your email" : "Enter your code"}
                </p>
                <p className="mt-1 text-[0.78rem] leading-snug text-slate">
                  {verifyStep === "email"
                    ? "We'll email you a one-time code to confirm it's you, then we can begin."
                    : `We've sent a code to ${emailInput.trim().toLowerCase()}. It may take a minute to arrive.`}
                </p>
                {verifyStep === "email" ? (
                  <>
                    <label htmlFor="concierge-email" className="sr-only">Email address</label>
                    <input
                      id="concierge-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      required
                      placeholder="you@email.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="mt-3 h-11 w-full rounded-[12px] border border-edge bg-cloud px-3 text-base outline-none focus:border-charcoal sm:text-sm"
                    />
                  </>
                ) : (
                  <>
                    <label htmlFor="concierge-code" className="sr-only">Code from your email</label>
                    <input
                      id="concierge-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      placeholder="12345678"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 12))}
                      className="mt-3 h-11 w-full rounded-[12px] border border-edge bg-cloud px-3 text-center text-base tracking-widest outline-none focus:border-charcoal"
                    />
                  </>
                )}
                {emailError && <p className="mt-2 text-[0.72rem] text-charcoal">{emailError}</p>}
                {partnerPortal && (
                  <a href={partnerPortal.portal} className="mt-2 block text-[0.72rem] font-semibold underline underline-offset-2">
                    Open the {partnerPortal.accountName} portal
                  </a>
                )}
                <button type="submit" disabled={emailBusy} className="btn mt-3 h-11 w-full text-[0.8rem]">
                  {emailBusy ? "Please wait…" : verifyStep === "email" ? "Email me a code" : "Verify and start chatting"}
                </button>
                {verifyStep === "email" ? (
                  <SubscribeDisclosure />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      track("code_restart");
                      setVerifyStep("email");
                      setEmailError(null);
                    }}
                    className="mt-2 min-h-10 text-[0.72rem] font-semibold text-slate underline underline-offset-2 hover:text-charcoal"
                  >
                    Use a different email or resend the code
                  </button>
                )}
              </form>
            )}
            {!needsEmail && msgs.map((m, i) => (
              <div key={i}>
                <div
                  className={
                    m.role === "user"
                      ? "ml-auto w-fit max-w-[85%] rounded-[16px] rounded-br-[4px] bg-charcoal px-4 py-2.5 text-sm text-surface"
                      : "w-fit max-w-[90%] rounded-[16px] rounded-bl-[4px] bg-surface px-4 py-2.5 text-sm text-charcoal shadow-sm"
                  }
                >
                  {m.imagePreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imagePreview} alt="Attached photo" className="mb-1.5 max-h-32 w-full rounded-[10px] object-cover" />
                  )}
                  <span className="whitespace-pre-wrap">
                    <RichText text={m.content} />
                  </span>
                </div>

                {m.products && m.products.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {m.products.slice(0, 6).map((p) => (
                      // A card opens the shop-in-chat panel — the customer
                      // sizes, prices and orders right here, no bounce-out.
                      <button
                        key={p.handle}
                        onClick={() => setShop(p)}
                        className="card block bg-surface p-2 text-left"
                      >
                        <div className="relative aspect-square overflow-hidden rounded-[12px] bg-wash">
                          {p.image && (
                            // Native lazy-loading breaks here: this panel is position:fixed
                            // with its own overflow-y scroll, so the browser measures each
                            // image's distance against the FULL page's document flow (often
                            // thousands of px down) rather than the small visible chat box —
                            // it never intersects, so the image silently never loads. These
                            // thumbnails are tiny and already gated behind opening the chat,
                            // so eager-loading them costs nothing.
                            <Image src={p.image} alt={p.title} fill sizes="160px" loading="eager" className="object-cover" />
                          )}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[0.72rem] font-semibold leading-snug">
                          {p.title}
                        </p>
                        {p.reason && (
                          <p className="mt-0.5 line-clamp-2 text-[0.64rem] italic leading-snug text-slate">
                            {p.reason}
                          </p>
                        )}
                        <p className="mt-0.5 text-[0.68rem] text-slate">
                          {p.isCanvas
                            ? p.fromPrice != null
                              ? `from ${formatMarketMoney(quote(p.fromPrice).total, market.currency)} · `
                              : ""
                            : p.fromPricePerSqft != null
                              ? `${money(p.fromPricePerSqft)}/sq ft · `
                              : ""}
                          <span className="font-semibold text-charcoal">Size &amp; order →</span>
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {m.cart && <ChatCartCard cart={m.cart} />}
              </div>
            ))}

            {/* H8: only before a real conversation exists — a returning
                customer's rehydrated thread (msgs.length > 1) never sees
                these again. */}
            {!needsEmail && msgs.length <= 1 && !busy && (
              <div className="grid grid-cols-2 gap-2">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="rounded-[14px] border border-edge bg-surface px-3 py-2 text-left text-[0.76rem] font-medium leading-snug text-charcoal transition-colors hover:bg-wash"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {busy && (
              <div className="flex w-fit max-w-[90%] items-center gap-2 rounded-[16px] rounded-bl-[4px] bg-surface px-4 py-3 shadow-sm">
                <div className="flex shrink-0 items-center gap-1.5">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-mist"
                      style={{ animationDelay: `${d * 0.15}s` }}
                    />
                  ))}
                </div>
                {statusMsg && <span className="text-[0.72rem] text-slate">{statusMsg}</span>}
              </div>
            )}
          </div>

          {/* shop-in-chat overlay — size, price and order without leaving the thread */}
          {shop && (
            <ChatShop
              handle={shop.handle}
              title={shop.title}
              fallbackImage={shop.image}
              initialWidthFt={wallSizeFt?.widthFt}
              initialHeightFt={wallSizeFt?.heightFt}
              onClose={() => setShop(null)}
              onAdded={({ title, sizeLabel, materialName, total }) => {
                // The panel action becomes part of the conversation itself —
                // persisted with the transcript and visible to the concierge
                // on later turns, so the thread never "forgets" what happened.
                setMsgs((m) => [
                  ...m,
                  {
                    role: "assistant",
                    content: `✓ Added **${title}** to your cart — ${sizeLabel}, ${materialName}, ${money(total)} before the delivery line shown in your cart. Say "checkout" when you're ready, or keep browsing — your earlier picks are still above.`,
                  },
                ]);
              }}
            />
          )}

          {!needsEmail && (
          <div className="border-t border-edge bg-cloud p-3">
            {attachError && <p className="mb-2 rounded-[10px] bg-blush/50 px-3 py-1.5 text-[0.68rem] text-charcoal">{attachError}</p>}
            {pendingImage && (
              <div className="mb-2 flex items-center gap-2 rounded-[12px] bg-surface p-1.5 pr-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingImage.previewUrl} alt="Photo to attach" className="h-10 w-10 rounded-[8px] object-cover" />
                <p className="flex-1 text-[0.68rem] text-slate">Photo attached — I&apos;ll take a look when you send.</p>
                <button
                  onClick={() => setPendingImage(null)}
                  aria-label="Remove photo"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-mist hover:text-charcoal"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-full border border-edge bg-surface pl-2 pr-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={attaching || busy}
                aria-label="Attach a photo"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate transition-colors hover:text-charcoal disabled:opacity-30"
              >
                {attaching ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-mist border-t-charcoal" />
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M7 9 12 4l5 5" /><path d="M12 4v13" />
                  </svg>
                )}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                placeholder="e.g. a calm mural for my bedroom…"
                maxLength={500}
                className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-mist"
              />
              <button
                onClick={() => send()}
                disabled={busy || (!input.trim() && !pendingImage)}
                aria-label="Send"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-charcoal text-surface transition-opacity disabled:opacity-30"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V6m0 0-6 6m6-6 6 6" /></svg>
              </button>
            </div>
          </div>
          )}
        </div>
      )}
    </>
  );
}

function Sparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c.6 4.8 3.2 7.4 8 8-4.8.6-7.4 3.2-8 8-.6-4.8-3.2-7.4-8-8 4.8-.6 7.4-3.2 8-8Z" />
      <path d="M19 15c.3 2.1 1.4 3.2 3.5 3.5-2.1.3-3.2 1.4-3.5 3.5-.3-2.1-1.4-3.2-3.5-3.5 2.1-.3 3.2-1.4 3.5-3.5Z" opacity=".7" />
    </svg>
  );
}
