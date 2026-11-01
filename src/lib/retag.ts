import { serviceFetch } from "../brand/service-transport";
const fetch: typeof globalThis.fetch = (input,init) => serviceFetch("ai",input,init);
import { STYLE_RULES_PROMPT } from "@/lib/style-rules";
import { filterReviewedStyleTags } from "@/lib/reviewed-style-tags";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { embedImageUrlRemote, thumbnailBytesRemote } from "@/lib/media-client";
import { toVectorLiteral } from "@/lib/pgvector";
import { MOODS } from "@/lib/queries";
import { stripPoojaTags } from "@/lib/studio-scenes";
import { roomRulesPrompt } from "@/lib/room-suitability";
import { anthropicKeyFor } from "@/lib/ai-keys";
import { discoveryColours, NAMED_COLOURS } from "@/lib/discovery-colours";

/**
 * The classification guarantee.
 *
 * A design that reaches the catalogue without the tags it needs to be found is
 * repaired rather than left there — see migration 0130 for the queue and the
 * health views. This lives in its own module so BOTH the Studio route and the
 * studio-drain cron can run a repair: the cron used to reach the worker over
 * HTTP against the site's own public domain, which is behind Vercel Attack
 * Challenge Mode, and it swallowed the failure — so the queue never moved and
 * the cron still reported success.
 */

/** Privileged catalogue writes — must fail loudly rather than silently no-op. */
function requireAdminDb() {
  const db = supabaseAdmin();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — cannot classify");
  return db;
}

