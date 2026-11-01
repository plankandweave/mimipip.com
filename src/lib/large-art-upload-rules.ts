// Rules for artwork too big for one request. A print master at 150 DPI for a
// 15 ft wall is hundreds of MB, and Cloudflare refuses any single request
// over 100 MB, so the browser sends it to R2 in parts (an R2 multipart upload)
// and the bytes never sit whole in a Worker. Pure, so node:test covers it.

/** Each part is one request. R2 wants every part but the last the same size,
 *  at least 5 MiB; 20 MiB keeps a Worker's memory and a slow link both happy. */
export const ART_PART_BYTES = 20 * 1024 * 1024;

/** Files at or above this go in parts; smaller ones keep the one-request
 *  route, whose own cap (60 MB) sits safely above it. */
export const LARGE_ART_FROM = 40 * 1024 * 1024;

/** The ceiling for a single artwork file. */
export const MAX_ART_BYTES = 2 * 1024 * 1024 * 1024;

const TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", tif: "image/tiff", tiff: "image/tiff",
};

/** The stored content type, decided by the extension — never by what the
 *  browser claims. Null for anything that is not print artwork. */
export function artContentType(fileName: string): string | null {
  return TYPES[artExt(fileName)] ?? null;
}

export function artExt(fileName: string): string {
  return (fileName.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
}

export function partCount(size: number): number {
  return Math.max(1, Math.ceil(size / ART_PART_BYTES));
}

/** Why this file cannot start a parted upload, or null when it can. */
export function largeArtRejection(fileName: string, size: number): string | null {
  if (!artContentType(fileName)) return "Send the artwork as JPG, PNG or TIFF.";
  if (!Number.isFinite(size) || size <= 0) return "That file is empty.";
  if (size > MAX_ART_BYTES) return "That file is over 2 GB — please send a smaller export.";
  return null;
}

/** A part number the upload can take (R2 numbers them 1..10000). */
export function validPart(part: number, size: number): boolean {
  return Number.isInteger(part) && part >= 1 && part <= partCount(size) && part <= 10000;
}

/** The account owns every key under its slug, and nothing else. */
export function artPathBelongsTo(path: string, slug: string): boolean {
  return path.startsWith(`${slug}/`) && !path.includes("..") && !path.slice(slug.length + 1).includes("/");
}
