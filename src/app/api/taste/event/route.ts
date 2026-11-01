import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { TASTE_COOKIE, TASTE_WEIGHTS, LOG_ONLY_EVENTS, parseVec, toVecLiteral, blendTaste } from "@/lib/taste";
import { isCrawler, uaFamily, VISITOR_TOKEN_RE } from "@/lib/ua";

export const runtime = "nodejs";

// Records one taste signal: blends the product's CLIP embedding into the
// visitor's decayed taste vector (anonymous cookie token, like the cart).
// POST { handle, action }  action ∈ view|visualize|save|sample|cart
//
// Also the intake for the funnel-only signals in LOG_ONLY_EVENTS, which are
// logged and then dropped before any personalisation: they describe a step in
// our own funnel, not an opinion about a design, and some of them (an
// invitation to keep a whole list) have no single handle to attribute.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const handle = String(body?.handle ?? "").trim();
  const action = String(body?.action ?? "view");
  const weight = TASTE_WEIGHTS[action];
  const logOnly = LOG_ONLY_EVENTS.has(action);
  if (!logOnly && (!handle || !weight)) return NextResponse.json({ ok: false }, { status: 400 });

  const store = await cookies();
  const existing = store.get(TASTE_COOKIE)?.value;
  // Token comes from proxy.ts, which mints it on the first HTML request so it is
  // already stable by the time this fires. It must be a UUID we minted — never
  // trust arbitrary cookie content.
  const token = existing && VISITOR_TOKEN_RE.test(existing) ? existing : randomUUID();
  const ua = req.headers.get("user-agent");
  const isBot = isCrawler(ua);
  const family = uaFamily(ua);

  // Mirror every signal into the append-only site_events log — the taste
  // vector is a lossy aggregate; the weekly intelligence report needs the
  // raw stream (which designs, which actions, when). Fire-and-forget.
  supabase
    .rpc("log_site_event", {
      // null, not "", when there is no design in question — an empty handle
      // would join to nothing and read as data in the report queries.
      p_token: token, p_event: action, p_handle: handle || null,
      p_is_bot: isBot, p_ua_family: family,
    })
    .then(({ error: e }) => {
      if (e) console.error("log_site_event failed:", e.message);
    });

  // A funnel step is now recorded and its work is done — nothing below this
  // line concerns it.
  if (logOnly) return NextResponse.json({ ok: true, logged: action });

  // Log the crawler's visit, but never let it blend into a taste vector — the
  // "Picked for you" model should learn from people, not from Googlebot.
  if (isBot) return NextResponse.json({ ok: true, bot: true });

  // Same shape, for the other reason a signal must not be learned from: the
  // visitor said no. The event is still recorded — that a page was viewed is an
  // operational fact, and refusing personalisation is not refusing to exist —
  // but nothing about them feeds the model.
  //
  // The gate is currently OPEN by construction. The site has no consent banner,
  // so no visitor has a row, and visitor_may_personalise returns true for
  // "not asked" — which is today's behaviour and matches the published privacy
  // policy. The day a banner writes rows, this starts refusing, with no further
  // change here.
  const { data: mayPersonalise } = await supabase.rpc("visitor_may_personalise", { p_token: token });
  if (mayPersonalise === false) return NextResponse.json({ ok: true, personalisation: "declined" });

  const [{ data: embText }, { data: profile }] = await Promise.all([
    supabase.rpc("product_embedding", { p_handle: handle }),
    supabase.rpc("taste_get", { p_token: token }),
  ]);
  if (!embText) return NextResponse.json({ ok: false }, { status: 404 });

  const prev = (profile as { embedding?: string } | null)?.embedding;
  const next = blendTaste(prev ? parseVec(prev) : null, parseVec(embText as string), weight);

  const { error } = await supabase.rpc("taste_set", {
    p_token: token,
    p_embedding: toVecLiteral(next),
    p_seen_add: handle,
  });
  if (error) {
    console.error("taste_set failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  if (!existing || existing !== token) {
    res.cookies.set(TASTE_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // a year — taste persists across visits
    });
  }
  return res;
}
