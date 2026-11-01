import { serviceFetch } from "../brand/service-transport";
const fetch: typeof globalThis.fetch = (input,init) => serviceFetch("ai",input,init);
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { presUpload, presDownload, presSignedUrl } from "./presentation-store";
import { imageForModel, imageBlock, type ModelImage } from "./studio-model-image";
import {
  splitCuratedBlocks, presentablePalette, paletteSheetHtml, paletteStripHtml, parseShare,
  ensureChapterPalettes, ensureChapterHeroes, captureChapterHeroes,
  galleryHtml, heroHtml, galleryStyles, galleryScript, shortlistButtonHtml, compareFurnitureHtml,
  restyleDeck, repairComparisonBases,
} from "./curated-doc";
import type { PaletteSwatch, CuratedOption } from "./curated-doc";
import { anthropicKeyFor } from "@/lib/ai-keys";

// The Proposal Studio's three agents.
//
// Division of labour is Roheena's, not an implementation accident:
//   THE CREATIVE  (Claude)  — design direction: vibe, palette, mood, a
//                             wallpaper concept per photographed space. It
//                             READS the photographs (vision) and answers in
//                             structured output. Concept art on demand stays
//                             on OpenAI's gpt-image-2, the same model as the
//                             catalogue scene pipeline.
//                             (Until 26 October 2026 the creative and the
//                             per-photo space read ran on OpenAI chat
//                             completions pinned to gpt-4o — the only chat
//                             model call on the site, and the one nothing
//                             else exercised. Every call failed in about two
//                             seconds: all seven photographs the OS uploaded
//                             that day came through with no space read, and
//                             the OS's first `creative` answered 502. The
//                             image model worked throughout, so the two text
//                             agents moved to the Claude the presenter and
//                             reviewer already spend on.)
//   THE PRESENTER (Claude)  — writes the presentation, in the house design
//                             system of the Outcreate decks.
//   THE REVIEWER  (Claude)  — outside editor: simple words, extremely
//                             thoughtful, nothing claimed beyond the briefing.
//
// Her briefing is the only human input; everything below treats it as the
// contract. No agent may invent facts about the client that the briefing and
// the photographs do not contain.

// Overridable because OpenAI renames models more often than we deploy.
const RESEARCH_MODEL = process.env.OPENAI_RESEARCH_MODEL || "gpt-4o";
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
// The space read is a factual caption of one photograph: the cheaper model.
// The creative direction is the judgement a client approves: the same tier
// the presenter writes on.
const VISION_MODEL = process.env.STUDIO_VISION_MODEL || "claude-sonnet-5-5";
const CREATIVE_MODEL = process.env.STUDIO_CREATIVE_MODEL || "claude-opus-5-5";
const PRESENTER_MODEL = "claude-opus-5";
const REVIEWER_MODEL = "claude-opus-5";

/* ========================================================================== */
/* Storage helpers                                                            */
/* ========================================================================== */

export async function studioUpload(path: string, body: Buffer | ArrayBuffer, contentType: string) {
  // A deck is written to the SAME path every time it is composed, reviewed or
  // repaired — hence upsert. Nothing in this store is served cacheable.
  const { error } = await presUpload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`upload failed: ${error.message}`);
}

