"use client";
import { useRef, useState } from "react";
export function OrderQualityReport({ token }: { token: string }) {
  const requestId = useRef<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    requestId.current ||= crypto.randomUUID();
    form.set("requestId", requestId.current);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/order/quality", {
        method: "POST",
        headers: { "x-order-token": token },
        body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not save report.");
      setSaved(d.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-[20px] border border-edge p-5">
      <summary className="cursor-pointer font-semibold">
        Report damage or a print issue
      </summary>
      <p className="mt-3 text-sm text-slate">
        Keep the packaging and panel labels. Photograph the full wall or panel,
        the problem close up, and any packaging damage. Report transit damage
        within 48 hours of delivery and print faults within 7 days, as described
        in our{" "}
        <a className="underline" href="/refund-policy">
          refund policy
        </a>
        .
      </p>
      {saved ? (
        <p role="status" className="mt-4 text-sm">
          Report saved. Reference: {saved}. Our team can now review it with your
          order. For follow-up, email hello@zyvorah.com and quote this
          reference.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 grid gap-3 text-sm">
          <label>
            Issue
            <select
              name="kind"
              className="mt-1 block w-full rounded-lg border p-2"
              required
            >
              <option value="transit">Damaged in transit</option>
              <option value="print">Print or image defect</option>
              <option value="colour">Colour concern</option>
              <option value="panel">Missing or mismatched panel</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Design and affected panel number
            <input
              name="panel"
              maxLength={150}
              placeholder="For example: design name, panel 2 of 4"
              className="mt-1 block w-full rounded-lg border p-2"
              required
            />
          </label>
          <label>
            What happened?
            <textarea
              name="details"
              minLength={10}
              maxLength={3000}
              required
              rows={4}
              className="mt-1 block w-full rounded-lg border p-2"
            />
          </label>
          <label>
            Photographs (1–3, up to 5MB each)
            <input
              name="photos"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              required
              className="mt-1 block w-full"
            />
          </label>
          <p className="text-xs text-slate">
            Photographs are private to order support. A submitted report starts
            a review; it does not automatically approve a refund or replacement.
          </p>
          {error && (
            <p role="alert" className="text-alert">
              {error}
            </p>
          )}
          <button disabled={busy} className="btn">
            {busy ? "Saving…" : "Submit report"}
          </button>
        </form>
      )}
    </details>
  );
}
