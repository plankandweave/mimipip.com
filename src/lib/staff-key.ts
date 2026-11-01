import "server-only";

import { currentStaff } from "./staff-access";
import { adminRpcKey } from "./elevated-key";

/**
 * The database key to use on behalf of the signed-in staff member — "" when
 * nobody is signed in.
 *
 * This replaced readAdminKey(), which pulled a key off the REQUEST: whatever the
 * caller typed into the page and stored in their browser. Same call site, same
 * variable, opposite direction of trust. The request no longer carries a key at
 * all; it carries a Google sign-in, and the key comes from admin_config on the
 * server.
 *
 * Returning "" rather than throwing is deliberate. Every one of these routes
 * already ends with `admin_key_ok(p_key => key)` and a 401 when that fails, so an
 * unauthenticated request lands on exactly the refusal it landed on before, from
 * exactly the same line — and the database keeps its own lock rather than
 * becoming a formality that only looks like one.
 */
export async function staffKey(req: Request): Promise<string> {
  const staff = await currentStaff(req);
  if (!staff) return "";
  return (await adminRpcKey()) ?? "";
}
