// The Library-reel rule (Roheena, 29 Sep 2026): a film goes out once, and two
// voiced reels of one language never run back to back. The fixture is the
// production reel calendar as it stood on 29 Sep 2026 (29 Sep → 12 Nov),
// after the lead hand-ordered it — it must pass. The broken variants prove the
// check catches what it is for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertReelSequence, reelSequenceViolations, type ReelSeqSlot } from "./reel-sequence";
import type { FilmLanguage } from "./film-language";

const reel = (day_key: string, seq: number, library_id: string | null, language: FilmLanguage | null, extra: Partial<ReelSeqSlot> = {}): ReelSeqSlot => ({
  day_key, seq, channel: "instagram", kind: "reel", status: "planned", library_id, language, ...extra,
});

// Production, 29 Sep 2026 (marketing_plan_slots kind='reel', ids shortened).
const PROD: ReelSeqSlot[] = [
  reel("2026-09-27", 0, null, null, { status: "removed" }),
  reel("2026-09-28", 10, null, null, { published: true }),
  reel("2026-09-29", 60, "74e56633", "hindi"),
  reel("2026-10-01", 60, "4b92c1f6", "english"),
  reel("2026-10-03", 0, null, null, { status: "removed" }),
  reel("2026-10-03", 60, "ad24f4eb", "hindi"),
  reel("2026-10-04", 0, null, null),
  reel("2026-10-07", 60, "65fe49f8", "english"),
  reel("2026-10-08", 60, "1319a0c9", "hindi"),
  reel("2026-10-11", 60, "9eb2fe07", "english"),
  reel("2026-10-13", 0, null, null),
  reel("2026-10-14", 60, "dd41360d", "hindi"),
  reel("2026-10-16", 0, null, null),
  reel("2026-10-17", 60, "4c4aae4a", "english"),
  reel("2026-10-19", 0, null, null),
  reel("2026-10-20", 60, "1a3e77a4", "marathi"),
  reel("2026-10-22", 0, null, null),
  reel("2026-10-23", 60, "27facab9", "hindi"),
  reel("2026-10-25", 0, null, null),
  reel("2026-10-26", 60, "dd6aaee2", "english"),
  reel("2026-10-28", 60, "ab530da7", "hindi"),
  reel("2026-10-29", 0, null, null),
  reel("2026-10-31", 60, "8304907c", "english"),
  reel("2026-11-02", 0, null, null),
  reel("2026-11-03", 60, "e68ef74b", "none"),
  reel("2026-11-05", 0, null, null),
  reel("2026-11-06", 60, "16f2a060", "hindi"),
  reel("2026-11-09", 0, null, null),
  reel("2026-11-10", 60, "1e92854c", "english"),
  reel("2026-11-12", 60, "8718fc54", "hindi"),
];

const withFilm = (slots: ReelSeqSlot[], at: string, library_id: string, language: FilmLanguage) =>
  slots.map((s) => (`${s.day_key}#${s.seq}` === at ? { ...s, library_id, language } : s));

test("the production calendar of 29 Sep 2026 passes", () => {
  assert.deepEqual(reelSequenceViolations(PROD), []);
  assert.doesNotThrow(() => assertReelSequence(PROD, new Set(PROD.map((s) => `${s.day_key}#${s.seq}`))));
});

test("two Hindi reels in a row are caught and refused, naming both slots", () => {
  // 1 Oct becomes Hindi: 29 Sep (hi) → 1 Oct (hi).
  const broken = withFilm(PROD, "2026-10-01#60", "4b92c1f6", "hindi");
  const v = reelSequenceViolations(broken);
  assert.equal(v.length, 2); // 29 Sep→1 Oct and 1 Oct→3 Oct
  assert.equal(v[0].rule, "same-language");
  assert.equal(v[0].slot, "2026-10-01#60");
  assert.equal(v[0].with, "2026-09-29#60");
  assert.throws(() => assertReelSequence(broken, new Set(["2026-10-01#60"])), /hindi reel straight after the hindi reel on 2026-09-29#60/);
});

test("a swap is suggested when one exists", () => {
  // Swap the films of 1 Oct (en) and 3 Oct (hi): 29 Sep hi → 1 Oct hi → 3 Oct en → 7 Oct en.
  const broken = PROD.map((s) => {
    const k = `${s.day_key}#${s.seq}`;
    if (k === "2026-10-01#60") return { ...s, library_id: "ad24f4eb", language: "hindi" as const };
    if (k === "2026-10-03#60") return { ...s, library_id: "4b92c1f6", language: "english" as const };
    return s;
  });
  const v = reelSequenceViolations(broken);
  assert.deepEqual(v.map((x) => x.slot), ["2026-10-01#60", "2026-10-07#60"]);
  assert.equal(v[0].swap_with, "2026-10-03#60");
});

test("the same film twice is caught, even when the first went out and was later removed", () => {
  const twice = withFilm(PROD, "2026-11-12#60", "74e56633", "hindi");
  const v = reelSequenceViolations(twice);
  assert.deepEqual(v.map((x) => [x.rule, x.slot, x.with]), [["repeat-film", "2026-11-12#60", "2026-09-29#60"]]);
  assert.equal(v[0].swap_with, null);

  const publishedThenRemoved = [reel("2026-09-01", 60, "f1", "english", { status: "removed", published: true }), reel("2026-12-01", 60, "f1", "english")];
  assert.equal(reelSequenceViolations(publishedThenRemoved)[0].rule, "repeat-film");
  // A removed slot that never went out does not hold its film.
  assert.deepEqual(reelSequenceViolations([reel("2026-09-01", 60, "f1", "english", { status: "removed" }), reel("2026-12-01", 60, "f1", "english")]), []);
});

test("'none' and non-Library reels do not break a same-language pair; Marathi is its own language", () => {
  const seq = [reel("2026-12-01", 60, "a", "hindi"), reel("2026-12-02", 0, null, null), reel("2026-12-03", 60, "n", "none"), reel("2026-12-04", 60, "b", "hindi")];
  assert.deepEqual(reelSequenceViolations(seq).map((v) => v.slot), ["2026-12-04#60"]);
  assert.deepEqual(reelSequenceViolations([reel("2026-12-01", 60, "a", "hindi"), reel("2026-12-02", 60, "m", "marathi"), reel("2026-12-03", 60, "b", "hindi")]), []);
  assert.deepEqual(reelSequenceViolations([reel("2026-12-01", 60, "a", "marathi"), reel("2026-12-02", 60, "b", "marathi")]).map((v) => v.rule), ["same-language"]);
});

test("a refusal only fires for the slots an action touches", () => {
  const broken = withFilm(PROD, "2026-10-01#60", "4b92c1f6", "hindi");
  assert.doesNotThrow(() => assertReelSequence(broken, new Set(["2026-11-12#60"])));
});
