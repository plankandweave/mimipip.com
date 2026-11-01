"use client";

// Tiny localStorage-backed lists of product handles for guest wishlist and
// recently-viewed — no login required. Emits a window event so any mounted
// component (header count, wishlist page) re-reads on change, and syncs across
// tabs via the native `storage` event.
import { useEffect, useState } from "react";

const EVT = "zyvorah:localstore";

function read(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, list: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVT, { detail: { key } }));
  } catch {
    /* storage full / disabled — ignore */
  }
}

/** Reactive read of a handle list; updates on same-tab and cross-tab changes. */
export function useLocalList(key: string): string[] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    setList(read(key));
    const refresh = () => setList(read(key));
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) refresh();
    };
    window.addEventListener(EVT, refresh as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVT, refresh as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);
  return list;
}

/** Synchronous one-shot read (no reactivity) — for snapshotting on mount. */
export function readList(key: string): string[] {
  return read(key);
}

export const WISHLIST_KEY = "zyvorah:wishlist";
export const RECENT_KEY = "zyvorah:recent";

/**
 * Add or remove a saved design. Returns the resulting state so the caller can
 * react without re-reading storage — the heart needs to know whether it just
 * turned ON, and how many designs the list now holds, to decide whether this is
 * the save worth asking about (see SaveKeeper).
 */
export function toggleWishlist(handle: string): { on: boolean; count: number } {
  const list = read(WISHLIST_KEY);
  const on = !list.includes(handle);
  const next = (on ? [handle, ...list] : list.filter((h) => h !== handle)).slice(0, 100);
  write(WISHLIST_KEY, next);
  return { on, count: next.length };
}

/** Replace the whole list — used when a sign-in merges the server's copy in. */
export function setWishlist(list: string[]) {
  const clean = Array.from(new Set(list.filter((h) => typeof h === "string" && h)));
  write(WISHLIST_KEY, clean.slice(0, 100));
}

export function isWishlisted(handle: string): boolean {
  return read(WISHLIST_KEY).includes(handle);
}

/** Record a viewed product: most-recent first, de-duped, capped. */
export function recordRecent(handle: string) {
  const list = read(RECENT_KEY).filter((h) => h !== handle);
  write(RECENT_KEY, [handle, ...list].slice(0, 24));
}