async function one<T>(
  q: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
): Promise<NonNullable<T>> {
  const res = await q;
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what}: not found`);
  return res.data as NonNullable<T>;
}

// ---- the tag canon: the collections taxonomy IS the vocabulary ----
//
// Tag joins are exact string matches against collections.rule_tag, so a tagger
// working from a hand-written word list is guaranteed to drift out of step with
// the catalogue — which is exactly what happened ("Living room" vs the real
// "Living Room", "Animals" vs "Animal", and no colour words at all, so 309
// designs ended up with no colour to browse by). The vocabulary is therefore
// read from the collections table, and anything the model returns is snapped
// back onto it. A tag that is not in the canon is dropped, never stored.
type TagCanon = {
  /** lowercased tag -> the canonical spelling. */
  bySpelling: Map<string, string>;
  colour: string[];
  style: string[];
  room: string[];
};
let tagCanonCache: { at: number; value: TagCanon } | null = null;
const TAG_CANON_TTL_MS = 10 * 60 * 1000;

export async function getTagCanon(): Promise<TagCanon> {
  if (tagCanonCache && Date.now() - tagCanonCache.at < TAG_CANON_TTL_MS) return tagCanonCache.value;
  const { data } = await supabase
    .from("collections")
    .select("rule_tag, rule_tags, kind")
    .not("rule_tag", "is", null);
  const rows = (data ?? []) as { rule_tag: string; rule_tags: string[] | null; kind: string }[];
  const canon: TagCanon = { bySpelling: new Map(), colour: [], style: [], room: [] };
  for (const r of rows) {
    for (const tag of [r.rule_tag, ...(r.rule_tags ?? [])]) {
      if (!tag) continue;
      canon.bySpelling.set(tag.toLowerCase(), tag);
      // Moods are asked for separately, in their own validated field.
      if (tag.startsWith("Mood: ")) continue;
      if (r.kind === "color") canon.colour.push(tag);
      else if (r.kind === "room") canon.room.push(tag);
      else if (r.kind === "category") canon.style.push(tag);
    }
  }
  const dedupe = (a: string[]) => Array.from(new Set(a));
  canon.colour = dedupe(canon.colour);
  canon.style = dedupe(canon.style);
  canon.room = dedupe(canon.room);
  tagCanonCache = { at: Date.now(), value: canon };
  return canon;
}

/** Snap free-text tags onto the canon, case-insensitively; drop the rest. */
export function canonicaliseTags(raw: unknown, canon: TagCanon): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    const hit = canon.bySpelling.get(String(t).trim().toLowerCase());
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

// ---- the classification guarantee: one repair, self-contained + resumable ----
//
// A design that reaches the catalogue without the tags it needs to be found is
// not left there. `retag_queue` (see migration 0130) holds every active design
// that catalogue_health says is missing a browse tag, a colour, a room, a mood
// or its CLIP embedding; this drains it one design at a time, exactly like the
// upload queue. Tags are only ever ADDED — a repair must never remove a tag a
// human chose.
export async function processRetagTick(key: string): Promise<{ progressed: boolean; handle?: string; added?: number }> {
  const { data: item, error: claimErr } = await supabase.rpc("retag_claim", { p_key: key });
  if (claimErr || !item?.product_id) return { progressed: false };
  const row = item as { product_id: string; missing: string[] };

  const db = requireAdminDb();
  const prod = await one(
    db.from("products")
      .select("handle, title, category, product_images(url, is_flat), product_tags(tag)")
      .eq("id", row.product_id)
      .single(),
    "load design for re-tag",
  ) as unknown as {
    handle: string; title: string; category: string | null;
    product_images: { url: string; is_flat: boolean }[] | null;
    product_tags: { tag: string }[] | null;
  };

  // The flat is the print master and the truest view of the artwork; a room
  // scene would have the model naming the sofa's colour, not the design's.
  const flat = prod.product_images?.find((i) => i.is_flat)?.url ?? prod.product_images?.[0]?.url;
  if (!flat) {
    await supabase.rpc("retag_apply", {
      p_key: key, p_product_id: row.product_id, p_tags: [], p_error: "no image to classify",
    });
    return { progressed: true, handle: prod.handle };
  }

  try {
    // A design can be missing only its embedding, in which case there is
    // nothing to ask the model and no reason to spend a vision call.
    const needsTags = row.missing.some((m) => m !== "embedding");
    let tags: string[] = [];
    if (needsTags) {
      // The design's own tags go in because the puja bar is partly a collection
      // rule: TAASH is a deck of playing cards, and nothing in it belongs in a
      // shrine however devotional a single sheet looks to a vision model.
      const ownTags = (prod.product_tags ?? []).map((t) => t.tag);
      tags = filterReviewedStyleTags(prod.handle, await classifyExisting(flat, prod.title, prod.category, ownTags));
    }

    if (row.missing.includes("embedding")) {
      try {
        const vec = await embedImageUrlRemote(flat);
        await supabase.rpc("studio_set_embedding", { p_key: key, p_handle: prod.handle, p_embedding: toVectorLiteral(vec) });
      } catch (e) {
        // A missing embedding costs similarity, not findability, so the tags
        // still land — but the reason is RECORDED, not just logged. Silently
        // swallowing this is how every upload since July ended up with no
        // embedding while the feature looked fine.
        const message = e instanceof Error ? e.message : String(e);
        console.error(`retag embed failed for ${prod.handle}:`, message);
        await supabase.rpc("retag_note_embed_error", {
          p_key: key, p_product_id: row.product_id, p_message: message,
        });
      }
    }

    // Do NOT swallow this error. Ignoring it is what hid a broken trigger for
    // forty minutes: every apply failed, every design stayed claimed, and the
    // worker reported progress the whole time. A failed apply must leave a
    // trace and release the lease.
    const { data: applied, error: applyErr } = await supabase.rpc("retag_apply", {
      p_key: key, p_product_id: row.product_id, p_tags: tags, p_error: null,
    });
    if (applyErr) throw new Error(`retag_apply: ${applyErr.message}`);
    return { progressed: true, handle: prod.handle, added: (applied as { added?: number } | null)?.added ?? 0 };
  } catch (e) {
    const message = e instanceof Error ? e.message : "classify failed";
    console.error(`retag failed for ${prod.handle}:`, message);
    const { error: markErr } = await supabase.rpc("retag_apply", {
      p_key: key, p_product_id: row.product_id, p_tags: [], p_error: message,
    });
    // If even marking it failed doesn't work, the row would stay claimed and
    // silently retried forever — surface that rather than reporting progress.
    if (markErr) throw new Error(`retag_apply(failed) also failed: ${markErr.message} (original: ${message})`);
    return { progressed: true, handle: prod.handle };
  }
}

/**
 * A lean vision pass over an EXISTING design: colours, style, room and mood
 * only. No naming, no description — the design already has those, and asking
 * for them again would invite the model to overwrite good copy with worse.
 */
export async function classifyExisting(
  flatUrl: string,
  title: string,
  category: string | null,
  ownTags: readonly string[] = [],
): Promise<string[]> {
  const key = anthropicKeyFor("catalogue");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set — cannot classify");
  const canon = await getTagCanon();

  const img = await fetch(flatUrl);
  const rawBuf = Buffer.from(await img.arrayBuffer());
  let b64: string;
  let mediaType = "image/jpeg";
  try {
    const ab = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength) as ArrayBuffer;
    b64 = (await thumbnailBytesRemote(ab, { width: 512, quality: 80 })).toString("base64");
  } catch {
    b64 = rawBuf.toString("base64");
    mediaType = img.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
          {
            type: "text",
            text:
              `This is artwork for a ${category === "canvas" ? "canvas print" : category === "border" ? "wallpaper border" : "wallpaper mural"} ` +
              `called "${title}", sold by a premium Indian brand (Zyvorah). Classify it for shop browsing.\n` +
              "Return ONLY minified JSON: {" +
              `"colours": string[] (1-4 significant artwork colours, ONLY these exact words: ${canon.colour.join(", ")}. Include at least one named colour from ${NAMED_COLOURS.join(", ")}; Pastel, Dark, Bright and colour pairings alone are insufficient. Ignore furniture and room colours), ` +
              `"tags": string[] (only clearly supported style/subject words, up to 5, ONLY these exact words: ${canon.style.join(", ")}), ` +
              `"rooms": string[] (1-3 rooms this genuinely suits, ONLY these exact words: ${canon.room.join(", ")}), ` +
              `"moods": string[] (1-2 of EXACTLY: ${MOODS.join(", ")})` +
              "}\n\n" + STYLE_RULES_PROMPT + "\n\n" + roomRulesPrompt(),
          },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`classify HTTP ${res.status}`);
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

  const moods: string[] = Array.isArray(j.moods)
    ? j.moods.map(String).filter((m: string) => (MOODS as readonly string[]).includes(m)).slice(0, 2).map((m: string) => `Mood: ${m}`)
    : [];
  // retag_apply canonicalises again server-side, so nothing invented can land
  // even if this filter is ever loosened.
  // Applied last, over the finished set, so it holds whichever field the room
  // arrived in. A repair may only ADD tags, so this cannot take "Pooja Room"
  // back off a design a human filed there deliberately — it only stops the
  // classifier putting it on one that must never carry it.
  return stripPoojaTags(
    Array.from(new Set([
      ...discoveryColours(canonicaliseTags(j.colours, canon).filter((t) => canon.colour.includes(t))),
      ...canonicaliseTags(j.tags, canon).filter((t) => canon.style.includes(t)).slice(0, 5),
      ...canonicaliseTags(j.rooms, canon).filter((t) => canon.room.includes(t)).slice(0, 3),
      ...moods,
    ])),
    title,
    ownTags,
  );
}

