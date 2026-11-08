import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireGatedUser } from "@/lib/auth-server";
import { tasteLearn, TASTE_WEIGHT_CURATION } from "@/lib/taste-server";
import { gatherCandidates, type CuratorCandidate } from "@/lib/curator-catalogue";
import { thumbnailBytesRemote } from "@/lib/media-client";
import {
  PERSONA,
  PLAIN,
  CLOSING,
  slotsFor,
  curationQueries,
  avoidTokens,
  unmetColour,
} from "@/lib/curator-flow";
import { anthropicKeyFor } from "@/lib/ai-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHAT_MODEL = "claude-sonnet-5";
const VISION_MODEL = "claude-haiku-4-5-20251001";

const hasAI = () => Boolean(anthropicKeyFor("shoppers"));

/* ------------------------------- helpers -------------------------------- */

function parseDataUri(uri: string): { media: string; b64: string } | null {
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(uri ?? "");
  return m ? { media: m[1], b64: m[2] } : null;
}

async function downscaleToJpegB64(b64: string): Promise<string> {
  try {
    const buf = Buffer.from(b64, "base64");
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const out = await thumbnailBytesRemote(ab, { width: 768, quality: 82, rotate: true });
    return out.toString("base64");
  } catch {
    return b64;
  }
}

function firstJson<T>(text: string | undefined): T | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

/* ------------------------------ read-room ------------------------------- */

type Analysis = {
  roomType: string;
  summary: string;
  palette: string[];
  moodWords: string[];
  suggestedPurpose: string;
  imageKind: "room" | "inspiration";
};

const READ_SYSTEM =
  "You are Mimi Pip's wallpaper curator, warmly and honestly reading a photo a customer uploaded. " +
  "Reply with ONLY a JSON object: { \"roomType\": string, \"summary\": one or two warm first-person sentences reflecting what you see, " +
  "\"palette\": array of 3-5 hex colours actually present, \"moodWords\": array of 3-6 lowercase adjectives for how it currently feels, " +
  "\"suggestedPurpose\": a short guess at what the room is for (e.g. 'living room', 'nursery', 'an empty room'), " +
  "\"imageKind\": \"room\" if this is a real space the customer wants to put wallpaper in (plain/empty walls, furniture, an actual lived-in interior), " +
  "or \"inspiration\" if it's an already-finished, styled design or reference — a mural/artwork shown as the star of the shot, or a polished picture-perfect scene that already looks complete and is more likely a look they like than a room to redo }.";

async function readRoom(body: { room?: string; wide?: string }) {
  const room = body?.room ? parseDataUri(body.room) : null;
  const fallback: Analysis = { roomType: "your room", summary: "", palette: [], moodWords: [], suggestedPurpose: "your room", imageKind: "room" };
  if (!room) return NextResponse.json({ analysis: fallback });
  if (!hasAI()) return NextResponse.json({ analysis: fallback });

  try {
    const client = new Anthropic({ apiKey: anthropicKeyFor("shoppers") });
    const content: Anthropic.ContentBlockParam[] = [];
    const roomB64 = await downscaleToJpegB64(room.b64);
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: roomB64 } });
    const wide = body?.wide ? parseDataUri(body.wide) : null;
    if (wide) {
      const wideB64 = await downscaleToJpegB64(wide.b64);
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: wideB64 } });
    }
    content.push({ type: "text", text: wide ? "First image is a close view, second a wider shot of the same room. Read the room." : "Read this room." });

    const res = await client.messages.create({
      model: VISION_MODEL,
      max_tokens: 500,
      system: READ_SYSTEM,
      messages: [{ role: "user", content }],
    });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const parsed = firstJson<Partial<Analysis>>(text);
    return NextResponse.json({ analysis: { ...fallback, ...(parsed ?? {}) } });
  } catch {
    return NextResponse.json({ analysis: fallback });
  }
}

/* ------------------------------- converse ------------------------------- */

