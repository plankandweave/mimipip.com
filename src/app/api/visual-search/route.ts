import { shopperAiFetch } from "@/lib/shopper-service";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireGatedUser } from "@/lib/auth-server";
import { embedImageBufferRemote, thumbnailBytesRemote } from "@/lib/media-client";
import { tasteLearn, TASTE_WEIGHT_INSPIRATION_UPLOAD } from "@/lib/taste-server";
import { getProductsByHandles } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import type { ProductCardData } from "@/lib/types";
import { anthropicKeyFor } from "@/lib/ai-keys";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024;
const VISION_MODEL = "claude-haiku-4-5-20251001";

/**
 * Search-by-photo ranking hierarchy (most → least important):
 *   1. Subject / motif  (a peacock photo → peacock & bird designs)
 *   2. Art style / form (watercolour, chinoiserie, floral, geometric…)
 *   3. Colour palette   (the dominant colour family)
 *   4. Overall visual similarity (CLIP) — the base signal + tiebreaker
 *
 * CLIP gathers the visually-closest candidates from the catalogue; we then
 * read the photo with vision (subject/style/colour) and re-rank those
 * candidates against each product's real tags, so the results are the closest
 * selections from OUR collection — not a raw colour/texture match.
 */

// Per-matched-term weights, capped at 2 matches each so one axis can't run
// away. The order enforces the hierarchy: even ONE subject match (1.5) beats
// the strongest pure-visual match (1.3); colour is lightest (pure colour
// matching is exactly what made raw search feel off).
const W_SUBJECT = 1.5; // × up to 2 matches → up to 3.0
const W_STYLE = 0.8; //   × up to 2        → up to 1.6
const W_COLOUR = 0.4; //   × up to 2        → up to 0.8
const W_VISUAL = 1.3; //   × cosine 0..1    → up to 1.3
const FINAL = 12;
const POOL = 30; // wider pool so the 3 result buckets have real candidates to draw from

// "What should we match?" re-weights the SAME four real signals — never a
// different/fabricated signal — just changes which one dominates the sort.
type MatchType = "overall" | "subject" | "pattern" | "mood" | "colours" | "similar" | "coordinate";
const WEIGHTS: Record<MatchType, { subject: number; style: number; colour: number; visual: number }> = {
  overall: { subject: W_SUBJECT, style: W_STYLE, colour: W_COLOUR, visual: W_VISUAL },
  subject: { subject: 2.2, style: 0.6, colour: 0.3, visual: 1.0 },
  pattern: { subject: 0.8, style: 2.0, colour: 0.4, visual: 1.0 },
  mood: { subject: 0.6, style: 1.8, colour: 0.6, visual: 1.0 },
  colours: { subject: 0.4, style: 0.6, colour: 2.2, visual: 0.8 },
  similar: { subject: 1.6, style: 0.9, colour: 0.4, visual: 1.8 },
  coordinate: { subject: 0.3, style: 1.0, colour: 1.8, visual: 0.6 },
};

type Attrs = { subjects: string[]; styles: string[]; colours: string[] };

const VISION_SYSTEM =
  "You are cataloguing an image so it can be matched to a wallpaper-mural collection. Reply with ONLY JSON: " +
  '{ "subjects": [], "styles": [], "colours": [] }, all lowercase single words or short terms. ' +
  "subjects = the main things depicted (e.g. peacock, birds, floral, botanical, forest, landscape, mountains, garden, " +
  "geometric, abstract, chinoiserie, animal, elephant, mandala, ethnic, map, tropical, palm). " +
  "styles = the art style/medium (e.g. watercolour, vintage, minimal, line-art, ethnic, japandi, painterly, textured). " +
  "colours = the 2-4 dominant colour families (e.g. green, blue, teal, yellow, gold, pink, red, orange, brown, neutral, cream, grey, black).";

