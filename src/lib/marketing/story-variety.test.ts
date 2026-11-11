// "I don't want to make it boring, so the content should not be repetitive in
// the story, but yet stay within the collection rules" (founder, 26 Sep 2026).
//
// A day's four Stories used to ride only the one or two designs that day
// already had, so the same wallpaper appeared two or three times over — in
// different rooms, but the same design. Each Story now reaches for a design
// the day has not shown, still inside the chapter.
//
//   npx tsx --test src/lib/marketing/story-variety.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { cadenceTopUp, chapterScope, type Candidate, type Selection } from "./select";

const design = (handle: string, tags: string[]): Candidate => ({
  handle,
  title: handle,
  descriptionPlain: "",
  isSignature: false,
  isFoundersFavourite: false,
  foundersNote: null,
  tags,
  rooms: [],
  fromPrice: 200,
  flatUrl: `https://x/${handle}/flat.png`,
  sceneUrls: [`https://x/${handle}/scene-living.png`, `https://x/${handle}/scene-bedroom.png`],
});

const TAASH = ["taash-jodi", "taash-booti", "taash-kona", "taash-bahi", "taash-dhoop", "taash-parakh"]
  .map((h) => design(h, ["TAASH"]));

const planned: Selection[] = [
  { slotKey: "2026-10-02#0", pillar: "reveal", candidate: TAASH[0],
    campaign: { key: "p", beat: "wall", collection: "TAASH", caption: "", format: "carousel", artDirection: "", kind: "carousel" } },
];

test("a day's Stories do not repeat one design when the chapter has others", () => {
  const scope = chapterScope("TAASH", TAASH);
  const added = cadenceTopUp("2026-10-02", planned, TAASH, new Set(), undefined, scope);
  const stories = added.filter((s) => s.campaign?.kind === "story");
  assert.ok(stories.length >= 3, `expected the day topped up to four Stories, got ${stories.length}`);
  const handles = stories.map((s) => s.candidate.handle);
  assert.equal(new Set(handles).size, handles.length, `Stories repeated a design: ${handles.join(", ")}`);
});

test("every Story still comes from the chapter's own collection", () => {
  const scope = chapterScope("TAASH", TAASH);
  const added = cadenceTopUp("2026-10-02", planned, TAASH, new Set(), undefined, scope);
  for (const s of added) {
    assert.ok(s.candidate.tags.includes("TAASH"), `${s.candidate.handle} is outside the chapter`);
  }
});

test("a chapter with only one design does not repeat it to fill the day", () => {
  const one = [design("taash-solo", ["TAASH"])];
  const scope = chapterScope("TAASH", one);
  const added = cadenceTopUp("2026-10-02", [], one, new Set(), undefined, scope);
  const handles = added.map((s) => s.candidate.handle);
  assert.equal(new Set(handles).size, handles.length, "a short chapter must not repeat its only design");
});

test("two authored Stories get only two top-ups with distinct designs", () => {
  const scope = chapterScope("TAASH", TAASH);
  const authored: Selection[] = [
    ...planned,
    ...[1, 2].map((n) => ({
      slotKey: `2026-10-02#2${n}`,
      pillar: "room_story" as const,
      candidate: design(`plate-${n}`, []),
      campaign: { key: "p", beat: "story" as const, collection: "TAASH", caption: "", format: "story" as const,
        artDirection: "", kind: "story" as const, art: { story_design_handle: TAASH[n].handle } },
    })),
  ];
  const added = cadenceTopUp("2026-10-02", authored, TAASH, new Set(), undefined, scope);
  const stories = added.filter((s) => s.campaign?.kind === "story");
  assert.deepEqual(stories.map((s) => s.slotKey), ["2026-10-02#50", "2026-10-02#51"]);
  const handles = stories.map((s) => s.candidate.handle);
  assert.equal(new Set(handles).size, 2);
  assert.ok(handles.every((h) => ![TAASH[0].handle, TAASH[1].handle, TAASH[2].handle].includes(h)));
});

test("published Stories from an archived plan still occupy two places in the day's cadence", () => {
  const scope = chapterScope("TAASH", TAASH);
  const reserved = [TAASH[1], TAASH[2]].map((candidate, index) => ({
    slotKey: `2026-10-02#2${index}`,
    handle: candidate.handle,
    sourceUrl: candidate.sceneUrls[0],
  }));
  const added = cadenceTopUp("2026-10-02", planned, TAASH, new Set(), undefined, scope, reserved);
  const stories = added.filter((s) => s.campaign?.kind === "story");
  assert.deepEqual(stories.map((s) => s.slotKey), ["2026-10-02#50", "2026-10-02#51"]);
  assert.ok(stories.every((s) => !reserved.some((r) => r.handle === s.candidate.handle)));
});
