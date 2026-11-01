// The approval digest — what the approver actually saw, byte for byte.
//
// This value is a contract between three places, and its bytes must never
// change:
//   1. the control tower (marketing-dashboard, src/lib/plan.ts) records it,
//   2. the approval board in this repo records it,
//   3. publishApproved() in pipeline.ts compares it before publishing,
// so an approval can never carry over to content that changed underneath it.
// publish-gate.test.ts pins the algorithm against a verbatim copy of the
// tower's. Do not "tidy" any of it.
//
// Two implementations, one value. The preimage — the part that is actually the
// contract — is defined once, in digest-web.ts, which this imports:
//   slotDigest    — server (node:crypto, synchronous), here
//   slotDigestWeb — browser (SubtleCrypto, async), in digest-web.ts, so the
//                   approval board can sign what the founder is LOOKING AT
//                   rather than trusting the server to re-read the same row.
// digest.test.ts proves the two agree.
import { createHash } from "node:crypto";
import { digestPreimage } from "./digest-web";

export function slotDigest(caption: string | null, mediaUrls: string[] | null): string {
  return createHash("sha256").update(digestPreimage(caption, mediaUrls)).digest("hex").slice(0, 32);
}

export { slotDigestWeb } from "./digest-web";
