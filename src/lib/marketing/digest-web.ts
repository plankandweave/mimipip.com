// The browser half of the approval digest. No node imports — this is pulled
// into the client bundle by the approval board, which signs what it renders.
//
// The hashed input lives here, alone, because it IS the contract (see
// digest.ts): caption, a single space, then the media urls joined by spaces.
// The separator is load-bearing — without it ("ab", ["c"]) and ("a", ["bc"])
// would hash identically and two different posts would share one approval.
export function digestPreimage(caption: string | null, mediaUrls: string[] | null): string {
  return `${caption ?? ""} ${(mediaUrls ?? []).join(" ")}`;
}

/** Browser/edge equivalent of slotDigest(). digest.test.ts proves they agree. */
export async function slotDigestWeb(
  caption: string | null,
  mediaUrls: string[] | null,
): Promise<string> {
  const bytes = new TextEncoder().encode(digestPreimage(caption, mediaUrls));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function approvalMedia(row:{media_urls:string[]|null;format?:string|null;thumbnail_url?:string|null}):string[]|null{
 return row.format==="reel" && row.thumbnail_url ? [...(row.media_urls??[]),row.thumbnail_url] : row.media_urls;
}
