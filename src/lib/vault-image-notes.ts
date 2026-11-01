// Shared validation; no provider or secret is imported into the browser.
export const imageNotesEnabled = (slug: string) =>
  slug === "superhealth" || slug === "saraswati-ytit";
export const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 120;
export const TRANSCRIPTION_NOTICE =
  "Audio is saved with this picture. Automatic transcription is not enabled yet.";
export type ImageMark =
  | { kind: "note"; x: number; y: number; text: string }
  | { kind: "arrow"; x: number; y: number; x2: number; y2: number };
export type ImageNotes = { space: string; wall: string; marks: ImageMark[] };
export const isPicture = (ext: string) =>
  ["jpg", "jpeg", "png", "webp", "heic", "heif", "svg"].includes(ext);
export const validUploadKey = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function parseImageNotes(value: unknown): ImageNotes {
  if (!value || typeof value !== "object")
    throw new Error("Label the space and wall for this picture.");
  const v = value as Record<string, unknown>;
  const label = (s: unknown, name: string) => {
    if (typeof s !== "string" || !s.trim() || s.trim().length > 100)
      throw new Error(`Enter a ${name} label (up to 100 characters).`);
    return s.trim();
  };
  const space = label(v.space, "space"),
    wall = label(v.wall, "wall");
  if (!Array.isArray(v.marks) || v.marks.length > 30)
    throw new Error("Use up to 30 notes and arrows.");
  const point = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  const marks = v.marks.map((raw: unknown): ImageMark => {
    if (!raw || typeof raw !== "object")
      throw new Error("Invalid picture annotation.");
    const m = raw as Record<string, unknown>;
    if (!point(m.x) || !point(m.y))
      throw new Error("Keep annotations inside the picture.");
    if (
      m.kind === "note" &&
      typeof m.text === "string" &&
      m.text.trim() &&
      m.text.trim().length <= 180
    )
      return {
        kind: "note",
        x: m.x as number,
        y: m.y as number,
        text: m.text.trim(),
      };
    if (m.kind === "arrow" && point(m.x2) && point(m.y2))
      return {
        kind: "arrow",
        x: m.x as number,
        y: m.y as number,
        x2: m.x2 as number,
        y2: m.y2 as number,
      };
    throw new Error("Use a note of up to 180 characters or an arrow.");
  });
  return { space, wall, marks };
}
export function audioType(
  type: string,
  name: string,
): { ext: string; type: string } | null {
  const types: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  const base = type.split(";")[0].toLowerCase();
  if (types[base])
    return {
      ext: types[base],
      type: base === "audio/x-wav" ? "audio/wav" : base,
    };
  if (base && base !== "application/octet-stream") return null;
  const ext = name.split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    webm: "audio/webm",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
  };
  return ext && byExt[ext] ? { ext, type: byExt[ext] } : null;
}

/** Check common picture signatures at commit too: a forged MIME/name cannot skip labels. */
export function pictureBytes(raw: ArrayBuffer): boolean {
  const b = new Uint8Array(raw),
    text = new TextDecoder().decode(b.slice(0, 512)).trimStart();
  return (
    (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (b[0] === 0x89 && text.slice(1, 4) === "PNG") ||
    (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") ||
    (text.slice(4, 8) === "ftyp" &&
      /heic|heix|hevc|hevx|mif1|msf1/.test(text.slice(8, 32))) ||
    /^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)
  );
}
