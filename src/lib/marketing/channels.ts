// Per-channel copy generation. Instagram uses the caption generator in
// caption.ts. LinkedIn and YouTube have different jobs and audiences, so they
// get their own system prompts here — but they run through the SAME safety gate,
// so the trade-secret and price rules hold everywhere.
//
// LinkedIn copy is Astra's job (scripts/linkedin-agent.ts writes the plan,
// every caption included). What is here is the fallback: a LinkedIn slot that
// arrives without copy, and a founder's note asking for a rewrite on the desk.
// The founder-voice lane was retired on 26 Sep 2026 — the LinkedIn page speaks
// as Zyvorah, the brand, only.
// YouTube produces a Shorts title + description (and later, long-form scripts).

import Anthropic from "@anthropic-ai/sdk";
import { checkCaption, autoCorrect, type SafetyResult } from "./safety";
import type { Candidate } from "./select";
import { anthropicKeyFor } from "@/lib/ai-keys";

const MODEL = "claude-sonnet-5";

const SHARED_RULES = `HARD RULES — breaking either is a failure:
1. NEVER describe or hint at how the wallpaper is manufactured — no machines, printer brands, inks, suppliers, factories, or software. Lead with the mural design and its place in the room.
2. NEVER state internal business information — costs, margins, vendors, or the names of tools/systems used to run the business.
Indian / British English spelling always (colour, favourite, metre).

POSITIONING you may draw on (substantiated by a July 2026 global competitive review): Zyvorah is a new kind of wallpaper store — the whole journey (discover designs, see them on your own wall at true scale, price your exact wall GST-inclusive, personalise, order) can happen through conversation; no other wallpaper retailer we know of combines this. Approved lines: "A new kind of wallpaper store — discover, size, personalise and order your wall entirely through conversation." / "India's most intelligent way to discover, visualise and order wallpaper." / "The store you can talk to." NEVER claim "world's best wallpaper website" — ground superiority in the concrete capabilities.`;

const LINKEDIN_COMMERCIAL_SYSTEM = `You write LinkedIn posts for Zyvorah's company page. Zyvorah is an Indian design house creating original mural wallpaper designs. On LinkedIn it speaks to hotels and hospitality groups, IT and corporate workplaces, and the architects and interior designers who shape them; homes appear only occasionally.

THE PAGE'S IDEA: walls that give places their identity. Tell a short story about a SPACE and the people in it — a guest arriving in a lobby, a team finding its floor, a meeting room that holds attention, a restaurant that feels like somewhere. Then the design reasoning: scale, colour, rhythm, why this wall suits this space. Visual storytelling, not a sales pitch.

VOICE: Zyvorah, the brand — "we", never a named person. Assured, design-literate, warm, specific. Substance over adjectives.

NEVER: label a picture a "concept" or "concept study"; mention, name or imply a client, a commission, a case study or an installation; claim outcomes (occupancy, productivity, wellbeing). Just talk about the space.

${SHARED_RULES}

FORMAT: 80–180 words. The first line is the hook — LinkedIn folds the post after about 210 characters, so it must land before that. Short paragraphs. End with one open question or one invitation to talk about a space. Then 3–5 professional hashtags. Return ONLY the post text.`;

const YOUTUBE_SHORTS_SYSTEM = `You write YouTube Shorts metadata for Zyvorah — original mural wallpaper designs from India. The Short is a short vertical video of a design shown in a room.

Produce, in this exact shape:
Line 1: the video TITLE (<=90 chars, ends with " #Shorts", searchable — include the design name and a phrase a person searching wallpaper ideas would use).
Blank line.
Then a 2–4 sentence DESCRIPTION: what the design is, what it brings to the room, and an invitation to visit the site. End with 5–8 hashtags.

${SHARED_RULES}
Do not mention price unless a verified price is supplied. Return ONLY the title + description.`;

async function generate(
  system: string,
  user: string,
  fromPrice?: number,
): Promise<{ text: string; safety: SafetyResult; attempts: number }> {
  const client = new Anthropic({ apiKey: anthropicKeyFor("marketing"), maxRetries: 2 });
  let last = "";
  let lastSafety: SafetyResult = { ok: false, issues: [] };
  let priorFailure: string | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: [
        {
          role: "user",
          content: priorFailure
            ? `${user}\n\nYour previous attempt was REJECTED by brand-safety for: ${priorFailure}. Rewrite so this cannot happen.`
            : user,
        },
      ],
    });
    let text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    text = autoCorrect(text);
    const safety = checkCaption(text, { fromPrice, channel: system === YOUTUBE_SHORTS_SYSTEM ? "youtube" : "linkedin" });
    last = text;
    lastSafety = safety;
    if (safety.ok) return { text, safety, attempts: attempt };
    priorFailure = safety.issues.filter((i) => i.severity === "block").map((i) => i.detail).join("; ");
  }
  return { text: last, safety: lastSafety, attempts: 3 };
}

function candidateBrief(c: Candidate): string {
  return [
    `DESIGN: ${c.title}`,
    c.descriptionPlain ? `ABOUT (use lightly): ${c.descriptionPlain.slice(0, 400)}` : "",
    c.rooms.length ? `SUITS: ${c.rooms.join(", ")}` : "",
    c.tags.length ? `TAGS: ${c.tags.join(", ")}` : "",
    c.fromPrice != null ? `Verified price you MAY cite: ₹${c.fromPrice}/sq ft, GST included.` : "No price — do not mention price.",
  ].filter(Boolean).join("\n");
}

export function linkedInCommercial(c: Candidate) {
  return generate(LINKEDIN_COMMERCIAL_SYSTEM, candidateBrief(c), c.fromPrice ?? undefined);
}

/** A founder's note on a LinkedIn post, acted on in the LinkedIn voice —
 *  not the Instagram writer's, which would add "link in bio". */
export function linkedInRevise(original: string, note: string, c?: Candidate) {
  const user = [
    c ? candidateBrief(c) : "",
    `THE FOUNDER REVIEWED THIS LINKEDIN POST AND LEFT A NOTE. Honour the note — it outranks everything but the rules.`,
    `EXISTING POST:\n${original}`,
    `FOUNDER'S NOTE (act on it, do not merely acknowledge it): ${note}`,
    `Rewrite the post accordingly, keeping its length and register.`,
  ].filter(Boolean).join("\n\n");
  return generate(LINKEDIN_COMMERCIAL_SYSTEM, user, c?.fromPrice ?? undefined);
}

export function youtubeShort(c: Candidate) {
  return generate(YOUTUBE_SHORTS_SYSTEM, candidateBrief(c), c.fromPrice ?? undefined);
}