// When the uploaded photo is a finished design / inspiration rather than a real
// room, ask this first so we never assume a lovely reference is a space to redo.
const INTENT_SLOT = {
  id: "intent",
  question:
    "whether they want a wallpaper in the SPIRIT of this already-finished image for their own wall, or whether this is actually their own space they'd like to redo — asked warmly, acknowledging the image already looks lovely",
};
const INTENT_PLAIN =
  "This already looks beautifully finished! Would you like a design in this spirit for your own wall — or is this a space of yours you'd like to redo?";

async function converse(body: {
  answers?: Record<string, string>;
  lastSlotId?: string;
  lastAnswer?: string;
  asked?: string[];
  summary?: string;
  imageKind?: "room" | "inspiration";
}) {
  const answers = { ...(body?.answers ?? {}) };
  if (body?.lastSlotId && body?.lastAnswer?.trim()) answers[body.lastSlotId] = body.lastAnswer.trim();

  let slots = slotsFor(answers);
  if (body?.imageKind === "inspiration" && !answers.intent) slots = [INTENT_SLOT, ...slots];

  const next = slots.find((s) => !answers[s.id]);
  const done = !next;
  let question = done ? CLOSING : (next!.id === "intent" ? INTENT_PLAIN : PLAIN[next!.id]!);

  if (next && hasAI()) {
    try {
      const client = new Anthropic({ apiKey: anthropicKeyFor("shoppers") });
      const ctx = [
        body?.summary ? `What you already saw in their room: ${body.summary}` : "",
        body?.lastAnswer ? `They just said: "${body.lastAnswer}". Acknowledge it warmly and briefly, then ask.` : "This is the opening of the conversation — a warm hello that shows you've looked at their room, then the question.",
        (body?.asked ?? []).length ? `You have ALREADY said these — never echo their wording: ${(body!.asked ?? []).slice(-8).map((q) => `"${q}"`).join(" ")}` : "",
        `The single thing to draw out of them next, in your own fresh words: ${next.question}`,
      ].filter(Boolean).join("\n");
      const res = await client.messages.create({
        model: CHAT_MODEL,
        max_tokens: 300,
        system: PERSONA,
        messages: [{ role: "user", content: ctx }],
      });
      const worded = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
      if (worded) question = worded;
    } catch {
      /* keep the plain phrasing */
    }
  }

  return NextResponse.json({ answers, slotId: next?.id ?? null, question, done, aiPhrasing: hasAI() });
}

/* -------------------------------- curate -------------------------------- */

export type CuratorPick = {
  handle: string;
  title: string;
  flatUrl: string | null;
  flatAlt: string;
  fromPricePerSqft: number | null;
  rationale: string;
  url: string;
  /** Whether this design can be ordered as a design sample — samples are
   *  offered on one collection today (see SAMPLE_COLLECTION_TAGS), so the
   *  card must not offer one for anything else. */
  sampleable: boolean;
};

function templateRationale(c: CuratorCandidate): string {
  const style = c.tags.find((t) => /floral|botanical|landscape|geometric|tropical|abstract|chinoiserie/i.test(t));
  return `A considered Mimi Pip design${style ? ` — ${style.toLowerCase()}` : ""} that suits the room you described.`;
}

function toPick(c: CuratorCandidate, rationale: string): CuratorPick {
  return {
    handle: c.handle,
    title: c.title,
    flatUrl: c.flatUrl,
    flatAlt: c.flatAlt,
    fromPricePerSqft: c.fromPricePerSqft,
    rationale,
    url: `/products/${c.handle}`,
    sampleable: c.sampleable === true,
  };
}

