import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { REF_ALPHABET } from "./prospect-walk";

// The secret-bearing half of the guest walkthrough rules (prospect-walk.ts):
// minting a token and a ref, hashing a token for storage, and the OS door's
// check of the shared secret. Server only by its imports.

/** 43 URL-safe characters over 256 bits — the same strength as the measure
 *  link, and short enough to survive line-wrapping in an email. */
export const newWalkToken = () => randomBytes(32).toString("base64url");

export const newWalkRef = () =>
  `ZYV-W-${Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(0, REF_ALPHABET.length)]).join("")}`;

/** Only this is stored; the plaintext token leaves exactly once, in the mint
 *  response. */
export const hashWalkToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The OS door: the shared server secret in `x-zyvorah-token`, compared in
 *  constant time. No secret configured means nobody, never everybody. */
export function walkDoorOk(presented: string | null | undefined, secret: string | null | undefined): boolean {
  const s = String(secret ?? "");
  const p = String(presented ?? "");
  if (!s || !p) return false;
  const a = Buffer.from(p);
  const b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}