export async function studioDownload(path: string): Promise<Buffer> {
  const { data, error } = await presDownload(path);
  if (error || !data) throw new Error(`download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** A bearer URL for one studio object, served from R2 by
 *  /api/files/presentations — never a Supabase storage URL, which is metered
 *  egress on every open (see lib/presentation-store.ts). */
export async function studioSignedUrl(path: string, seconds = 3600): Promise<string | null> {
  return await presSignedUrl(path, seconds);
}

/** Binary upload for curated concept boards. Kept as its own name for the
 *  call sites; the cache split it carried was a Supabase CDN concern. */
export async function studioUploadBinary(path: string, body: Buffer, contentType: string) {
  const { error } = await presUpload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`upload failed: ${error.message}`);
}

/** The deck rendition of a concept board.
 *
 *  Her boards are 3-4 MB PNGs and a single option carries five of them; the LTM
 *  deck carries twenty-five. Embedding the originals makes a page no client can
 *  open on a phone, which is the same lesson the launch email learned when its
 *  heroes went from 18 MB to 1.15 MB by shipping renditions. Measured on her LTM
 *  boards: a 1790x879 PNG of 3.43 MB becomes a 1600x786 JPEG of 437 KB, so the
 *  twenty-five-board deck weighs 10.7 MB rather than 78 MB — and the presenter
 *  is told to lazy-load them on top of that. The originals stay in the bucket:
 *  the rendition is for reading, not the record. */
export async function conceptRendition(original: Buffer): Promise<Buffer> {
  return sharp(original, { failOn: "none" })
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/* ========================================================================== */
/* Agent 1a — space identification, run per photo at upload time.             */
/* ========================================================================== */

export type SpaceAnalysis = {
  space: string;        // "reception", "corridor", "cafeteria"…
  read: string;         // what the photo shows, one paragraph
  light: string;        // natural/artificial, direction, warmth
  constraints: string;  // columns, glazing, existing art, signage…
};

/** The studio's Claude, on the proposals key (AGENTS.md: one key per workflow). */
function studioClaude(): Anthropic {
  const apiKey = anthropicKeyFor("proposals");
  if (!apiKey) throw new Error("no Anthropic key for the proposals workflow (ANTHROPIC_KEY_PROPOSALS or the shared key)");
  return new Anthropic({ apiKey });
}

export { imageForModel, type ModelImage };

const SpaceAnalysisSchema = z.object({
  space: z.string().describe("Space type in 1-3 words, e.g. 'reception', 'open work floor'"),
  read: z.string().describe("What the photograph shows, one tight paragraph"),
  light: z.string().describe("Light conditions in one sentence"),
  constraints: z.string().describe("Anything a wall design must work around, one sentence"),
});

export async function identifySpace(image: Buffer, mime: string, userLabel: string | null): Promise<SpaceAnalysis> {
  const shown = await imageForModel(image, mime);
  if (!shown) throw new Error("photograph too large to read");
  const res = await studioClaude().messages.parse({
    model: VISION_MODEL,
    max_tokens: 2000,
    system:
      "You are the creative director's site surveyor for a wallpaper studio. Read one client photograph of a commercial interior and describe it for the design team. Factual only — never guess a company, city, or purpose the image doesn't show.",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userLabel ? `The client labelled this: "${userLabel}".` : "No label was given." },
          imageBlock(shown),
        ],
      },
    ],
    output_config: { format: zodOutputFormat(SpaceAnalysisSchema) },
  });
  if (!res.parsed_output) throw new Error("surveyor returned no reading");
  return res.parsed_output;
}

/* ========================================================================== */
/* Agent 1a2 — THE RESEARCHER: OpenAI with web search, pointed by Roheena.    */
/* ========================================================================== */

export type ResearchFindings = {
  summary: string;   // what was learned, a few tight paragraphs
  sources: string[]; // URLs actually consulted
};

/** Web research via the OpenAI Responses API. `directions` is Roheena's own
 *  instruction ("look at their brand language", "find press coverage of their
 *  Kolkata campus"); the briefing rides along as context. Findings are fed to
 *  the creative and presenter AS RESEARCH — both are told it is secondary to
 *  the briefing and never becomes a client-facing claim. */
export async function runResearch(briefing: string, directions: string): Promise<ResearchFindings> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: RESEARCH_MODEL,
      tools: [{ type: "web_search" }],
      input: [
        {
          role: "system",
          content:
            "You research for a wallpaper studio preparing a client proposal. Search the web and report only what you actually find, naming the source URL for each claim. Never speculate; where something can't be verified, say so.",
        },
        {
          role: "user",
          content: `CONTEXT — the internal briefing (do not research beyond what's asked):\n${briefing}\n\nRESEARCH DIRECTIONS FROM THE FOUNDER:\n${directions}`,
        },
      ],
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);

  // The Responses API returns output items; `output_text` is the convenience
  // concatenation when present. Source URLs come from citation annotations.
  type OutItem = { type?: string; content?: { type?: string; text?: string; annotations?: { url?: string }[] }[] };
  let summary: string = typeof j.output_text === "string" ? j.output_text : "";
  const sources = new Set<string>();
  for (const item of (j.output ?? []) as OutItem[]) {
    for (const c of item.content ?? []) {
      if (!summary && typeof c.text === "string") summary += c.text;
      for (const a of c.annotations ?? []) if (a.url) sources.add(a.url);
    }
  }
  if (!summary.trim()) throw new Error("research returned nothing");
  return { summary: summary.trim(), sources: [...sources] };
}

/* ========================================================================== */
/* Agent 1b — THE CREATIVE: full design direction from briefing + spaces.     */
/* ========================================================================== */

export type CreativeDirection = {
  vibe: string[];                       // 4-6 words
  narrative: string;                    // the design story, one paragraph
  palette: { name: string; hex: string; role: string }[]; // 5 swatches
  moodboard: string;                    // textures/materials/references, prose
  spaces: {
    label: string;                      // ties back to an uploaded image label
    concept_title: string;
    concept: string;                    // the wallpaper concept for that wall
    palette_refs: string[];             // names from the palette
    image_prompt: string;               // ready-to-render gpt-image prompt
    image_path?: string;                // set once concept art is rendered
  }[];
};

