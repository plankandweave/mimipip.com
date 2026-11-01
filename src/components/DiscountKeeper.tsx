"use client";

import { useEffect } from "react";

const KEY = "zyv_discount_code";

/** Drops the scanned discount code into localStorage so the cart and
 *  checkout prefill it automatically — the customer never retypes it. */
export function DiscountKeeper({ code }: { code: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, code.toUpperCase());
    } catch {
      /* private mode — the code still shows on screen */
    }
  }, [code]);
  return null;
}

export function readSavedDiscount(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearSavedDiscount() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
