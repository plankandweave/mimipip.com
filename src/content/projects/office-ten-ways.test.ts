import assert from "node:assert/strict";
import test from "node:test";
import {
  OFFICE_TEN_WAYS_PROJECTS,
  OFFICE_TEN_WAYS_SLUGS,
} from "./office-ten-ways";

test("the office launch is ten concepts of four walls", () => {
  assert.equal(OFFICE_TEN_WAYS_PROJECTS.length, 10);
  assert.equal(new Set(OFFICE_TEN_WAYS_SLUGS).size, 10);

  for (const project of OFFICE_TEN_WAYS_PROJECTS) {
    assert.equal(project.kind, "concept");
    assert.deepEqual(project.segments, ["workplaces"]);
    assert.equal(project.chapters.length, 4);
    assert.deepEqual(
      project.chapters.map((chapter) => chapter.space),
      ["Arrival & reception", "Open-plan work area", "Meeting room", "Pantry & pause room"],
    );
  }
});

test("all 120 source images have one unambiguous job", () => {
  const media = OFFICE_TEN_WAYS_PROJECTS.flatMap((project) =>
    project.chapters.flatMap((chapter) => [
      chapter.plain,
      chapter.curated,
      chapter.series?.[0]?.key,
    ]),
  );

  assert.equal(media.length, 120);
  assert.ok(media.every(Boolean));
  assert.equal(new Set(media).size, 120);
  assert.equal(media.filter((key) => key?.endsWith("-plain.jpg")).length, 40);
  assert.equal(media.filter((key) => key?.endsWith("-room.jpg")).length, 40);
  assert.equal(media.filter((key) => key?.endsWith("-artwork.jpg")).length, 40);
});