const CreativeDirectionSchema = z.object({
  vibe: z.array(z.string()).describe("4-6 single words or short phrases"),
  narrative: z.string().describe("The design story, one paragraph"),
  palette: z.array(z.object({
    name: z.string(), hex: z.string().describe("#RRGGBB"),
    role: z.string().describe("ground / accent / support…"),
  })).describe("5 swatches"),
  moodboard: z.string().describe("Textures, materials, references — prose"),
  spaces: z.array(z.object({
    label: z.string().describe("Ties back to an uploaded photograph's label"),
    concept_title: z.string(),
    concept: z.string().describe("The wallpaper concept for that wall"),
    palette_refs: z.array(z.string()).describe("Names from the palette"),
    image_prompt: z.string().describe("A ready-to-render image prompt for the flat artwork"),
  })),
});

export async function runCreative(
  briefing: string,
  images: { label: string | null; analysis: SpaceAnalysis | null; image: ModelImage | null }[],
  research: ResearchFindings | null,
): Promise<CreativeDirection> {
  const spacesText = images.length
    ? images
        .map((im, i) =>
          `Photo ${i + 1} — label: ${im.label ?? "none"}; ` +
          (im.analysis
            ? `space: ${im.analysis.space}; read: ${im.analysis.read}; light: ${im.analysis.light}; constraints: ${im.analysis.constraints}`
            : "not analysed") +
          (im.image ? "" : " (photograph not shown — too large; go by the read)"),
        )
        .join("\n")
    : "No photographs yet — direction comes from the briefing alone; propose spaces the briefing implies.";

  const res = await studioClaude().messages.parse({
    model: CREATIVE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      "You are the creative director at Zyvorah, a studio that curates and prints exact-size wallpaper and murals for workplaces in India.",
      "You receive the founder's briefing — treat it the way a design head treats a client brief: it is the contract. Add craft, never facts.",
      "House taste: considered, editorial, culturally specific, never postcard-generic. Palettes are named and usable (real hex). One bold move per project, everything around it quiet.",
      "Every image_prompt must describe a finished wallpaper/mural design as flat artwork (no rooms, no furniture, no text in the artwork), specific enough that an image model produces something a client could approve.",
      "One entry in `spaces` per photographed space, in the order given, each `label` exactly the photograph's label.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        // The photographs travel as actual images, not only our text read of
        // them — "this is how it's going to be" needs the model to SEE the site.
        content: [
          {
            type: "text",
            text:
              `THE BRIEFING:\n${briefing}\n\nTHE PHOTOGRAPHED SPACES (described; the photographs themselves follow in order):\n${spacesText}` +
              (research
                ? `\n\nRESEARCH FINDINGS (secondary to the briefing — background for your direction, never a client-facing claim):\n${research.summary}`
                : ""),
          },
          ...images.filter((im) => im.image).map((im) => imageBlock(im.image as ModelImage)),
        ],
      },
    ],
    output_config: { format: zodOutputFormat(CreativeDirectionSchema) },
  });
  if (!res.parsed_output) throw new Error("creative returned no direction");
  return res.parsed_output as CreativeDirection;
}

/** Concept art for one space — flat artwork, not a room render. */
export async function renderConcept(prompt: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt:
        `Flat wallpaper artwork, presented straight-on as a full-bleed design with no room, no furniture, no frame, no text or watermark. ${prompt}`,
      size: "1536x1024",
      quality: "medium",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image returned");
  return Buffer.from(b64, "base64");
}

/** The client's own wall, wearing one direction.
 *
 *  Two images go in: the photograph of the space, and the flat concept board.
 *  The photograph leads because it is the thing that must survive — the room's
 *  geometry, its light, its furniture and the people in it are the client's,
 *  not ours, and a "visualisation" that quietly restyles their reception is
 *  worse than no visualisation. The board rides second as the reference the
 *  wall is to wear, the same two-image shape the catalogue scene pipeline uses.
 */
