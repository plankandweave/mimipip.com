import type { SupabaseClient } from "@/brand/database-types";
import { artPathOf } from "@/lib/corporate-files";
import { privateBucket } from "@/lib/r2-media";
import { sha256Hex, toHex } from "@/lib/design-fingerprint-rules";

export { duplicateMessage, onePerArtwork, sha256Hex } from "@/lib/design-fingerprint-rules";

// One artwork, one library row (24 October 2026). Designs 5–12 of the EBD
// Gurgaon electronics set were uploaded twice: same bytes, two rows, two
// design codes. The allocator and composer keep "no design twice in a store"
// by row id, so a second row could put the same picture on a store twice.
// Every inserter now fingerprints the file (SHA-256 of its exact bytes) and
// refuses a second LIVE row of the same bytes in the same account; an
// archived row never blocks, so bringing a design back is a fresh upload.

type DigestStreamCtor = new (algorithm: string) => WritableStream<Uint8Array> & { digest: Promise<ArrayBuffer> };

/**
 * Fingerprint a file already in the private store by its object path. A print
 * master can be larger than a Worker's memory, so it is STREAMED through
 * workerd's DigestStream; outside workerd (tests, the media container) the
 * bytes are read whole. Null when the object is missing or cannot be read.
 */
export async function fingerprintStored(path: string): Promise<{ sha256: string; size: number } | null> {
  const bucket = await privateBucket();
  const obj = await bucket?.get(`corporate-art/${path}`);
  if (!obj) return null;
  const DigestStream = (crypto as unknown as { DigestStream?: DigestStreamCtor }).DigestStream;
  if (DigestStream) {
    const sink = new DigestStream("SHA-256");
    await obj.body.pipeTo(sink);
    return { sha256: toHex(await sink.digest), size: obj.size };
  }
  return { sha256: await sha256Hex(await obj.arrayBuffer()), size: obj.size };
}

/** The live design in this account with exactly these bytes, if any. */
export async function liveDuplicate(
  sb: SupabaseClient, accountId: string, sha256: string,
): Promise<{ id: string; code: string | null; title: string } | null> {
  const { data } = await sb.from("corporate_designs")
    .select("id, design_code, title")
    .eq("account_id", accountId).eq("content_sha256", sha256)
    .in("status", ["approved", "pending"])
    .limit(1).maybeSingle();
  return data ? { id: data.id as string, code: (data.design_code as string) ?? null, title: data.title as string } : null;
}

/**
 * Fingerprint live designs written before fingerprints existed, a few per
 * call (the site-batch cron calls this every ten minutes until none are
 * left). A row whose file cannot be read is stamped `byte_size = -1` so it is
 * not retried for ever, and logged.
 */
export async function backfillFingerprints(sb: SupabaseClient, limit = 20): Promise<{ done: number; left: boolean }> {
  const { data: rows } = await sb.from("corporate_designs")
    .select("id, design_url")
    .is("content_sha256", null).is("byte_size", null)
    .in("status", ["approved", "pending"])
    .order("created_at").limit(limit);
  let done = 0;
  for (const r of rows ?? []) {
    const path = artPathOf(r.design_url as string | null);
    const fp = path ? await fingerprintStored(path).catch(() => null) : null;
    if (!fp) console.error("[design-fingerprint] unreadable design file:", r.id, r.design_url);
    await sb.from("corporate_designs")
      .update(fp ? { content_sha256: fp.sha256, byte_size: fp.size } : { byte_size: -1 })
      .eq("id", r.id as string);
    done++;
  }
  return { done, left: (rows?.length ?? 0) === limit };
}
