import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { wallSizeRejection } from "@/lib/corporate-auth";
import { checkIntakeMapping } from "@/lib/site-batch-rules";
import { anthropicKeyFor } from "@/lib/ai-keys";

const MODEL = "claude-opus-5";

export type IntakePhoto = { name: string; jpeg: ArrayBuffer };
export type IntakeWall = {
  seq: number;
  name: string;
  room: string | null;
  widthMm: number;
  heightMm: number;
  /** 1-based index into the uploaded photographs. Several measured bands on
   *  one physical wall share that wall's photograph; a suggested wall may
   *  have none. */
  photoIndex: number | null;
  note: string | null;
  /** Zyvorah's suggestion beyond the client's drawing, with the reason the
   *  approver will read. */
  suggested: boolean;
  suggestionReason: string | null;
  /** The wallpaper carries on round a corner into the NEXT wall of the
   *  sequence (serial-run-rules.ts); false where it ends. */
  turnsIntoNext: boolean;
};

const OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    walls: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          seq: { type: "integer" as const },
          name: { type: "string" as const },
          room: { anyOf: [{ type: "string" as const }, { type: "null" as const }] },
          widthMm: { type: "integer" as const },
          heightMm: { type: "integer" as const },
          photoIndex: { anyOf: [{ type: "integer" as const }, { type: "null" as const }] },
          note: { anyOf: [{ type: "string" as const }, { type: "null" as const }] },
          suggested: { type: "boolean" as const },
          suggestionReason: { anyOf: [{ type: "string" as const }, { type: "null" as const }] },
          turnsIntoNext: { type: "boolean" as const },
        },
        required: ["seq", "name", "room", "widthMm", "heightMm", "photoIndex", "note", "suggested", "suggestionReason", "turnsIntoNext"],
        additionalProperties: false,
      },
    },
    summary: { type: "string" as const },
    warnings: { type: "array" as const, items: { type: "string" as const } },
  },
  required: ["walls", "summary", "warnings"],
  additionalProperties: false,
};

/** Read dimensions ONLY from the supplied measurement document, then match
 *  each measured wall to one uploaded photograph. Photos may name a bay; they
 *  may never supply or alter a dimension.
 *
 *  `suggestions` is the studio's own addition to the client's brief: walls
 *  the drawing shows but does not mark for wallpaper, which Zyvorah proposes
 *  anyway. They are read from the same drawing, flagged, and travel with the
 *  proposal as optional additions (site-batch-rules.ts). */
