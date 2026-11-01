import "server-only";
import {
  PDFDocument, rgb, PDFName, PDFString, PDFArray,
  type PDFFont, type PDFPage,
} from "pdf-lib";
import { CONTACT_URL, logoPng, prepareImage, qrPng } from "./pdf-brand";
import { mediaUrl } from "./project-media";

/**
 * The pieces every project PDF shares — page constants, image fetching, text
 * wrapping, the brand lockup and the running footer — extracted so the
 * classic book (project-book-pdf.ts) and the flip book (flip-book-pdf.ts)
 * are two page grammars over one set of mechanics, not two copies of the
 * carefully-commented QR/lockup machinery drifting apart.
 */

export const A4L: [number, number] = [842, 595]; // landscape, points
export const M = 48;

export const ink = rgb(0.08, 0.09, 0.11);
export const soft = rgb(0.4, 0.42, 0.46);
export const accentByTheme: Record<string, ReturnType<typeof rgb>> = {
  precise: rgb(0.169, 0.278, 0.659),
  warm: rgb(0.635, 0.329, 0.165),
  calm: rgb(0.184, 0.42, 0.31),
  bright: rgb(0.753, 0.337, 0.129),
  dusk: rgb(0.541, 0.439, 0.22),
};

export type Prepared = { jpeg: Buffer; width: number; height: number };

/** The lockup's own footprint in points, so placement and the luminance
 *  sample are derived from one set of numbers rather than two that drift. */
export const LOCKUP_W = 46 + 10 + 74;
export const LOCKUP_INSET = 18;

export async function fetchImage(key: string, maxWidth: number): Promise<Prepared | null> {
  const url = mediaUrl(key);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    return await prepareImage(raw, maxWidth);
  } catch {
    return null;
  }
}

/**
 * Fetch a set of image keys with bounded concurrency, keyed for reuse.
 *
 * The classic book fetches as it composes, which is fine at its page count;
 * the flip book carries ~26 images and each one is a fetch plus a
 * media-container round trip, so run serially it would brush the route's
 * 60-second budget. Five slots keeps the Worker's memory shape sane while
 * cutting wall time to roughly the longest few images.
 */
export async function fetchImages(
  keys: readonly { key: string; maxWidth: number }[],
): Promise<Map<string, Prepared>> {
  const out = new Map<string, Prepared>();
  const queue = [...new Map(keys.map((k) => [k.key, k])).values()];
  // Eight, not five: the Shorelight book grew to 121 pages and ~110 images,
  // and at five slots the download measured 67s against a 60s route budget —
  // it returned, but the next slow day it would not.
  const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const got = await fetchImage(next.key, next.maxWidth);
      if (got) out.set(next.key, got);
    }
  });
  await Promise.all(workers);
  return out;
}

export { wrap } from "./project-pdf-text";

/**
 * The brand lockup, bottom-right: QR on a white card, wordmark and two lines
 * of type beside it.
 *
 * The QR panel is always white with dark modules regardless of what the
 * image is doing, because scannability is not a stylistic question — a
 * saffron-on-charcoal QR that looks considered and fails to scan is worse
 * than no QR. Only the wordmark and text adapt to the corner they sit on.
 *
 * Also registers a link annotation over the QR, so the same square works
 * whether the reader has a phone camera or a mouse.
 */
export async function drawLockup(
  pdf: PDFDocument, page: PDFPage, font: PDFFont, bold: PDFFont,
  opts: { x: number; y: number; onImage: boolean; label: string },
) {
  const inkColor = opts.onImage ? rgb(1, 1, 1) : rgb(0.09, 0.09, 0.1);
  const qrSide = 46;
  const gap = 10;

  // Over a photograph, the lockup sits on its own soft panel and is always
  // white. An earlier version measured the corner's luminance and picked
  // white or black to suit — which works only when the corner is uniformly
  // one or the other. On a real interior render it is not: the first chapter
  // plate puts dark timber battens and a pale concrete floor inside the same
  // small rectangle, so whichever ink wins the average is unreadable against
  // the other half. A panel removes the guess instead of refining it.
  if (opts.onImage) {
    page.drawRectangle({
      x: opts.x - 10, y: opts.y - 8,
      width: qrSide + gap + 74 + 18, height: qrSide + 16,
      color: rgb(0.06, 0.06, 0.07), opacity: 0.55,
    });
  }

  const qr = await pdf.embedPng(await qrPng());
  const logo = await pdf.embedPng(await logoPng(opts.onImage ? "white" : "black"));

  // White card behind the QR, with a hair of quiet zone beyond the code's own.
  const pad = 4;
  page.drawRectangle({
    x: opts.x - pad, y: opts.y - pad,
    width: qrSide + pad * 2, height: qrSide + pad * 2,
    color: rgb(1, 1, 1),
  });
  page.drawImage(qr, { x: opts.x, y: opts.y, width: qrSide, height: qrSide });

  const textX = opts.x + qrSide + gap;
  const logoW = 74;
  const logoH = (logo.height / logo.width) * logoW;
  page.drawImage(logo, { x: textX, y: opts.y + qrSide - logoH, width: logoW, height: logoH });
  // Must agree with the cover. "Commissioned work" on a concept study is a
  // document contradicting itself about whether the work was ever built,
  // which is the one claim this whole set of pages is careful about.
  page.drawText(opts.label, {
    x: textX, y: opts.y + 15, size: 7.5, font: bold, color: inkColor,
  });
  page.drawText("zyvorah.com", {
    x: textX, y: opts.y + 4, size: 7.5, font, color: inkColor, opacity: 0.85,
  });

  const annotRef = pdf.context.register(
    pdf.context.obj({
      Type: "Annot", Subtype: "Link",
      Rect: [opts.x - pad, opts.y - pad, opts.x + qrSide + pad, opts.y + qrSide + pad],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(CONTACT_URL) },
    }),
  );
  // Append rather than replace: a page may already carry annotations, and
  // clobbering them to add one is the kind of thing that breaks quietly.
  const existing = page.node.get(PDFName.of("Annots"));
  if (existing instanceof PDFArray) {
    existing.push(annotRef);
  } else {
    page.node.set(PDFName.of("Annots"), pdf.context.obj([annotRef]));
  }
}

/** Bottom-right of an image plate, inset far enough to clear rounded edges. */
export function lockupAt(imgX: number, imgY: number, imgW: number): { x: number; y: number } {
  return { x: imgX + imgW - LOCKUP_W - LOCKUP_INSET, y: imgY + LOCKUP_INSET };
}

export function footer(page: PDFPage, font: PDFFont, label: string, color = soft) {
  page.drawText(label, { x: M, y: 22, size: 8, font, color });
  page.drawText("zyvorah.com", {
    x: A4L[0] - M - font.widthOfTextAtSize("zyvorah.com", 8),
    y: 22,
    size: 8,
    font,
    color,
  });
}
