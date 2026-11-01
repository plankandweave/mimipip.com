// Lumen — the presentation film of a campus proposal (founder, 12 October
// 2026). Pure rules: what a film is made of, in what order, and when it is
// ready for the next step. No I/O here; lumen.ts does the writing, the
// recording and the cutting, and marketing/media/lumen.ts renders the frames.
//
// A film is the proposal told in the founder's own voice: an opening that
// says what the campus is about, one scene per wall (the design on the wall's
// photograph, the concept in a sentence or two), and a closing that says what
// happens next. Every scene's narration is written by Lumen and may be edited
// by the founder before it is recorded — the words leave in her voice, so they
// are hers to change.

export const LUMEN_VERSION = "1.0";

export type SceneKey = "opening" | `wall:${number}` | "closing";

export type LumenScene = {
  key: SceneKey;
  /** On-screen title: the wall's concept title, or the direction. */
  heading: string;
  /** On-screen sub-line: the wall's name and location, or the campus. */
  caption: string;
  /** What the founder says over this scene, in English. */
  narration: string;
  /** The wall this scene shows, when it shows one. */
  wallId: string | null;
  /** The wall's seq, for ordering and for the picture lookup. */
  seq: number | null;
};

export type LumenScript = { title: string; scenes: LumenScene[] };

export type LumenStatus = "scripted" | "narrating" | "narrated" | "cutting" | "cut" | "failed";

/** Words per scene the writer is asked for; spoken at a calm pace this is
 *  12–18 seconds a wall, so eight walls make a film of about three minutes. */
export const WORDS = { opening: 55, wall: 40, closing: 40 } as const;
export const MAX_NARRATION_CHARS = 700;

/** A scene with no narration shows for this long; one with narration shows
 *  for the narration plus a breath either side. */
export const SILENT_SECONDS = 6;
export const BREATH_SECONDS = 1.2;
export const MIN_SCENE_SECONDS = 5;

export function sceneSeconds(audioSeconds: number | null): number {
  if (audioSeconds == null || !(audioSeconds > 0)) return SILENT_SECONDS;
  return Math.max(MIN_SCENE_SECONDS, +(audioSeconds + BREATH_SECONDS).toFixed(2));
}

/** The skeleton Lumen fills: opening, every live wall in seq order, closing.
 *  The writer gets this with empty narration and returns the words. */
export function sceneSkeleton(
  direction: string,
  campus: string,
  walls: { id: string; seq: number; name: string; location: string | null; title: string }[],
): LumenScene[] {
  const sorted = [...walls].sort((a, b) => a.seq - b.seq);
  return [
    { key: "opening", heading: direction, caption: campus, narration: "", wallId: null, seq: null },
    ...sorted.map((w) => ({
      key: `wall:${w.seq}` as SceneKey,
      heading: w.title,
      caption: w.location ? `${w.name} · ${w.location}` : w.name,
      narration: "",
      wallId: w.id,
      seq: w.seq,
    })),
    { key: "closing", heading: "What happens next", caption: "Zyvorah", narration: "", wallId: null, seq: null },
  ];
}

/** Put the writer's words onto the skeleton by key; a scene the writer did
 *  not answer keeps empty narration (the desk shows it as such), and a key
 *  the skeleton does not have is dropped. */
export function fillNarration(skeleton: LumenScene[], answers: { key: string; narration: string }[]): LumenScene[] {
  const byKey = new Map(answers.map((a) => [a.key, a.narration.trim()]));
  return skeleton.map((s) => ({ ...s, narration: (byKey.get(s.key) ?? s.narration).slice(0, MAX_NARRATION_CHARS) }));
}

/** Every scene must have words before the voice is recorded. */
export function scriptReady(script: LumenScript): { ok: true } | { ok: false; reason: string } {
  const empty = script.scenes.filter((s) => !s.narration.trim());
  if (empty.length) return { ok: false, reason: `${empty.length} scene${empty.length === 1 ? " has" : "s have"} no words yet: ${empty.map((s) => s.heading).join(", ")}.` };
  const long = script.scenes.filter((s) => s.narration.length > MAX_NARRATION_CHARS);
  if (long.length) return { ok: false, reason: `Too long to speak in one breath: ${long.map((s) => s.heading).join(", ")}.` };
  return { ok: true };
}

/** Which picture a wall scene shows, in order of preference: the exported
 *  mockup (the design on the photograph), then the photograph, then the
 *  design itself. A wall with none cannot be filmed and is named. */
export function pictureFor(p: { renderUrl: string | null; photoUrl: string | null; artUrl: string | null }): { url: string; kind: "render" | "photo" | "art" } | null {
  if (p.renderUrl) return { url: p.renderUrl, kind: "render" };
  if (p.photoUrl) return { url: p.photoUrl, kind: "photo" };
  if (p.artUrl) return { url: p.artUrl, kind: "art" };
  return null;
}

/** Every wall scene needs a picture, and every scene with words needs its
 *  recording, before the film is cut. */
export function cutReady(
  script: LumenScript,
  narration: { key: string; path: string }[],
  pictures: Map<string, { url: string } | null>,
): { ok: true } | { ok: false; reason: string } {
  const recorded = new Set(narration.map((n) => n.key));
  const unrecorded = script.scenes.filter((s) => s.narration.trim() && !recorded.has(s.key));
  if (unrecorded.length) return { ok: false, reason: `Not yet recorded: ${unrecorded.map((s) => s.heading).join(", ")}.` };
  const unpictured = script.scenes.filter((s) => s.wallId && !pictures.get(s.wallId));
  if (unpictured.length) return { ok: false, reason: `No picture for: ${unpictured.map((s) => s.caption).join(", ")}. Open each wall on the desk so its mockup is drawn, or add a photograph.` };
  return { ok: true };
}

/** The film's running time from its scenes' audio, for the desk. */
export function runningTime(seconds: number[]): string {
  const total = Math.round(seconds.reduce((a, b) => a + b, 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m} min ${String(s).padStart(2, "0")} s` : `${s} s`;
}

export function filmHeadline(script: LumenScript, revision: number): string {
  return `Lumen ${LUMEN_VERSION} · ${script.title} · revision ${revision}`;
}