async function analyzeImage(buf: Buffer): Promise<Attrs | null> {
  if (!anthropicKeyFor("shoppers")) return null;
  let b64: string;
  try {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    b64 = (await thumbnailBytesRemote(ab, { width: 768, quality: 82, rotate: true })).toString("base64");
  } catch (e) {
    console.error("[visual-search] image prep failed:", (e as Error).message);
    return null;
  }
  const client = new Anthropic({ fetch: shopperAiFetch, apiKey: anthropicKeyFor("shoppers"), maxRetries: 3 });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await client.messages.create({
        model: VISION_MODEL,
        max_tokens: 300,
        system: VISION_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
              { type: "text", text: "Catalogue this image." },
            ],
          },
        ],
      });
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      const start = text.indexOf("{"), end = text.lastIndexOf("}");
      if (start < 0 || end < 0) {
        console.error("[visual-search] vision returned no JSON:", text.slice(0, 120));
        return null;
      }
      const p = JSON.parse(text.slice(start, end + 1)) as Partial<Attrs>;
      const norm = (a?: string[]) => (Array.isArray(a) ? a.map((s) => String(s).toLowerCase().trim()).filter(Boolean) : []);
      return { subjects: norm(p.subjects), styles: norm(p.styles), colours: norm(p.colours) };
    } catch (e) {
      console.error(`[visual-search] vision attempt ${attempt} failed:`, (e as Error).message);
      if (attempt === 2) return null;
    }
  }
  return null;
}

/** How many distinct wanted terms appear in the candidate's tag bag (capped at 2). */
function matchCount(wanted: string[], hay: string): number {
  let n = 0;
  for (const w of wanted) {
    if (w.length > 2 && (hay.includes(w) || w.split(/\s+/).some((t) => t.length > 3 && hay.includes(t)))) n++;
    if (n >= 2) break;
  }
  return n;
}

/**
 * Products in the catalogue tagged with any of these terms (the vision-detected
 * subjects/styles). This is what makes subject matching RELIABLE — a peacock
 * photo surfaces "birds" designs even when the media container's CLIP model has
 * a bad day and doesn't rank them among the visual candidates.
 */
async function handlesForTerms(terms: string[]): Promise<string[]> {
  const clean = [...new Set(terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 2))].slice(0, 5);
  if (!clean.length) return [];
  const results = await Promise.all(
    clean.map((t) =>
      supabase
        .from("products")
        .select("handle, member:product_tags!inner ( tag )")
        .eq("status", "active").eq("is_service", false)
        .ilike("member.tag", `%${t}%`)
        .limit(8),
    ),
  );
  const handles = new Set<string>();
  for (const r of results) for (const row of ((r.data as { handle: string }[]) ?? [])) handles.add(row.handle);
  return [...handles];
}