export async function readSiteBatchIntake(input: {
  storeName: string;
  brief: string;
  measurementPdf: Uint8Array;
  photos: IntakePhoto[];
  suggestions?: string;
  entranceInScope?: boolean;
}): Promise<{ walls: IntakeWall[]; summary: string; warnings: string[] }> {
  if (!anthropicKeyFor("vijaySales")) throw new Error("AI measurement intake is not configured.");
  if (!input.photos.length) throw new Error("Attach one photograph for every measured wall.");

  const content: Anthropic.MessageParam["content"] = [{
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: Buffer.from(input.measurementPdf).toString("base64"),
    },
  } as Anthropic.DocumentBlockParam];

  input.photos.forEach((photo, i) => {
    content.push({ type: "text", text: `SITE PHOTO ${i + 1}: ${photo.name}` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(photo.jpeg).toString("base64") },
    } as Anthropic.ImageBlockParam);
  });

  const suggestions = (input.suggestions ?? "").trim();
  const entranceInScope = input.entranceInScope !== false;

  content.push({
    type: "text",
    text: `This is a new measured-wall intake for ${input.storeName}.

HEAD-OFFICE BRIEF
${input.brief || "No additional brief."}

WHERE THIS SURVEY STARTS
${entranceInScope
  ? "The drawing starts at the store entrance and runs clockwise, so wall 1 is the first wall on the left of the door."
  : "These are INTERIOR walls only — the survey does not start at the store entrance and no wall here is an entrance wall. Keep the drawing's left-to-right order as the sequence."}

ZYVORAH'S OWN SUGGESTIONS (walls the drawing does NOT mark for wallpaper, which we propose anyway)
${suggestions || "None."}

Read every wall marked for wallpaper from the PDF and match it to one site photo. The PDF may be a drawing with widths written left-to-right and one shared height; each area it labels as wallpaper (e.g. "WALLPAPER 1") is one wall. Use the document's visual order as the sequence unless the drawing explicitly says otherwise.

Hard rules:
- Dimensions come ONLY from the PDF. Never estimate a size from a photograph.
- Convert every dimension to whole millimetres. Respect feet-and-inches notation exactly.
- One PHYSICAL wall may carry several wallpaper bands (five header bands over one row of refrigerators). Return each band as its own wall, and give every band on that physical wall the SAME photoIndex. Every uploaded photograph must be used by at least one wall; if a photograph shows no measured wall, say so in warnings but still make the safest mapping the document supports.
- Walls from the client's drawing have suggested=false and suggestionReason=null. A drawn wall must always have a photoIndex.
- For each of ZYVORAH'S OWN SUGGESTIONS above, read its size from the drawing and return it as an extra wall AFTER the drawn walls, with suggested=true and suggestionReason set to the reason given (in plain words for the client's approver). Its photoIndex is the photograph of the physical wall it sits on when one was uploaded, else null. If a suggestion cannot be located or measured on the drawing, leave it out and explain in warnings.
- Name each wall from what the matching photo visibly contains (for example "Elica / Faber upper band"), not from its filename. Keep the drawing's own label in the name when it has one (for example "Wallpaper 6 · washing-machine header").
- The note records why the photo matches that measurement. It must not invent site facts.
- turnsIntoNext is true ONLY when the drawing shows this wall's wallpaper carrying on round a corner straight into the NEXT wall in your sequence (one continuous run: an L or U in plan, a return marked continuous). It is false where the wallpaper ends — a door, a column, an opening, the end of a counter, a break in the band — for the last wall, for every suggested wall, and whenever the drawing does not show the turn. Say in warnings which walls you joined and why.`,
  });

  const anthropic = new Anthropic({ apiKey: anthropicKeyFor("vijaySales") });
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [{ role: "user", content }],
  });
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) throw new Error("The AI could not read that measurement PDF.");
  const parsed = JSON.parse(text) as { walls?: IntakeWall[]; summary?: string; warnings?: string[] };
  const walls = Array.isArray(parsed.walls) ? parsed.walls : [];

  // Drawn walls first, suggestions after — whatever order the model chose —
  // so the client's own walls keep the low numbers on every surface.
  const ordered = [
    ...walls.filter((w) => w.suggested !== true),
    ...walls.filter((w) => w.suggested === true),
  ];
  const mapped = ordered.map((w) => ({
    photoIndex: w.photoIndex == null ? null : Math.round(Number(w.photoIndex)),
    suggested: w.suggested === true,
  }));
  const mismatch = checkIntakeMapping(mapped, input.photos.length);
  if (mismatch) throw new Error(mismatch);

  const clean = ordered.map((wall, index) => {
    const widthMm = Math.round(Number(wall.widthMm));
    const heightMm = Math.round(Number(wall.heightMm));
    const bad = wallSizeRejection(widthMm, heightMm);
    if (bad) throw new Error(`Wall ${index + 1}: ${bad}. Check the measurement PDF.`);
    const suggested = wall.suggested === true;
    return {
      seq: index + 1,
      name: String(wall.name ?? "").trim().slice(0, 160) || `Wall ${index + 1}`,
      room: String(wall.room ?? "").trim().slice(0, 120) || null,
      widthMm,
      heightMm,
      photoIndex: mapped[index]!.photoIndex,
      note: String(wall.note ?? "").trim().slice(0, 500) || null,
      suggested,
      suggestionReason: suggested ? (String(wall.suggestionReason ?? "").trim().slice(0, 400) || null) : null,
      // A turn joins this wall to the next drawn one: never past the last
      // wall, never to or from a suggestion.
      turnsIntoNext: wall.turnsIntoNext === true && !suggested && index < ordered.length - 1 && ordered[index + 1]?.suggested !== true,
    };
  });

  return {
    walls: clean,
    summary: String(parsed.summary ?? "").trim().slice(0, 2000),
    warnings: (parsed.warnings ?? []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 12),
  };
}
