"use client";

import { useEffect } from "react";
import { gaEvent } from "@/lib/ga";
import { OrderSample } from "@/components/OrderSample";

/**
 * The "order a sample" popup. Samples are currently an India-only ₹200 offer,
 * so this is a thin shell around the paid <OrderSample> flow — the same one
 * used inline on the materials page.
 */
export function SampleOrderModal({
  open,
  onClose,
  productHandle,
  productTitle,
}: {
  open: boolean;
  onClose: () => void;
  productHandle?: string;
  productTitle?: string;
}) {
  useEffect(() => {
    if (open) gaEvent("sample_open", { item_id: productHandle });
  }, [open, productHandle]);
  if (!open) return null;

  const initialDesign = productHandle && productTitle ? { handle: productHandle, title: productTitle } : null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-charcoal/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="my-8 w-[min(480px,100%)]">
        <div className="mb-2 flex justify-end">
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full bg-surface/90 text-slate shadow-sm hover:text-charcoal"
          >
            ✕
          </button>
        </div>
        <OrderSample initialDesign={initialDesign} />
      </div>
    </div>
  );
}