export async function POST(req: Request) {
  // Haiku vision runs on every upload — email-verified customers only.
  const { blocked } = await requireGatedUser();
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "no_image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  const matchTypeRaw = String(form.get("matchType") ?? "overall");
  const matchType: MatchType = (Object.keys(WEIGHTS) as MatchType[]).includes(matchTypeRaw as MatchType)
    ? (matchTypeRaw as MatchType)
    : "overall";
  const w = WEIGHTS[matchType];

  try {
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);

    // Stage 1 — read the photo (subject/style/colour) and get the visually
    // closest candidates (CLIP), in parallel.
    const [attrs, embedding] = await Promise.all([analyzeImage(buf), embedImageBufferRemote(ab)]);

    // The uploaded image is the customer SHOWING us their taste — the strongest
    // aesthetic declaration there is. Blend it into their taste profile so
    // "Picked for you" learns from it (no-op if the embedding failed).
    const withTaste = await tasteLearn({
      embedding: Array.isArray(embedding) ? (embedding as number[]) : null,
      weight: TASTE_WEIGHT_INSPIRATION_UPLOAD,
    });

    let clipMatches: { handle: string; similarity: number }[] = [];
    try {
      const { data } = await supabase.rpc("match_products_by_embedding", { query_embedding: embedding, match_count: 24 });
      clipMatches = (data as { handle: string; similarity: number }[]) ?? [];
    } catch (e) {
      console.error("[visual-search] embedding match failed:", (e as Error).message);
    }
    const simByHandle = new Map(clipMatches.map((m) => [m.handle, m.similarity]));

    // No vision (no key / failed) → pure visual order (best we can do); every
    // result reads as "closest" since we have no subject/style/colour signal
    // to split sameColours/complements out honestly.
    if (!attrs) {
      if (!clipMatches.length) return withTaste(NextResponse.json({ products: [], attrs: null, buckets: { closest: [], sameColours: [], complements: [] }, candidates: [] }));
      const cards = await getProductsByHandles(clipMatches.map((m) => m.handle));
      return withTaste(NextResponse.json({
        products: cards.slice(0, FINAL),
        attrs: null,
        buckets: { closest: cards.slice(0, 6), sameColours: [], complements: [] },
        candidates: [],
      }));
    }

    // Stage 2 — also pull candidates the photo's SUBJECT/STYLE points to
    // (reliable, independent of CLIP), then re-rank the union by the hierarchy.
    const tagHandles = await handlesForTerms([...attrs.subjects, ...attrs.styles]);
    const allHandles = [...new Set([...clipMatches.map((m) => m.handle), ...tagHandles])];
    if (!allHandles.length) return withTaste(NextResponse.json({ products: [] }));

    const [cards, tagRows] = await Promise.all([
      getProductsByHandles(allHandles),
      supabase.from("products").select("handle, product_tags ( tag )").in("handle", allHandles),
    ]);
    const tagsByHandle = new Map<string, string>();
    for (const row of (tagRows.data as { handle: string; product_tags: { tag: string }[] }[]) ?? []) {
      tagsByHandle.set(row.handle, (row.product_tags ?? []).map((t) => t.tag.toLowerCase()).join(" "));
    }

    const scored = cards.map((c: ProductCardData) => {
      const hay = `${tagsByHandle.get(c.handle) ?? ""} ${c.title.toLowerCase()}`;
      const sim = simByHandle.get(c.handle) ?? 0; // cosine 0..1 (0 if only a tag candidate)
      const subjectN = matchCount(attrs.subjects, hay);
      const styleN = matchCount(attrs.styles, hay);
      const colourN = matchCount(attrs.colours, hay);
      const score = w.subject * subjectN + w.style * styleN + w.colour * colourN + w.visual * sim;
      return { c, score, subjectN, styleN, colourN, tags: hay };
    });
    scored.sort((a, b) => b.score - a.score);
    const pool = scored.slice(0, POOL);

    // Three honest buckets, computed from the SAME real match signals above —
    // never a separate/fabricated notion of "coordinates":
    //  - closest: the top-ranked pool by the chosen weighting
    //  - same colours, different design: shares a detected colour but NOT the
    //    subject — a genuinely different design in a compatible palette
    //  - complements: shares style or colour but isn't a near-identical match
    const closest = pool.slice(0, 6);
    const closestHandles = new Set(closest.map((s) => s.c.handle));
    const sameColours = pool
      .filter((s) => !closestHandles.has(s.c.handle) && s.colourN > 0 && s.subjectN === 0)
      .slice(0, 6);
    const sameColourHandles = new Set(sameColours.map((s) => s.c.handle));
    const complements = pool
      .filter((s) => !closestHandles.has(s.c.handle) && !sameColourHandles.has(s.c.handle) && (s.styleN > 0 || s.colourN > 0))
      .slice(0, 6);

    return withTaste(NextResponse.json({
      products: pool.slice(0, FINAL).map((s) => s.c), // backward-compatible flat list (header quick-search modal)
      attrs, // real detected subjects/styles/colours — grounds the refinement chips
      buckets: {
        closest: closest.map((s) => s.c),
        sameColours: sameColours.map((s) => s.c),
        complements: complements.map((s) => s.c),
      },
      candidates: pool.map((s) => ({ handle: s.c.handle, tags: s.tags })), // for client-side refinement filters
    }));
  } catch (error) {
    console.error("Visual search error:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
