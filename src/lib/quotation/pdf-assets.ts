import "server-only";
import { assetFetch } from "@/lib/asset-fetch";
import type { BrandAssets } from "./pdf-kit";

/**
 * The brand's own typefaces and wordmark, for the quotation and the
 * specification sheets.
 *
 * workerd has no filesystem, so the files under public/ are read through the
 * ASSETS binding (assetFetch), the same way pdf-brand.ts fetches the lockup
 * for the case-study PDFs. Fetched once per isolate and kept.
 *
 * public/fonts/pdf holds Inter and Plus Jakarta Sans subset to Latin plus
 * the rupee sign, the primes, the minus and the degree sign — the characters a
 * quotation and a specification actually use — so each file is ~34 KB rather
 * than the 320 KB of the full family.
 */

const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zyvorah.com").replace(/\/$/, "");

export const BRAND_FONT_FILES = {
  regular: "/fonts/pdf/Inter-Regular.ttf",
  semibold: "/fonts/pdf/Inter-SemiBold.ttf",
  bold: "/fonts/pdf/Inter-Bold.ttf",
  display: "/fonts/pdf/Jakarta-Bold.ttf",
  displayHeavy: "/fonts/pdf/Jakarta-ExtraBold.ttf",
} as const;

export const WORDMARK_FILE = "/logo-dark.png";

let cached: Promise<BrandAssets> | null = null;

async function bytes(path: string): Promise<Uint8Array> {
  const res = await assetFetch(`${ORIGIN}${path}`);
  if (!res.ok) throw new Error(`brand asset ${path} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function loadBrandAssets(): Promise<BrandAssets> {
  cached ??= (async () => {
    const [regular, semibold, bold, display, displayHeavy, wordmarkPng] = await Promise.all([
      bytes(BRAND_FONT_FILES.regular),
      bytes(BRAND_FONT_FILES.semibold),
      bytes(BRAND_FONT_FILES.bold),
      bytes(BRAND_FONT_FILES.display),
      bytes(BRAND_FONT_FILES.displayHeavy),
      bytes(WORDMARK_FILE),
    ]);
    return { fonts: { regular, semibold, bold, display, displayHeavy }, wordmarkPng };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}
