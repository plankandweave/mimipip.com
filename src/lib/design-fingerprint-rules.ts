// The pure half of design-fingerprint.ts (no storage, no database), so the
// rules are tested without either.

/** Hex SHA-256 of bytes in hand (the form upload, a copied file). */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  // A view, never a copy: an upload can be 60 MB and a Worker has 128 MB.
  const view = (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) as Uint8Array<ArrayBuffer>;
  const digest = await crypto.subtle.digest("SHA-256", view);
  return toHex(digest);
}

export function toHex(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What the uploader reads for a refused file. */
export function duplicateMessage(existing: { code: string | null; title: string }): string {
  return `already in the library as ${existing.code ?? `"${existing.title}"`} — the same file twice would let one picture go on a store twice`;
}

/**
 * Keep one candidate per artwork: rows sharing a fingerprint are one design to
 * the allocator, so a duplicate that slipped in can never fill two places.
 * Unfingerprinted rows are kept as they are.
 */
export function onePerArtwork<T extends { content_sha256?: string | null }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const h = r.content_sha256;
    if (!h) return true;
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}
