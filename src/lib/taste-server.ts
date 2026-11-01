// Server-side taste learning for routes that ALREADY have an aesthetic signal
// in hand (visual-search's uploaded-image embedding, the curator's final
// picks). Shares the cookie + blend semantics with /api/taste/event.
//
// Usage inside a route handler:
//   const withTaste = await tasteLearn({ embedding, weight: 6 });
//   return withTaste(NextResponse.json(payload));
// The DB work happens up front; the returned decorator only attaches the
// taste cookie when a fresh token was minted. Never throws — personalisation
// must never break search or curation.

import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import { supabase } from "./supabase";
import { TASTE_COOKIE, parseVec, toVecLiteral, blendTaste } from "./taste";

// Explicit-declaration weights (stronger than a passive product view):
export const TASTE_WEIGHT_INSPIRATION_UPLOAD = 6; // they showed us their taste
export const TASTE_WEIGHT_CURATION = 4; // picks distilled from their answers

/** Mean of the picked designs' embeddings — one blended event, not N decays. */
async function meanEmbedding(handles: string[]): Promise<number[] | null> {
  const { data, error } = await supabase.rpc("product_embeddings", { p_handles: handles });
  if (error || !data) return null;
  const vecs = (data as { handle: string; embedding: string }[]).map((r) => parseVec(r.embedding));
  if (!vecs.length) return null;
  const dim = vecs[0].length;
  const mean = new Array<number>(dim).fill(0);
  for (const v of vecs) for (let i = 0; i < dim; i++) mean[i] += v[i] / vecs.length;
  return mean;
}

export async function tasteLearn(input: {
  embedding?: number[] | null;
  handles?: string[];
  weight: number;
}): Promise<(res: NextResponse) => NextResponse> {
  const noop = (r: NextResponse) => r;
  try {
    let vec = input.embedding && input.embedding.length ? input.embedding : null;
    if (!vec && input.handles?.length) vec = await meanEmbedding(input.handles);
    if (!vec) return noop;

    const store = await cookies();
    const existing = store.get(TASTE_COOKIE)?.value;
    const isValid = !!existing && /^[0-9a-f-]{36}$/i.test(existing);
    const token = isValid ? existing! : randomUUID();

    const { data: profile } = await supabase.rpc("taste_get", { p_token: token });
    const prev = (profile as { embedding?: string } | null)?.embedding;
    const next = blendTaste(prev ? parseVec(prev) : null, vec, input.weight);

    const { error } = await supabase.rpc("taste_set", {
      p_token: token,
      p_embedding: toVecLiteral(next),
      p_seen_add: null, // not a product engagement — nothing to exclude later
      // an explicit declaration counts as several events, so ONE inspiration
      // upload or completed curation immediately unlocks "Picked for you"
      p_events: 3,
    });
    if (error) {
      console.error("tasteLearn taste_set failed:", error.message);
      return noop;
    }

    if (isValid) return noop;
    return (res) => {
      res.cookies.set(TASTE_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
      return res;
    };
  } catch (e) {
    console.error("tasteLearn failed:", e);
    return noop;
  }
}
