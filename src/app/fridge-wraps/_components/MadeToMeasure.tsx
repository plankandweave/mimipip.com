"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DOOR_MIN_CM, DOOR_MAX_CM, MAX_MTM_PANELS, TRIM_ALLOWANCE_MM } from "@/lib/wraps";
import { WRAPS_COMING_SOON_MESSAGE } from "@/lib/wrap-sales-gate";
import { formatINR } from "@/lib/pricing";
import type { FridgeQuote } from "../_lib/mtm";
import { quoteMadeToMeasure } from "../made-to-measure/quote";

type Row = { id: number; widthCm: string; heightCm: string };

const DEBOUNCE_MS = 350;

let nextId = 0;
const blankRow = (): Row => ({ id: nextId++, widthCm: "", heightCm: "" });

/** Both numbers present on every row — the point at which a quote is askable. */
const isComplete = (rows: Row[]) =>
  rows.length > 0 && rows.every((r) => r.widthCm.trim() !== "" && r.heightCm.trim() !== "");

export function MadeToMeasure({
  initialWidthCm,
  initialHeightCm,
  browseHref,
}: {
  initialWidthCm?: string;
  initialHeightCm?: string;
  /** The family listing, when it has designs in it. Null before launch. */
  browseHref: string | null;
}) {
  const initialRows = useRef<Row[]>(
    initialWidthCm && initialHeightCm
      ? [{ id: nextId++, widthCm: initialWidthCm, heightCm: initialHeightCm }]
      : [blankRow(), blankRow()],
  );
  const [rows, setRows] = useState<Row[]>(initialRows.current);
  const [quote, setQuote] = useState<Extract<FridgeQuote, { ok: true }> | null>(null);
  const [rejected, setRejected] = useState<"invalid" | "unavailable" | null>(null);
  const [pending, setPending] = useState(() => isComplete(initialRows.current));

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  // Measurements handed over from the fit finder's fallback are already an
  // answer to the form, so they get priced on arrival rather than waiting for
  // the customer to retype a digit.
  useEffect(() => {
    if (isComplete(initialRows.current)) {
      debounceRef.current = setTimeout(() => void runQuote(initialRows.current), 0);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // Mount only: this is the prefill, not a subscription to the rows.
  }, []);

  async function runQuote(next: Row[]) {
    const seq = ++seqRef.current;
    const result = await quoteMadeToMeasure(
      next.map((r) => ({ widthCm: Number(r.widthCm), heightCm: Number(r.heightCm) })),
    );
    if (seq !== seqRef.current) return;
    setPending(false);
    if (result.ok) setQuote(result);
    else setRejected(result.reason);
  }

  /**
   * Every edit goes through here, and it always clears the previous answer
   * first. A price sitting next to measurements it was not computed from is
   * the one thing this form must never show — the customer reads them as a
   * pair, and the cart will price the pair.
   */
  function applyRows(next: Row[]) {
    setRows(next);
    setQuote(null);
    setRejected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    seqRef.current++;
    if (!isComplete(next)) {
      setPending(false);
      return;
    }
    setPending(true);
    debounceRef.current = setTimeout(() => void runQuote(next), DEBOUNCE_MS);
  }

  const update = (id: number, key: "widthCm" | "heightCm", value: string) =>
    applyRows(rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  return (
    <div>
      <form onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="space-y-6">
          {rows.map((row, i) => (
            <fieldset key={row.id} className="rounded-[22px] border border-edge p-5">
              <legend className="px-2 font-display text-[0.95rem] font-semibold">
                {rows.length > 1 ? `Door ${i + 1}` : "Your door"}
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`w-${row.id}`} className="block text-sm font-medium">
                    Width (cm)
                  </label>
                  <input
                    id={`w-${row.id}`}
                    type="number"
                    inputMode="decimal"
                    min={DOOR_MIN_CM}
                    max={DOOR_MAX_CM}
                    step="0.1"
                    value={row.widthCm}
                    onChange={(e) => update(row.id, "widthCm", e.target.value)}
                    className="mt-2 h-14 w-full rounded-[14px] border border-edge bg-surface px-4 text-base outline-none focus-visible:border-charcoal focus-visible:ring-2 focus-visible:ring-charcoal/20"
                  />
                </div>
                <div>
                  <label htmlFor={`h-${row.id}`} className="block text-sm font-medium">
                    Height (cm)
                  </label>
                  <input
                    id={`h-${row.id}`}
                    type="number"
                    inputMode="decimal"
                    min={DOOR_MIN_CM}
                    max={DOOR_MAX_CM}
                    step="0.1"
                    value={row.heightCm}
                    onChange={(e) => update(row.id, "heightCm", e.target.value)}
                    className="mt-2 h-14 w-full rounded-[14px] border border-edge bg-surface px-4 text-base outline-none focus-visible:border-charcoal focus-visible:ring-2 focus-visible:ring-charcoal/20"
                  />
                </div>
              </div>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => applyRows(rows.filter((r) => r.id !== row.id))}
                  className="link-underline mt-4 text-sm text-slate"
                >
                  Remove door {i + 1}
                </button>
              )}
            </fieldset>
          ))}
        </div>

        {rows.length < MAX_MTM_PANELS && (
          <button
            type="button"
            onClick={() => applyRows([...rows, blankRow()])}
            className="btn btn-ghost mt-6 h-12 px-6 text-[0.8rem]"
          >
            Add another door
          </button>
        )}
      </form>

      {/* ---------- the quote ----------
          Server-computed, always. See made-to-measure/quote.ts for why. */}
      <div aria-live="polite" className="mt-10">
        {pending && <p className="text-sm text-slate">Pricing your measurements…</p>}

        {/* Bounds only. areMeasurementsValid() → isPlausibleDoor() checks a
            range on each side and nothing more, and the message must not claim
            a rule the server does not apply: a French-door bottom freezer
            drawer is roughly 90 x 40 cm, and a custom fridge fit is exactly where
            that customer belongs. */}
        {rejected === "invalid" && (
          <p role="alert" className="text-sm text-[#9B2C2C]">
            Those measurements don&apos;t look like a fridge door. Each panel should be between{" "}
            {DOOR_MIN_CM} and {DOOR_MAX_CM} cm on both sides. Measure the door face, not the cabinet.
          </p>
        )}

        {rejected === "unavailable" && (
          <p role="alert" className="text-sm text-[#9B2C2C]">
            Custom fit isn&apos;t taking orders at the moment.{" "}
            <Link href="/contact" className="link-underline font-medium">
              Talk to us
            </Link>{" "}
            and we&apos;ll sort it out directly.
          </p>
        )}

        {quote && (
          <div className="rounded-[28px] bg-[#F6F1E7] p-7 lg:p-10">
            <p className="caps text-[#8C6F33]">
              Format {quote.formatCode} · {quote.formatLabel}
            </p>
            <p className="mt-3 font-display text-[clamp(2rem,5vw,2.8rem)] font-bold leading-none">
              {formatINR(quote.price)}
            </p>
            <p className="mt-2 text-sm text-slate">
              GST included, for the complete set of {quote.measurements.panels.length}{" "}
              {quote.measurements.panels.length === 1 ? "panel" : "panels"} · {quote.areaSqFt} sq ft
              measured at {formatINR(quote.ratePerSqFt)} per sq ft · dispatched in{" "}
              {quote.leadTimeDays} working days.
            </p>

            {quote.floorApplied && (
              <p className="mt-3 text-sm text-slate">
                That is the minimum for a custom-fit set. A small panel still takes its own
                layout and its own tube, so it cannot cost less than the smallest
                standard format.
              </p>
            )}

            <dl className="mt-7 border-t border-[#E3D9C6] pt-6 text-sm">
              <dt className="font-display font-semibold">Your panel sizes</dt>
              {quote.cutList.map((p, i) => (
                <dd key={i} className="mt-1 text-slate">
                  {p.label} — {p.widthMm} × {p.heightMm} mm
                </dd>
              ))}
              <dd className="mt-3 text-xs text-mist">
                Each panel carries {TRIM_ALLOWANCE_MM} mm of trim allowance on every edge, at no
                charge — you are billed on the {quote.areaSqFt} sq ft you measured, and you trim the
                rest off against the door.
              </dd>
            </dl>

            {/* The ending, and deliberately not an add-to-cart.
                This used to send the customer off to "choose Made to measure on
                that design" — a control that has never existed in the buy box.
                Nor can it be built here: the whole family is gated shut at
                WRAPS_PURCHASABLE (src/lib/wrap-sales-gate.ts) until the Avery
                vs 3M film choice is signed, and every other add-to-cart path on
                a wrap already answers with the same sentence. Quoting is still
                worth doing — the number is real and server-computed — so the
                page ends by naming what it is and what it is not, rather than
                pointing at a button that would not be there. */}
            <div className="mt-8 border-t border-[#E3D9C6] pt-6">
              <p className="text-sm text-slate">
                {WRAPS_COMING_SOON_MESSAGE} So there is nothing to add to a basket yet — what you have
                above is a quote, computed by the same function that will price the order, and not an
                order. Custom fit opens when the rest of the range does. The designs are all here
                to look through in the meantime.
              </p>
              {browseHref && (
                <Link href={browseHref} className="btn btn-ghost mt-5">
                  Look through the designs
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
