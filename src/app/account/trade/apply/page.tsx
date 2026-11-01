"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";

// Multi-step trade partner apply flow (Phase 1). Every step is a real API
// call to /api/trade/apply/* — nothing here decides pass/fail itself, the
// server does (see submit/route.ts). Steps are sequential because each one
// depends on the last (PAN must verify before GST-by-PAN can run, PAN name
// is what the bank name gets matched against, etc), matching the order in
// ~/Zyvorah/docs/trade-partner-program-plan.md.

type EntityType = "individual" | "company" | "partnership";
type StepStatus = "pending" | "busy" | "done" | "error";

type PartnerStatus = {
  id: string;
  status: string;
  entity_type: EntityType;
  legal_name: string;
  pan: string | null;
  pan_verified_at: string | null;
  gstin: string | null;
  gst_declared_none: boolean;
  gstin_verified_at: string | null;
  entity_docs: { path: string; label?: string }[];
  penny_drop_status: string | null;
  proof_type: string | null;
  proof_verdict: { passed?: boolean } | null;
  self_billing_consent_at: string | null;
  tc_accepted_at: string | null;
  rejection_reason: string | null;
} | null;

const STEP_LABELS = ["Entity & PAN", "GST", "Documents", "Proof of trade", "Bank details", "Consent"];

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export default function TradeApplyPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [authDismissed, setAuthDismissed] = useState(false);
  const [partner, setPartner] = useState<PartnerStatus>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  // Derived, not effect-driven: avoids a synchronous setState-in-effect for
  // what is really just a render-time condition (signed out -> show modal).
  const authOpen = !loading && !session && !authDismissed;
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 0 fields
  const [entityType, setEntityType] = useState<EntityType>("individual");
  const [legalName, setLegalName] = useState("");
  const [pan, setPan] = useState("");
  const [panStatus, setPanStatus] = useState<StepStatus>("pending");

  // Step 1 fields
  const [gstMode, setGstMode] = useState<"none" | "have">("none");
  const [gstin, setGstin] = useState("");
  const [, setGstStatus] = useState<StepStatus>("pending");

  // Step 2 (docs)
  const [docsUploaded, setDocsUploaded] = useState(0);
  const [docsStatus, setDocsStatus] = useState<StepStatus>("pending");

  // Step 3 (proof)
  const [proofMode, setProofMode] = useState<"document" | "instagram">("document");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [proofStatus, setProofStatus] = useState<StepStatus>("pending");
  const [proofPassed, setProofPassed] = useState<boolean | null>(null);

  // Step 4 (bank)
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [, setBankStatus] = useState<StepStatus>("pending");

  // Step 5 (consent)
  const [selfBillingConsent, setSelfBillingConsent] = useState(false);
  const [tcAccepted, setTcAccepted] = useState(false);
  const [finalResult, setFinalResult] = useState<{ ok: boolean; reason?: string } | null>(null);

  useEffect(() => {
    // Nothing to fetch until we know who's signed in; the signed-out case is
    // handled entirely by the derived `authOpen` above, not here.
    if (loading || !session) return;
    fetch("/api/trade/status")
      .then((r) => r.json())
      .then((j: { partner: PartnerStatus }) => {
        const p = j.partner;
        setPartner(p);
        if (p) {
          setEntityType(p.entity_type);
          setLegalName(p.legal_name);
          setPan(p.pan ?? "");
          if (p.pan_verified_at) setPanStatus("done");
          if (p.gstin_verified_at) {
            setGstStatus("done");
            setGstMode(p.gst_declared_none ? "none" : "have");
            if (p.gstin) setGstin(p.gstin);
          }
          if (p.entity_docs?.length) {
            setDocsUploaded(p.entity_docs.length);
            setDocsStatus("done");
          }
          if (p.proof_verdict) {
            setProofStatus("done");
            setProofPassed(p.proof_verdict.passed ?? false);
          }
          if (p.penny_drop_status === "completed") setBankStatus("done");
          if (p.self_billing_consent_at) setSelfBillingConsent(true);
          if (p.tc_accepted_at) setTcAccepted(true);

          if (p.status === "active") {
            router.replace("/account/trade");
            return;
          }
        }
        setStatusLoaded(true);
      })
      .catch(() => setStatusLoaded(true));
  }, [session, loading, router]);

  async function submitStart() {
    setBusy(true);
    setError(null);
    const { ok, json } = await postJson("/api/trade/apply/start", { entityType, legalName, pan });
    setBusy(false);
    if (!ok) {
      setError(errorMessage(json.error));
      return;
    }
    await runPanVerify();
  }

  async function runPanVerify() {
    setPanStatus("busy");
    setBusy(true);
    setError(null);
    const { ok, json } = await postJson("/api/trade/apply/pan", {});
    setBusy(false);
    if (!ok || !json.ok) {
      setPanStatus("error");
      setError(json.error === "name_mismatch"
        ? `PAN found, but the registered name ("${json.registeredName ?? "?"}") doesn't match "${legalName}". Correct the legal name or PAN and try again.`
        : json.error === "pan_invalid"
          ? "That PAN could not be verified. Double-check the number and try again."
          : errorMessage(json.error));
      return;
    }
    setPanStatus("done");
    setStep(1);
  }

  async function submitGst() {
    setGstStatus("busy");
    setBusy(true);
    setError(null);
    const body = gstMode === "none" ? { declareNone: true } : { gstin };
    const { ok, json } = await postJson("/api/trade/apply/gst", body);
    setBusy(false);
    if (!ok || !json.ok) {
      setGstStatus("error");
      setError(
        json.error === "gstin_exists_for_pan"
          ? `A GSTIN already exists against your PAN (${(json.existingGstins ?? []).join(", ")}). Enter it above instead of declaring "not registered".`
          : json.error === "gstin_not_active"
            ? `That GSTIN isn't active (status: ${json.status ?? "unknown"}).`
            : errorMessage(json.error),
      );
      return;
    }
    setGstStatus("done");
    setStep(entityType === "individual" ? 3 : 2);
  }

  async function uploadDoc(file: File) {
    setDocsStatus("busy");
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/trade/apply/docs", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setDocsStatus("error");
      setError(errorMessage(json.error));
      return;
    }
    setDocsUploaded(json.count ?? docsUploaded + 1);
    setDocsStatus("done");
  }

  async function submitProofDocument(file: File, kind: "bill" | "document") {
    setProofStatus("busy");
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch("/api/trade/apply/proof", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setProofStatus("error");
      setError(errorMessage(json.error));
      return;
    }
    setProofStatus("done");
    setProofPassed(!!json.passed);
  }

  async function submitProofInstagram() {
    setProofStatus("busy");
    setBusy(true);
    setError(null);
    const { ok, json } = await postJson("/api/trade/apply/proof", { instagramHandle });
    setBusy(false);
    if (!ok) {
      setProofStatus("error");
      setError(errorMessage(json.error));
      return;
    }
    setProofStatus("done");
    setProofPassed(!!json.passed);
  }

  async function submitBank() {
    setBankStatus("busy");
    setBusy(true);
    setError(null);
    const { ok, json } = await postJson("/api/trade/apply/bank", {
      accountHolderName,
      accountNumber,
      ifsc,
    });
    setBusy(false);
    if (!ok || !json.ok) {
      setBankStatus("error");
      setError(
        json.nameMatched === false
          ? `Your bank account is registered to "${json.registeredName ?? "a different name"}", which doesn't match your PAN name closely enough.`
          : errorMessage(json.error),
      );
      return;
    }
    setBankStatus("done");
    setStep(5);
  }

  async function submitFinal() {
    setBusy(true);
    setError(null);
    const { json } = await postJson("/api/trade/apply/submit", {
      selfBillingConsent,
      tcAccepted,
    });
    setBusy(false);
    setFinalResult({ ok: !!json.ok, reason: json.reason });
  }

  if (loading) {
    return (
      <div className="container-x py-10">
        <p className="text-sm text-slate">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container-x py-10">
        <div className="mx-auto max-w-lg text-center">
          <span className="caps text-slate">AID Partners program</span>
          <h1 className="mt-1 font-display text-2xl font-bold">Sign in to apply</h1>
          <p className="mt-2 text-sm text-slate">
            <button onClick={() => setAuthDismissed(false)} className="underline underline-offset-2">Log in or create an account</button>{" "}
            to start your trade partner application.
          </p>
        </div>
        <AuthModal
          open={authOpen}
          onClose={() => setAuthDismissed(true)}
          onSuccess={() => setAuthDismissed(true)}
          reason="apply for trade access"
        />
      </div>
    );
  }

  if (!statusLoaded) {
    return (
      <div className="container-x py-10">
        <p className="text-sm text-slate">Loading…</p>
      </div>
    );
  }

  if (partner && (partner.status === "verifying" || partner.status === "suspended") && finalResult == null) {
    // Already mid-flow — let them continue from wherever they left off
    // rather than blocking, but suspended accounts stop here.
    if (partner.status === "suspended") {
      return (
        <div className="container-x py-10">
          <div className="mx-auto max-w-lg">
            <span className="caps text-slate">AID Partners program</span>
            <h1 className="mt-1 font-display text-2xl font-bold">Account suspended</h1>
            <p className="mt-2 text-sm text-slate">
              Your trade partner account is currently suspended. Contact{" "}
              <a href="mailto:hello@zyvorah.com" className="underline underline-offset-2">hello@zyvorah.com</a> for details.
            </p>
          </div>
        </div>
      );
    }
  }

  if (finalResult) {
    return (
      <div className="container-x py-10">
        <div className="mx-auto max-w-lg text-center">
          <span className="caps text-slate">AID Partners program</span>
          {finalResult.ok ? (
            <>
              <h1 className="mt-1 font-display text-2xl font-bold">You&apos;re approved ✦</h1>
              <p className="mt-2 text-sm text-slate">Every check passed — your trade account is live.</p>
              <a href="/account/trade" className="btn mt-6 inline-flex h-11 px-6 text-[0.8rem]">Go to your trade dashboard</a>
            </>
          ) : (
            <>
              <h1 className="mt-1 font-display text-2xl font-bold">We couldn&apos;t verify your application</h1>
              <p className="mt-2 text-sm text-slate">{finalResult.reason}</p>
              <p className="mt-1 text-xs text-mist">Fix the item(s) above and re-apply from this page.</p>
              <button
                onClick={() => {
                  setFinalResult(null);
                  setStep(0);
                }}
                className="btn mt-6 inline-flex h-11 px-6 text-[0.8rem]"
              >
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const stepper = STEP_LABELS.filter((_, i) => !(i === 2 && entityType === "individual"));

  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-xl">
        <span className="caps text-slate">AID Partners program</span>
        <h1 className="mt-1 font-display text-2xl font-bold">Apply for trade access</h1>
        <p className="mt-1 text-sm text-slate">
          Every check runs automatically — PAN, GST, your bank account and proof of trade. No waiting on a human review.
        </p>

        <div className="mt-6 flex flex-wrap gap-2 text-[0.68rem]">
          {stepper.map((label, i) => (
            <span
              key={label}
              className={`rounded-full px-2.5 py-1 font-semibold uppercase tracking-wide ${
                i === visibleIndex(step, entityType) ? "bg-charcoal text-surface" : "bg-wash text-slate"
              }`}
            >
              {label}
            </span>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-[12px] border border-blush bg-blush/20 px-4 py-3 text-sm text-charcoal">{error}</div>
        )}

        {step === 0 && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate">Entity type</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType)}
                className="mt-1 w-full rounded-[12px] border border-edge px-3 py-2.5 text-sm"
              >
                <option value="individual">Individual</option>
                <option value="company">Company</option>
                <option value="partnership">Partnership</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate">
                Legal name {entityType === "individual" ? "(as on PAN)" : "(entity name, as on PAN)"}
              </label>
              <input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className="mt-1 w-full rounded-[12px] border border-edge px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate">PAN</label>
              <input
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                maxLength={10}
                placeholder="ABCDE1234F"
                className="mt-1 w-full rounded-[12px] border border-edge px-3 py-2.5 text-sm uppercase"
              />
            </div>
            <button
              disabled={busy || legalName.trim().length < 2 || pan.length !== 10}
              onClick={submitStart}
              className="btn h-11 px-6 text-[0.8rem] disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify PAN & continue"}
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate">PAN verified{panStatus === "done" ? " ✓" : ""}. Now your GST status.</p>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={gstMode === "none"} onChange={() => setGstMode("none")} /> Not GST-registered
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={gstMode === "have"} onChange={() => setGstMode("have")} /> I have a GSTIN
              </label>
            </div>
            {gstMode === "have" && (
              <input
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                maxLength={15}
                placeholder="22AAAAA0000A1Z5"
                className="w-full rounded-[12px] border border-edge px-3 py-2.5 text-sm uppercase"
              />
            )}
            <button
              disabled={busy || (gstMode === "have" && gstin.length !== 15)}
              onClick={submitGst}
              className="btn h-11 px-6 text-[0.8rem] disabled:opacity-50"
            >
              {busy ? "Checking…" : "Continue"}
            </button>
          </div>
        )}

        {step === 2 && entityType !== "individual" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate">
              Upload your {entityType === "company" ? "incorporation certificate" : "partnership deed"} (PDF or image).
            </p>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => e.target.files?.[0] && uploadDoc(e.target.files[0])}
              className="text-sm"
            />
            {docsUploaded > 0 && <p className="text-xs text-slate">{docsUploaded} document(s) uploaded ✓</p>}
            <button
              disabled={busy || docsStatus !== "done"}
              onClick={() => setStep(3)}
              className="btn h-11 px-6 text-[0.8rem] disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate">Show us you operate as a trade professional — one of the following.</p>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={proofMode === "document"} onChange={() => setProofMode("document")} /> Upload a bill or trade document
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={proofMode === "instagram"} onChange={() => setProofMode("instagram")} /> Instagram handle
              </label>
            </div>
            {proofMode === "document" ? (
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => e.target.files?.[0] && submitProofDocument(e.target.files[0], "document")}
                className="text-sm"
              />
            ) : (
              <div className="flex gap-2">
                <input
                  value={instagramHandle}
                  onChange={(e) => setInstagramHandle(e.target.value)}
                  placeholder="@yourstudio"
                  className="flex-1 rounded-[12px] border border-edge px-3 py-2.5 text-sm"
                />
                <button disabled={busy || !instagramHandle.trim()} onClick={submitProofInstagram} className="btn h-11 px-4 text-[0.8rem] disabled:opacity-50">
                  Review
                </button>
              </div>
            )}
            {proofStatus === "done" && (
              <p className="text-xs text-slate">
                {proofPassed ? "Looks good ✓" : "This didn't clearly show a trade professional operating in India — try a different document or handle."}
              </p>
            )}
            <button
              disabled={busy || proofStatus !== "done"}
              onClick={() => setStep(4)}
              className="btn h-11 px-6 text-[0.8rem] disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate">Bank details for payouts — verified instantly via a ₹1 penny-drop.</p>
            <input
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
              placeholder="Account holder name"
              className="w-full rounded-[12px] border border-edge px-3 py-2.5 text-sm"
            />
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
              placeholder="Account number"
              className="w-full rounded-[12px] border border-edge px-3 py-2.5 text-sm"
            />
            <input
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="IFSC"
              maxLength={11}
              className="w-full rounded-[12px] border border-edge px-3 py-2.5 text-sm uppercase"
            />
            <button
              disabled={busy || !accountHolderName.trim() || accountNumber.length < 6 || ifsc.length !== 11}
              onClick={submitBank}
              className="btn h-11 px-6 text-[0.8rem] disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify bank account"}
            </button>
          </div>
        )}

        {step === 5 && (
          <div className="mt-6 space-y-4">
            <label className="flex items-start gap-2 text-sm text-slate">
              <input type="checkbox" checked={selfBillingConsent} onChange={(e) => setSelfBillingConsent(e.target.checked)} className="mt-0.5" />
              I consent to Zyvorah auto-generating self-billed commission invoices on my behalf for every order I place.
            </label>
            <label className="flex items-start gap-2 text-sm text-slate">
              <input type="checkbox" checked={tcAccepted} onChange={(e) => setTcAccepted(e.target.checked)} className="mt-0.5" />
              I accept the trade partner terms — trade orders are non-cancellable and non-refundable once payment is captured,
              commission is 20% of the pre-GST subtotal, and I may only mark up designs I&apos;ve uploaded myself, up to 25% over
              standard price.
            </label>
            <button
              disabled={busy || !selfBillingConsent || !tcAccepted}
              onClick={submitFinal}
              className="btn h-11 px-6 text-[0.8rem] disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit application"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function visibleIndex(step: number, entityType: EntityType): number {
  // Steps line up 1:1 with STEP_LABELS except step 2 (docs) is skipped
  // entirely for individuals, so the stepper's visible index shifts by one
  // from step 3 onward.
  if (entityType !== "individual") return step;
  return step <= 1 ? step : step - 1;
}

function errorMessage(code?: string): string {
  switch (code) {
    case "verification_unavailable":
      // Deliberately not "try again in a few minutes": when the verification
      // vendor is unconfigured or down this state persists for days, and
      // retrying is the one thing that cannot fix it. Give a way out instead.
      return "Automatic verification isn't available right now. Retrying won't help — email hello@zyvorah.com with your PAN and GST details and we'll approve your trade access manually.";
    case "customer_link_failed":
    case "service_unavailable":
      return "Something went wrong on our end. Please try again.";
    case "already_applied":
      return "You already have an application in progress.";
    case "invalid_pan_format":
      return "That doesn't look like a valid PAN.";
    case "invalid_gstin_format":
      return "That doesn't look like a valid GSTIN.";
    case "too_large":
      return "That file is too large.";
    case "unsupported_type":
      return "Please upload a JPEG, PNG, WebP or PDF.";
    default:
      return code ? `Something went wrong (${code}).` : "Something went wrong. Please try again.";
  }
}