export async function renderInSitu(input: {
  sitePhoto: Buffer;
  board: Buffer;
  spaceLabel: string | null;
  analysis: SpaceAnalysis | null;
  optionTitle: string;
  /** Transparent over the wall the mural may occupy, opaque everywhere else.
   *  With one, the model repaints a wall; without one it regenerates the room —
   *  the first real render moved the camera and rearranged their desks. */
  mask?: Buffer | null;
}): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const where = input.spaceLabel ? `the ${input.spaceLabel}` : "this space";
  const constraints = input.analysis?.constraints ? ` Work around: ${input.analysis.constraints}.` : "";
  const light = input.analysis?.light ? ` The light here: ${input.analysis.light}.` : "";

  const form = new FormData();
  form.append("model", IMAGE_MODEL);
  form.append("size", "1536x1024");
  form.append("quality", "medium");
  // `image[]`, not two `image` fields: the API rejects a repeated `image` with
  // "Duplicate parameter" and the array syntax is how a reference image travels
  // alongside the photograph. The order is the meaning — the room first, the
  // artwork second, matching the prompt's "second image".
  form.append("image[]", new Blob([new Uint8Array(input.sitePhoto)], { type: "image/jpeg" }), "space.jpg");
  form.append("image[]", new Blob([new Uint8Array(input.board)], { type: "image/jpeg" }), "artwork.jpg");
  // The mask is what makes this a before/after rather than a second, similar
  // room. Its transparent region is the only place the model may paint.
  if (input.mask) {
    form.append("mask", new Blob([new Uint8Array(input.mask)], { type: "image/png" }), "wall-mask.png");
  }
  form.append(
    "prompt",
    `Photograph of ${where} in a working office. Apply the artwork from the second image to the ` +
      (input.mask ? `masked wall area only` : `main feature wall`) +
      ` as a printed wall mural, following the wall's perspective, and let the room's own ` +
      `light fall across it.${light}${constraints} ` +
      `Keep the identical framing, crop and camera position — do not zoom, pan or recompose. ` +
      `Change NOTHING else: keep the architecture, the ceiling, the floor, the furniture, the signage ` +
      `and every person exactly as photographed. Do not restyle, tidy, relight or redecorate the room, ` +
      `and do not add or move furniture or objects. The result must read as the same photograph with ` +
      `one wall now carrying the mural.`,
  );

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`openai ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image returned");
  return Buffer.from(b64, "base64");
}

/* ========================================================================== */
/* Agent 2 — THE PRESENTER: Claude writes the deck.                           */
/* ========================================================================== */

// The house design system, distilled from "Outcreate, Kolkata". The presenter
// gets rules, not a file to copy, so each deck is composed rather than
// find-and-replaced.
const HOUSE_STYLE = `
DESIGN SYSTEM (Zyvorah for Workplaces — follow exactly):
- Single self-contained HTML file. Inter from Google Fonts. Light, printed-paper
  world in every theme: bg #FAFAF8, wash sections #F3EEE7, ink #2D2D2D,
  soft ink #6B6B6B, hairlines #E0E0E0, taupe family #8C7B6B/#6B5D4F/#EFE8DF.
  Declare these as :root CSS variables and pin the identical values inside
  "@media (prefers-color-scheme: dark){ :root:not([data-theme='light']){...} }"
  and ":root[data-theme='dark']{...}" so the page holds its look in dark mode.
  body always sets background from the variable.
- ONE accent colour for the whole deck, drawn from the creative palette (pick
  its strongest accent). Used only for eyebrows, small labels, and hover.
- Structure: hero (eyebrow "Zyvorah for Workplaces · Prepared for <client>",
  huge h1 thesis, lede) → numbered sections with uppercase letter-spaced
  eyebrows (01 —, 02 —…) alternating white/wash → closing "next step" section
  with 3 step cards and a dark CTA button → footer with letter-spaced ZYVORAH.
- Max width 920px, generous padding (~88px section vertical), h2 clamp(24px,3vw,32px),
  intro paragraphs #6B6B6B max-width 62ch.
- Scroll reveals: .reveal { opacity/translate transition } with an
  IntersectionObserver adding .in; honour prefers-reduced-motion.
