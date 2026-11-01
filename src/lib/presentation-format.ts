// What kind of thing a presentation is, and what to serve it as.
//
// Split out of presentation.ts, which is server-only, so this can be tested:
// the bug it guards against is silent. Read `format` as "pdf, else html" — the
// shape the code had before video existed — and a film is labelled html and
// served as text/html. Nothing throws. The recipient simply opens a blank
// frame, and we only find out when they say so.

export type PresentationFormat = "html" | "pdf" | "video";

/** The containers a browser can actually play, mapped to their MIME type. */
export const VIDEO_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  // QuickTime off an iPhone or a Mac. Safari plays it, and Chrome usually does
  // because the H.264 inside is the same. Accepted rather than refused so a
  // film that arrives as .mov is not a dead end — see the UI copy.
  mov: "video/quicktime",
};

/** The ceiling for a client film. Enforced where the bytes arrive
 *  (/api/media-upload) and again at the sign step. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** The extension of a stored file, lowercased, or "". */
export function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i + 1).toLowerCase();
}

/** A stored `format` value, read as one of the three we know. */
export function readFormat(v: unknown): PresentationFormat {
  return v === "pdf" ? "pdf" : v === "video" ? "video" : "html";
}

/** Content-Type for a stored presentation, from its path and format. */
export function contentTypeFor(path: string, format: string): string {
  if (format === "pdf") return "application/pdf";
  if (format === "video") return VIDEO_TYPES[extOf(path)] ?? "video/mp4";
  return "text/html; charset=utf-8";
}
