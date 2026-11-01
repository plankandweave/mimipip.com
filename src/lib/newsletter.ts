import { istDateKey, istWeekday, addIstDays } from "@/lib/ist";
// Weekly newsletter content — "The Zyvorah Letter". A VISUAL case study: each
// issue takes one room, pulls real designs photographed on that room's wall,
// and Claude writes it like a little design story — the room, the challenge,
// what a specific design does to the light/scale/mood, how to bring it home.
// Every section carries a mapped room image; a scene gallery closes it out.
// Written by Claude, with evergreen copy when writing is unavailable.
// Selection holds when no fresh, room-matched study is available.

import Anthropic from "@anthropic-ai/sdk";
import { getProductsByTag, getCollectionByHandle, getCuratedCollections } from "./queries";
import { sceneKeyForCollection, showsRoom } from "./rooms";
import { SITE_URL } from "./seo";
import type { ProductCardData } from "./types";
import type { NewsletterSection, NewsletterGalleryItem } from "./newsletter-template";
import { selectNewsletterDesigns, type RecentNewsletterDesign } from "./newsletter-variety";
import { anthropicKeyFor } from "@/lib/ai-keys";

const MODEL = "claude-sonnet-5";

export type RoomDef = {
  handle: string; // room collection handle
  name: string; // "the living room"
  brief: string; // the case-study framing for Claude
  ideas: string; // the design ideas most relevant to this room
};

// One room per issue, rotating weekly. Each brief anchors a real case study.
export const ROOMS: RoomDef[] = [
  {
    handle: "living-room-wallpaper",
    name: "the living room",
    brief: "the hardest-working room in the house — it holds guests, evenings and everyday life at once",
    ideas: "scale and how a large wall can feel considered rather than empty; a feature wall behind the sofa or TV; warmth vs. drama",
  },
  {
    handle: "bedroom-wallpaper",
    name: "the bedroom",
    brief: "a room for rest, where calm and low contrast matter more than drama",
    ideas: "colour psychology (cool, quiet hues that slow a room down); soft, tonal designs; the wall behind the bed",
  },
  {
    handle: "kids-wallpapers",
    name: "a child's room",
    brief: "a room that should hold wonder and still be able to grow with the child",
    ideas: "playful but not babyish; storytelling motifs; designs a child won't outgrow in a year",
  },
  {
    handle: "home-office-wallpaper",
    name: "the home office",
    brief: "a wall that supports focus through a long day and holds up as a video-call backdrop",
    ideas: "designs with enough life to hold attention without distracting; how a considered backdrop reads on camera",
  },
  {
    handle: "baby-nursery-wallpapers",
    name: "the nursery",
    brief: "a gentle, soothing first room where softness is everything",
    ideas: "biophilia and calm; pale, tender palettes; a wall a baby wakes up to",
  },
  {
    handle: "foyer",
    name: "the entryway",
    brief: "the first note of the whole home — a small space that sets the tone",
    ideas: "making a first impression in a compact space; depth and welcome; the courage to be bold in a room you only pass through",
  },
  {
    handle: "pooja-room-wallpaper",
    name: "the pooja room",
    brief: "a serene, sacred corner that asks for stillness and reverence",
    ideas: "quiet, devotional motifs; warmth and light; a backdrop that holds focus without noise",
  },
];

/**
 * Monday (IST) of the week containing `d`, as YYYY-MM-DD.
 *
 * The letter is an Indian weekly, so its week has to turn over at midnight in
 * India. In UTC it turned over at 05:30 IST, which put anything written in the
 * small hours of a Monday into the previous week's issue.
 */
export function weekStartOf(d: Date): string {
  const day = (istWeekday(d) + 6) % 7; // 0 = Monday
  return addIstDays(istDateKey(d), -day);
}

function weekIndex(weekStart: string): number {
  return Math.floor(Date.parse(weekStart + "T00:00:00Z") / (7 * 86_400_000));
}