async function curate(body: { answers?: Record<string, string>; summary?: string }) {
  const answers = body?.answers ?? {};
  const queries = curationQueries(answers);
  const candidates = await gatherCandidates(queries);

  if (!candidates.length) return NextResponse.json({ picks: [], note: "" });

  const avoid = avoidTokens(answers);
  const unmet = unmetColour(answers, candidates.map((c) => `${c.title} ${c.tags.join(" ")}`).join(" "));
  const fallbackNote = unmet
    ? `I couldn't find a true ${unmet} in the collection — these are the closest I have, chosen to carry the same spirit.`
    : "";

  const fallback: CuratorPick[] = candidates.slice(0, 10).map((c) => toPick(c, templateRationale(c)));

  // A completed curation is a distilled statement of the customer's taste —
  // blend the (mean of the) picked designs into their taste profile so the
  // rest of the site ("Picked for you") learns from the conversation.
  const learn = (picks: CuratorPick[]) =>
    tasteLearn({ handles: picks.map((p) => p.handle), weight: TASTE_WEIGHT_CURATION });

  if (!hasAI()) {
    const withTaste = await learn(fallback);
    return withTaste(NextResponse.json({ picks: fallback, note: fallbackNote }));
  }

  try {
    const client = new Anthropic({ apiKey: anthropicKeyFor("shoppers") });
    const list = candidates
      .map((c, i) => `${i + 1}. ${c.title} [handle: ${c.handle}] — tags: ${c.tags.join(", ") || "—"}`)
      .join("\n");
    const prompt =
      `The customer's room: ${body?.summary || "—"}\n` +
      `What they told me: ${JSON.stringify(answers)}\n` +
      (avoid.length ? `Steer clear of: ${avoid.join(", ")}.\n` : "") +
      (unmet ? `(My own check suggests the collection may lack a true ${unmet} — verify against the tags.)\n` : "") +
      `\nHere are real Mimi Pip wallpapers to choose from:\n${list}\n\n` +
      `Choose the 8-12 that genuinely suit THIS room and their wishes, best first (fewer only if the collection truly doesn't have that many good fits). Their words are the brief: if they named a colour or asked for bright/bold, the picks must visibly deliver it — never substitute. ` +
      `For a prayer/puja room, honour their stated tradition and think laterally (serenity, symmetry, lotus, gardens can all feel devotional) — never assume a religion. ` +
      `Write ONE warm sentence per pick on why you chose it, referencing their words. ` +
      `BE HONEST: if the collection can't truly give them something they asked for, say so in "note" (one warm sentence, e.g. "I couldn't find a true bright yellow — these are the closest"); otherwise leave "note" as "". ` +
      `Reply with ONLY JSON: {"note": string, "picks": [{"handle": string, "rationale": string}]}.`;

    const res = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1500,
      system: "You are Mimi Pip's wallpaper curator. You recommend only from the real designs given to you, and you are honest when the collection falls short.",
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const parsed = firstJson<{ note?: string; picks?: { handle?: string; rationale?: string }[] }>(text);

    const byHandle = new Map(candidates.map((c) => [c.handle, c]));
    const picks: CuratorPick[] = [];
    for (const row of parsed?.picks ?? []) {
      const c = row.handle ? byHandle.get(row.handle) : undefined;
      if (c && !picks.some((p) => p.handle === c.handle)) picks.push(toPick(c, (row.rationale ?? "").trim() || templateRationale(c)));
      if (picks.length >= 12) break;
    }
    if (picks.length < 8) {
      for (const c of candidates) {
        if (picks.length >= 8) break;
        if (!picks.some((p) => p.handle === c.handle)) picks.push(toPick(c, templateRationale(c)));
      }
    }
    const note = (parsed?.note ?? "").trim() || fallbackNote;
    const finalPicks = picks.length ? picks : fallback;
    const withTaste = await learn(finalPicks);
    return withTaste(NextResponse.json({ picks: finalPicks, note }));
  } catch {
    const withTaste = await learn(fallback);
    return withTaste(NextResponse.json({ picks: fallback, note: fallbackNote }));
  }
}

/* -------------------------------- router -------------------------------- */

export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  // Sonnet 5 + Haiku vision, and curate() self-chains — so one caller can spend
  // several model calls per action. Email-verified customers only.
  const { blocked } = await requireGatedUser();
  if (blocked) return blocked;

  const { path } = await params;
  const action = path?.[0] ?? "";
  const body = await req.json().catch(() => ({}));
  switch (action) {
    case "read-room":
      return readRoom(body);
    case "converse":
      return converse(body);
    case "curate":
      return curate(body);
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 404 });
  }
}