- Client photographs and concept images: <img> with border-radius 4px, a
  caption row underneath (12px, #6B6B6B, flex space-between).
- The palette is ONE PROPORTIONAL STRIP, not a row of equal squares — each
  colour as wide as its share of the design, names beneath in 12px #6B6B6B.
  Where a strip is supplied as ready-made markup, place it verbatim. Never print
  a hex value, a percentage or a mixing note in a client deck: the strip shows
  the balance, and the numbers are internal.
- No emoji, no stock-photo language, no lorem. British-leaning, calm copy.`;

export async function composeDeck(input: {
  clientName: string;
  briefing: string;
  research: ResearchFindings | null;
  creative: CreativeDirection;
  images: { label: string | null; url: string; analysis: SpaceAnalysis | null }[];
  conceptUrls: { label: string; url: string }[];
}): Promise<string> {
  const anthropic = new Anthropic({ apiKey: anthropicKeyFor("proposals") });

  const stream = anthropic.messages.stream({
    model: PRESENTER_MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    system: [
      "You are Zyvorah's presentation lead. You turn the founder's briefing and the creative director's direction into the client-facing proposal page itself.",
      "Output ONLY the complete HTML document content (no markdown fences, no commentary). Start with <title>.",
      "The briefing is the contract: every claim about the client must come from it or from the photograph labels. Craft is yours; facts are not.",
      "Embed the supplied image URLs directly in <img src> — they are pre-signed and valid.",
      HOUSE_STYLE,
    ].join("\n\n"),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          client: input.clientName,
          briefing: input.briefing,
          research_findings_secondary_to_briefing: input.research,
          creative_direction: input.creative,
          client_photographs: input.images.map((i) => ({ label: i.label, url: i.url, analysis: i.analysis })),
          rendered_concepts: input.conceptUrls,
        }),
      },
    ],
  });
  const msg = await stream.finalMessage();
  const html = msg.content.find((b) => b.type === "text")?.text ?? "";
  const start = html.indexOf("<title>");
  if (start < 0) throw new Error("presenter returned no document");
  return html.slice(start);
}

/* ========================================================================== */
/* CURATED MODE — she wrote it; the studio only formats and presents it.      */
/* ========================================================================== */

// The rule underneath everything below, and the reason curated mode exists as
// its own path rather than a flag on the creative:
//
//   In studio mode the model invents the direction and Roheena approves it.
//   In curated mode Roheena IS the direction, and the model's only job is to
//   set it beautifully. No claim, no colour name, no sentence of hers may be
//   improved, expanded, or replaced.
//
// Colour naming is the sharpest edge of that. "Bengal ink", "madder red",
// "faded turmeric ochre" are her words about her artwork and may never be
// rewritten. The pigment itself is different: she asked (2026-09-06) for the
// parser's colour read to be APPLIED, not parked behind an accept button — so
// the parser prefills `hex` from its own reading of her colour names, she
// edits or clears any swatch in the studio, and whatever she saves is final.
// `hex_suggestion` still records what the parser offered (the studio shows it
// only on a swatch she has cleared), and it is stripped before the presenter
// ever sees the palette.

// The pure text rules live in ./curated-doc so they can be pinned by a test
// that needs no AI key and no network. Re-exported here so callers keep one
// import for the whole studio engine.
export {
  splitCuratedBlocks, presentablePalette, paletteSheetHtml, paletteStripHtml, parseShare,
  ensureChapterPalettes, ensureChapterHeroes, captureChapterHeroes,
  galleryHtml, heroHtml, galleryStyles, galleryScript, shortlistButtonHtml, compareFurnitureHtml,
  restyleDeck, repairComparisonBases,
};
export type { PaletteSwatch, CuratedOption };

const CuratedParseSchema = z.object({
  options: z.array(
    z.object({
      block_index: z.number().int().describe("Index into the numbered block list you were given."),
      title: z.string().describe("The direction's name, exactly as she wrote it in the heading."),
      tagline: z
        .string()
        .describe("The one line saying what this direction says about the client, taken from the document — her words, trimmed, not rewritten."),
      palette: z.array(
        z.object({
          name: z.string().describe("The colour name exactly as she wrote it, e.g. 'Bengal ink, indigo and charcoal'."),
          pct: z.string().nullable().describe("The share she gave it, verbatim, e.g. '60-65%'. Null if she gave none."),
          role: z.string().nullable().describe("What she says it does, in a few words drawn from her prose. Null if she says nothing."),
          hex_suggestion: z
            .string()
            .nullable()
            .describe("The #RRGGBB this colour name most plausibly means; it is prefilled on the swatch for her to edit. Null only where a name implies no particular colour at all."),
        }),
      ),
    }),
  ),
});

/** Read her document and PREFILL the option rows.
 *
 *  Prefill is the whole contract of this function. Titles, taglines and palette
 *  rows are starting points she edits; the prose is sliced from the document by
 *  splitCuratedBlocks and never passes through the model at all. Re-running
 *  overwrites her edits, which is why the studio warns before it does. */
export async function parseCurated(doc: string): Promise<CuratedOption[]> {
  const blocks = splitCuratedBlocks(doc);
  if (blocks.length === 0) throw new Error("the document is empty");

  const anthropic = new Anthropic({ apiKey: anthropicKeyFor("proposals") });
  const catalogue = blocks
    .map((b, i) => `[${i}] heading: ${b.heading || "(no heading — document preamble)"}\n${b.text.slice(0, 1200)}`)
    .join("\n\n---\n\n");

  const res = await anthropic.messages.parse({
    model: PRESENTER_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      "You are reading a proposal document written by the founder of a wallpaper studio. It presents several alternative creative directions the client will choose between.",
      "Your only job is to say which blocks are the alternative directions, and to pull the title, the one-line 'what it says about the client', and the colour palette rows out of each.",
      "Skip blocks that are introduction, comparison or closing material — only blocks that ARE a direction.",
      "You are not an editor. Do not improve, shorten, expand or rephrase anything. Quote her words.",
      "COLOUR NAMES ARE HERS AND MAY NOT BE CHANGED. Copy each name exactly as written, however long or unusual. Never substitute a tidier or more standard colour name.",
      "hex_suggestion is prefilled onto the swatch for her to edit or clear, so give your best plausible #RRGGBB for each colour name — read it in the context of her own palette description. Leave it null only where a name implies no particular colour at all.",
    ].join("\n"),
    messages: [{ role: "user", content: `THE DOCUMENT, split into blocks:\n\n${catalogue}` }],
    output_config: { format: zodOutputFormat(CuratedParseSchema) },
  });

  const parsed = res.parsed_output;
  if (!parsed) throw new Error("the parser returned nothing usable");

  return parsed.options
    .filter((o) => blocks[o.block_index])
    .map((o, i) => ({
      position: i + 1,
      title: o.title.trim() || blocks[o.block_index].heading,
      tagline: o.tagline.trim(),
      // Sliced, not generated: her prose reaches the row byte for byte.
      body_md: blocks[o.block_index].text,
      palette: o.palette.map((p) => {
        const suggestion = p.hex_suggestion?.trim() || null;
        return {
          name: p.name.trim(),
          // Applied, not parked: her 2026-09-06 call. She edits or clears it
          // in the studio; a malformed value is treated as no colour.
          hex: suggestion && /^#[0-9a-fA-F]{6}$/.test(suggestion) ? suggestion : null,
          role: p.role?.trim() || null,
          pct: p.pct?.trim() || null,
          hex_suggestion: suggestion,
        };
      }),
    }));
}

const CURATED_RULES = `
CURATED MODE — the founder wrote this proposal. You are setting it, not writing it.
- Her document is the contract AND the copy. Reproduce her prose; format it into
  the design system. Do not rewrite, shorten, expand, summarise or "improve" a
  sentence of hers, and do not add a claim, benefit or statistic she did not write.
- COLOUR NAMES ARE HERS. Print each swatch label exactly as given. Never rename a
  colour, never translate it into a standard colour name, never add a hex.
- PALETTE DETAILS ARE INTERNAL. The palette reaches you only as finished markup
  in "palette_strip_html" plus the colour names. Never print a percentage, a hex
  value or a role anywhere in the deck — the strip's proportions already say
  what the numbers said, and the numbers themselves are ours, not the client's.
- A swatch whose hex is null renders as a NEUTRAL LABELLED CHIP — a #EFE8DF
  square with a hairline border and the name beneath — never as a colour you
  chose. This is deliberate: an invented colour would misrepresent artwork the
  client is about to look at.
- The accent colour for the deck comes from an accepted hex in her palettes if
  there is one; if every hex is null, use the house taupe #8C7B6B. Do not derive
  an accent from a colour NAME.

STRUCTURE for a curated multi-option deck:
- Hero: eyebrow "Zyvorah for Workplaces · Prepared for <client>", the document's
  own thesis as the h1, her opening paragraphs as the lede.
- One shared story section carrying her introduction — why these directions
  exist and what they have in common.
- Then ONE NUMBERED CHAPTER PER OPTION, in her order. Each chapter's <section>
  MUST carry data-chapter="<position>" — the compare view finds chapters by it.
  Each chapter, IN THIS ORDER: the eyebrow number, her title in an <h2>, her
  tagline, "hero_html", "shortlist_button_html", her prose with her own
  sub-headings kept, THEN "palette_strip_html", THEN "gallery_html". Nothing
  between the strip and the gallery, and nothing after the gallery inside the
  chapter.
- THE HERO COMES BEFORE THE PROSE, ALWAYS. "hero_html" is one full-width
  picture — their own wall with the design on it where we have one, her lead
  concept board otherwise — and it belongs directly under the tagline, above
  the first paragraph. This is not a stylistic preference: a client was
  scrolling past six hundred words to reach a thumbnail, and the artwork is the
  pitch. Never move it below her prose, never shrink it, never caption it with
  a sentence of your own.
- FOUR BLOCKS ARRIVE FINISHED: "hero_html", "palette_strip_html",
  "gallery_html" and "shortlist_button_html". PLACE EACH VERBATIM — copy the block exactly as
  given. Do not restyle them, re-derive a width, re-order the pictures, add or
  remove a caption, split them across the chapter, or wrap them in anything that
  changes their width. They are what the founder approved and they are already
  responsive; a deck that rebuilds them is a deck whose pictures no longer match
  the studio. You never receive the individual image URLs — the gallery block is
  the only place the pictures exist.
- The gallery holds her concept boards in one row and, beneath them, the
  client's own photographed walls carrying the design, each with a divider the
  reader drags. Introduce it in ONE short sentence of your own before the block
  — the pictures then speak. Do not narrate what is in them.
- Then a comparison table: one row per direction, her title against her tagline,
  so the whole choice is visible on one screen.
- Then a closing section that asks the client, in simple warm English, which
  direction they would like to take forward. Tell them plainly: reply with the
  number, one to five, in the comment box on this page. Add one sentence saying
  they can star any two directions with "Shortlist this direction" and see them
  side by side. No form, no email address, no pricing, no timeline — none of
  that is settled.
- Site photographs of the client's own building, where supplied, belong in the
  shared story section, captioned with their labels.
- Every <img> below the hero carries loading="lazy" and decoding="async". A
  five-direction deck is twenty-five boards; without this the client waits for
  all of them before seeing the first.`;

export async function composeCuratedDeck(input: {
  clientName: string;
  document: string;
  options: {
    position: number;
    title: string;
    tagline: string;
    body_md: string;
    // The strip arrives already built, so the deck cannot re-derive it wrongly;
    // the names ride along for captions and alt text.
    palette_strip_html: string;
    // The one full-width picture that opens the chapter, above her prose.
    hero_html: string;
    palette_names: string[];
    // The chapter's whole media block — her boards in a row, and beneath them
    // the client's own walls with a divider to drag — plus the shortlist
    // button for its header. Both arrive finished, to be placed as given.
    gallery_html: string;
    shortlist_button_html: string;
  }[];
  sitePhotos: { label: string | null; url: string; analysis: SpaceAnalysis | null }[];
}): Promise<string> {
  const anthropic = new Anthropic({ apiKey: anthropicKeyFor("proposals") });

  const stream = anthropic.messages.stream({
    model: PRESENTER_MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    system: [
      "You are Zyvorah's presentation lead. The founder has written this proposal herself and finished the artwork. You are turning her document into the client-facing page.",
      "Output ONLY the complete HTML document content (no markdown fences, no commentary). Start with <title>.",
      "Embed the supplied image URLs directly in <img src> — they are pre-signed and valid. Use every image given, in the order given, with its caption.",
      // The pictures and the interaction are not the model's to build. It is
      // given three finished blocks per chapter, one stylesheet and one script,
      // and its job around them is prose and structure.
      "The deck's <head> must contain a <style> holding EXACTLY the css in 'deck_styles', in addition to your own. Immediately before </body> place EXACTLY the markup in 'compare_furniture_html' and then EXACTLY the string in 'deck_script'. Copy all three character for character; do not reformat, minify, re-indent or 'improve' them, and never write your own version of them.",
      HOUSE_STYLE,
      CURATED_RULES,
    ].join("\n\n"),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          client: input.clientName,
          her_document_the_contract_and_the_copy: input.document,
          directions: input.options,
          client_photographs: input.sitePhotos,
          deck_styles: galleryStyles(),
          compare_furniture_html: compareFurnitureHtml(),
          deck_script: galleryScript(),
        }),
      },
    ],
  });
  const msg = await stream.finalMessage();
  const html = msg.content.find((b) => b.type === "text")?.text ?? "";
  const start = html.indexOf("<title>");
  if (start < 0) throw new Error("presenter returned no document");
  return html.slice(start);
}

/* ========================================================================== */
/* Agent 3 — THE REVIEWER: outside editor, then hands it to Roheena.          */
/* ========================================================================== */

const ReviewSchema = z.object({
  verdict: z.enum(["ready", "revised"]).describe("'ready' if the deck needed no changes, 'revised' if the revised_html differs."),
  notes: z.array(z.string()).describe("What was changed or checked, one plain sentence each, for Roheena to read."),
  flags: z.array(z.string()).describe("Anything only a human can settle — a claim to verify, a price implied, a name to double-check. Empty if none."),
});

export type ReviewResult = z.infer<typeof ReviewSchema> & { revised_html: string };

/** In curated mode the editor's remit shrinks to almost nothing, and that is
 *  the point. The prose is the founder's, the colour names are the founder's,
 *  and the facts are about artwork the reviewer has not seen. It may fix a
 *  clumsy connecting sentence the presenter wrote and flag what looks wrong.
 *  It may not edit her. */
const CURATED_REVIEW_RULES = [
  "CURATED MODE: the body text of each direction was written by the founder herself and is reproduced deliberately. Leave her prose alone — do not shorten, simplify or reword it, even where you would normally.",
  "Colour names are the founder's own and are not to be renamed, standardised, or given hex values. A swatch shown as a plain labelled chip with no colour is correct, not a bug.",
  "Palette details are internal: a swatch carries its colour and its name only. If you find a hex value, a percentage or a mixing note printed anywhere in the deck, delete it — that is a leak, not a detail.",
  "You may tidy only the connecting copy the presentation lead wrote around her material — headings, captions, the closing ask — and only where it is genuinely unclear.",
  "DO NOT TOUCH THE INTERACTIVE PARTS. Anything inside a .zy-hero, .zy-gallery, .zy-compare, .zy-bar or .zy-view block, the .zy-star buttons, the data-chapter attributes, the .zy- css rules and the <script> at the end are working machinery that was generated, not written. Leave every one of them byte for byte — a 'tidied' attribute or a reformatted script is a divider that no longer drags on a client's screen.",
  "The full-width picture at the top of each direction (.zy-hero) sits above her prose deliberately. Do not move it, do not shrink it, do not delete it, and do not add a sentence introducing it.",
  "Add nothing. If something reads oddly but is hers, put it in flags for her rather than changing it.",
];

export async function reviewDeck(briefing: string, deckHtml: string, extraRules: string[] = []): Promise<ReviewResult> {
  const anthropic = new Anthropic({ apiKey: anthropicKeyFor("proposals") });

  // Two calls, deliberately: the revision needs free-form HTML output, the
  // verdict needs strict JSON, and one call doing both produces worse of each.
  const revStream = anthropic.messages.stream({
    model: REVIEWER_MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    system: [
      "You are the editor who reads Zyvorah's client proposals before the founder does. Your standard: simple words, extremely thoughtful.",
      "Rewrite where needed, inside the existing HTML: shorten sentences, cut jargon and filler, make every claim concrete, keep the warmth. Do not change the design system, structure, image URLs, or anything factual.",
      "Remove any claim about the client that the briefing does not support.",
      "Output ONLY the complete corrected HTML document, starting with <title>. If nothing needs changing, output the document unchanged.",
      ...extraRules,
    ].join("\n"),
    messages: [
      { role: "user", content: `THE BRIEFING (the only source of client facts):\n${briefing}\n\nTHE DECK:\n${deckHtml}` },
    ],
  });
  const revMsg = await revStream.finalMessage();
  const revText = revMsg.content.find((b) => b.type === "text")?.text ?? "";
  const start = revText.indexOf("<title>");
  const revised = start >= 0 ? revText.slice(start) : deckHtml;

  // The verdict is commentary. The revision above is the work — one 64k call
  // that has already been paid for and is sitting in `revised`.
  //
  // Both of those facts were being thrown away. 4000 tokens shared with
  // adaptive thinking left nothing for the structured output, so this call
  // threw, the whole review action 502'd, and deck-reviewed.html was never
  // written even though the deck had been revised perfectly well. It failed
  // three times running on the LTM deck that way.
  //
  // So: a budget the thinking cannot eat, and a failure here can no longer
  // discard a finished revision.
  const fallbackVerdict = {
    verdict: revised === deckHtml ? ("ready" as const) : ("revised" as const),
    notes: ["The reviewer's report did not come back; the revision itself is intact."],
    flags: [] as string[],
  };

  let verdict: z.infer<typeof ReviewSchema> = fallbackVerdict;
  try {
    const verdictRes = await anthropic.messages.parse({
      model: REVIEWER_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system:
        "You just edited a client proposal. Report to the founder: what you changed (or checked and left alone), and anything only she can settle. Plain sentences, no jargon.",
      messages: [
        {
          role: "user",
          content: `Original length ${deckHtml.length} chars, revised length ${revised.length} chars, identical: ${revised === deckHtml}. Briefing:\n${briefing}\n\nRevised deck text content (tags stripped):\n${revised.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000)}`,
        },
      ],
      output_config: { format: zodOutputFormat(ReviewSchema) },
    });
    verdict = verdictRes.parsed_output ?? fallbackVerdict;
  } catch (e) {
    console.error("[studio] reviewer verdict failed; keeping the revision:", e);
  }

  return { ...verdict, revised_html: revised };
}

export { CURATED_REVIEW_RULES };
