import { createHash } from "node:crypto";

/** A retry key is not authority. Derive the row ID from server-resolved scope
 * so reusing a key on another link/walk can never select or overwrite its row. */
export function traceRequestId(scope: string, kind: "start" | "mark" | "plan", key: unknown): string | null {
  if (key == null) return null; // older recorders keep their existing behaviour
  if (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new Error("Invalid retry key.");
  }
  const bytes = createHash("sha256").update(`trace:${kind}:${scope}:${key.toLowerCase()}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
