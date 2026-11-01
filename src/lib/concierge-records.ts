import { createHash } from "node:crypto";

// Stable per verified identity + turn + role. Repeating an uncertain write is
// safe, and a caller cannot collide with a different customer's transcript.
export function chatMessageId(identity: string, sessionId: string, turnId: string, role: string) {
  const hex = createHash("sha256").update(JSON.stringify([identity, sessionId, turnId, role])).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function confirmedWrite(write: () => PromiseLike<{ error: unknown }>, failed: () => void) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { if (!(await write()).error) return true; } catch { /* retry once */ }
  }
  failed();
  return false;
}