/** Reconstruct the gallery heading for a stored issue (keyed by room handle). */
export function galleryHeadingForTheme(themeHandle: string | null): string {
  const room = ROOMS.find((r) => r.handle === themeHandle);
  return room ? `Seen in ${room.name}` : "More designs on this wall";
}

function priceLabel(p: ProductCardData): string | null {
  return p.fromPricePerSqft ? `From ₹${Math.round(p.fromPricePerSqft)}/sq ft` : null;
}

function productHref(handle: string): string {
  return `${SITE_URL}/products/${encodeURIComponent(handle)}?utm_source=newsletter&utm_medium=email`;
}

type RoomStudy = { room: RoomDef; designs: ProductCardData[] };

// Find a room (from the weekly rotation onward) that has enough designs
// actually photographed on its wall — so every issue is genuinely pictorial.
async function pickRoomStudy(weekStart: string, recent: RecentNewsletterDesign[]): Promise<RoomStudy> {
  const collections = await getCuratedCollections();
  if (!collections.length) throw new Error("newsletter_collection_history_unavailable");
  const start = ((weekIndex(weekStart) % ROOMS.length) + ROOMS.length) % ROOMS.length;
  for (let i = 0; i < ROOMS.length; i++) {
    const room = ROOMS[(start + i) % ROOMS.length];
    try {
      const c = await getCollectionByHandle(room.handle);
      if (!c?.rule_tag) continue;
      const sceneKey = sceneKeyForCollection(c);
      if (!sceneKey) continue;
      const pool = await getProductsByTag(c.rule_tag, 1000, sceneKey);
      // Only designs actually photographed in THIS room (same as the lookbook).
      const scenes = pool.filter((p) => showsRoom(p, sceneKey));
      const designs = selectNewsletterDesigns(scenes, collections, recent, weekStart);
      if (designs.length >= 2) return { room, designs };
    } catch {
      /* try the next room */
    }
  }
  // Hold rather than silently repeat a collection or label a flat as a room.
  throw new Error("newsletter_no_fresh_room_study");
}

export type GeneratedIssue = {
  subject: string;
  previewText: string;
  title: string;
  kicker: string | null;
  theme: string; // the room key
  introHtml: string;
  sections: NewsletterSection[];
  gallery: NewsletterGalleryItem[];
  galleryHeading: string;
  featuredHandles: string[];
  heroImage: string | null;
  heroCaption: string | null;
};

