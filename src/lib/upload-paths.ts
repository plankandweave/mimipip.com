// Where a signed upload is allowed to land.
//
// A pure module with no server machinery, so the rule that keeps an upload
// inside its own folder can be covered by a plain node:test — the same reason
// ./phone was split out.
//
// This exists because the ALTERNATIVE is trusting a caller-supplied storage
// key, and `product-images` holds every live catalogue image. A path that can
// climb out of the upload folders is a path that can sign a write over
// `<design>/hero.jpg`. So callers describe WHAT they are uploading and this
// decides WHERE it goes; nothing here is assembled from an unvalidated string.

export type UploadIntent =
  | { kind: "studio-flat"; ext: string; hash: string }
  | { kind: "studio-picture"; ext: string }
  | { kind: "admin-design"; ext: string; folder: string };

export type UploadTarget = { path: string; upsert: boolean };

const EXT_RE = /^[a-z0-9]{1,5}$/;
/** studio uploadFlat's content address: first 24 chars of a SHA-256 hex. */
const HASH_RE = /^[0-9a-f]{24}$/;
/** A slugified design title, exactly as /admin/designs derives it. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

const rand = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** The storage key for an intent, or an error code. Never throws. */
export function buildUploadPath(intent: unknown): UploadTarget | { error: string } {
  const i = (intent ?? {}) as Partial<UploadIntent> & Record<string, unknown>;

  const ext = typeof i.ext === "string" ? i.ext.toLowerCase() : "";
  if (!EXT_RE.test(ext)) return { error: "bad_ext" };

  // upsert is per-kind and load-bearing, not a default: studio flats are
  // content-addressed, so a "conflict" only ever means the same bytes being
  // written back over themselves. A NEW admin design must never land on an
  // existing key, which is the one case where overwriting would lose artwork.
  switch (i.kind) {
    case "studio-flat": {
      const hash = typeof i.hash === "string" ? i.hash.toLowerCase() : "";
      if (!HASH_RE.test(hash)) return { error: "bad_hash" };
      return { path: `studio-uploads/${hash}.${ext}`, upsert: true };
    }
    case "studio-picture":
      return { path: `studio-uploads/${rand()}.${ext}`, upsert: true };
    case "admin-design": {
      const folder = typeof i.folder === "string" ? i.folder : "";
      if (!SLUG_RE.test(folder)) return { error: "bad_folder" };
      return { path: `${folder}/${rand()}.${ext}`, upsert: false };
    }
    default:
      return { error: "bad_kind" };
  }
}
