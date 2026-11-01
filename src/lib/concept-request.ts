import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";
export async function allowConceptRequest(
  req: Request,
  kind: string,
  limit: number,
) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return false;
  const db = supabaseAdmin();
  if (!db) return false;
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    "local";
  const hash = createHash("sha256")
    .update(`${kind}:${ip}:${new Date().toISOString().slice(0, 10)}`)
    .digest("hex");
  const { data, error } = await db.rpc("concept_request_allow", {
    p_bucket: hash,
    p_limit: limit,
  });
  return !error && data === true;
}