const SYSTEM = `You are the editor of "The Zyvorah Letter", a weekly newsletter from Zyvorah — an Indian brand of original mural wallpaper designs.

Write ONE issue as a short, vivid CASE STUDY of a single room. You're given the room, a design brief for it, and 2–4 real designs that are photographed on that room's wall. Write it like a designer walking a reader through the room: set the scene and the challenge, then take one design at a time and show what it does to the space — the light, the sense of scale, the mood, how it feels to be in the room. Ground it in real ideas (colour psychology, scale and perspective, biophilia, light) where they fit. Warm, intelligent, curious Indian English; vivid but never flowery, clichéd or salesy.

Each body section is built around ONE of the given designs (reference it by name, and set its "designHandle" to that design's handle) — the email shows that design on the room's wall right beside your words.

Rules:
- Do NOT mention price, GST, discounts, shipping or delivery.
- Lead with the named mural wallpaper design and its visual character.
- Do not use “made to measure” or “printed” as selling copy. Keep sizing off the creative.
- Use “master bedroom”, never “primary bedroom” or “primary room”.
- No greeting and no sign-off.
- Output ONLY valid JSON, no code fences, exactly this shape:
{
  "subject": "compelling subject line, max ~60 characters, no emoji",
  "previewText": "inbox preview line, max ~100 characters",
  "title": "the letter's headline, short and evocative",
  "introHtml": "one or two <p>…</p> setting the room and the challenge",
  "sections": [ { "heading": "short heading", "body_html": "one or two <p>…</p>", "designHandle": "one-of-the-given-handles" } ]
}
- 2 or 3 sections, each tied to a DIFFERENT given design by handle. Clean HTML only, no markdown.`;

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Build a complete, image-led issue for the given week. */
export async function generateIssue(weekStart: string, recent: RecentNewsletterDesign[]): Promise<GeneratedIssue> {
  const { room, designs } = await pickRoomStudy(weekStart, recent);
  const byHandle = new Map(designs.map((d) => [d.handle, d]));

  const kicker = `The Zyvorah Letter · A ${room.name.replace(/^the /, "").replace(/^a /, "")} case study`;
  const galleryHeading = `Seen in ${room.name}`;
  const gallery: NewsletterGalleryItem[] = designs.map((d) => ({
    title: d.title,
    handle: d.handle,
    image: d.image,
    priceFrom: priceLabel(d),
  }));

  const base = {
    kicker,
    theme: room.handle,
    galleryHeading,
    gallery,
    featuredHandles: designs.map((d) => d.handle),
    heroImage: designs[0]?.image ?? null,
    heroCaption: designs[0] ? `${designs[0].title} · ${cap(room.name)}` : null,
  };

  // Turn a Claude section into a rendered section that carries a design's room
  // image beside the words. If the model didn't echo a matching designHandle,
  // fall back to a positional design so EVERY section stays pictorial.
  const toSection = (
    s: { heading: string; body_html: string; designHandle?: string },
    fallback?: ProductCardData,
  ): NewsletterSection => {
    const d = (s.designHandle ? byHandle.get(s.designHandle) : undefined) ?? fallback;
    return {
      heading: s.heading,
      body_html: s.body_html,
      image: d?.image ?? null,
      imageCaption: d ? `${d.title} · ${cap(room.name)}` : null,
      href: d ? productHref(d.handle) : null,
    };
  };

  const fallback = (): GeneratedIssue => {
    const sections: NewsletterSection[] = designs.slice(0, 2).map((d) =>
      toSection(
        {
          heading: d.title,
          body_html: `<p>${esc(d.title)} on a wall in ${esc(room.name)} — ${esc(room.brief)}. It's a quiet reminder of how much a single wall shapes the way a room feels to live in.</p>`,
          designHandle: d.handle,
        },
        d,
      ),
    );
    return {
      ...base,
      subject: `Seen in ${cap(room.name)}`,
      previewText: `A closer look at ${room.name} and what the right wall does there.`,
      title: `A closer look at ${room.name}`,
      introHtml: `<p>This week we spend time in ${esc(room.name)} — ${esc(room.brief)} — and look at what the right wall can do there.</p>`,
      sections,
    };
  };

  if (!anthropicKeyFor("catalogue") || designs.length === 0) return fallback();

  try {
    const context = {
      room: { name: room.name, brief: room.brief, ideas: room.ideas },
      designs: designs.map((d) => ({
        handle: d.handle,
        title: d.title,
        tags: (d.tags ?? []).slice(0, 8),
        descriptor: d.subtitle ?? null,
      })),
    };
    const client = new Anthropic({ apiKey: anthropicKeyFor("catalogue"), maxRetries: 2 });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2200,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(context) }],
    });
    const text = response.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("");
    const parsed = JSON.parse(stripFences(text)) as {
      subject?: string;
      previewText?: string;
      title?: string;
      introHtml?: string;
      sections?: { heading?: string; body_html?: string; designHandle?: string }[];
    };

    const sections = (parsed.sections ?? [])
      .filter((s) => s?.heading && s?.body_html)
      .map((s, i) =>
        toSection(
          { heading: String(s.heading), body_html: String(s.body_html), designHandle: s.designHandle },
          designs[i % designs.length],
        ),
      );
    if (!parsed.title || !parsed.introHtml || sections.length === 0) throw new Error("incomplete issue");

    return {
      ...base,
      subject: (parsed.subject || `Seen in ${cap(room.name)}`).slice(0, 90),
      previewText: (parsed.previewText || "").slice(0, 130),
      title: parsed.title,
      introHtml: parsed.introHtml,
      sections,
    };
  } catch (e) {
    console.error("[newsletter] generation failed — using evergreen fallback:", e);
    return fallback();
  }
}

// Local escape (mirrors the template's) for the fallback copy.
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
