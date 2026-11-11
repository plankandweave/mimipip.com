import assert from "node:assert/strict";
import test from "node:test";
import { getProjectCategory, projectsForCategory } from "../project-categories";
import { aLittlePlaceToBegin } from "./a-little-place-to-begin";
import { littleStepsWiderWorlds } from "./little-steps-wider-worlds";

test("every education space retains a distinct without/with-wallpaper pair", () => {
  const category = getProjectCategory("education")!;
  for (const project of projectsForCategory(category)) {
    const media: string[] = [];
    for (const chapter of project.chapters) {
      assert.ok(chapter.plain, `${project.slug}: ${chapter.space} needs a before frame`);
      assert.notEqual(chapter.plain, chapter.curated);
      media.push(chapter.plain, chapter.curated);
    }
    assert.equal(new Set(media).size, media.length, `${project.slug} must not reuse a comparison frame`);
  }
});

test("the standalone preschool ends at Senior KG and presents main rooms before support", () => {
  assert.equal(littleStepsWiderWorlds.kind, "concept");
  assert.equal(littleStepsWiderWorlds.chapters.length, 8);
  assert.deepEqual(littleStepsWiderWorlds.chapters.slice(0, 4).map((chapter) => chapter.space), [
    "Compact reception and handover",
    "Nursery room",
    "Junior KG room",
    "Senior KG room",
  ]);
  assert.deepEqual(littleStepsWiderWorlds.buildings?.entries.map((stage) => stage.name), [
    "Nursery", "Junior KG", "Senior KG",
  ]);
  assert.ok(littleStepsWiderWorlds.facts.some((fact) => fact.value === "Standalone preschool, not a K–12 campus"));
});

test("the education proof count equals the published matched viewpoints", () => {
  const category = getProjectCategory("education")!;
  const count = projectsForCategory(category).reduce((total, project) => total + project.chapters.length, 0);
  assert.equal(category.proof?.find((item) => item.label === "Matched spaces shown")?.value, String(count));
});

test("the neighbourhood play school remains one concept with eight rooms and corners", () => {
  assert.equal(aLittlePlaceToBegin.kind, "concept");
  assert.equal(aLittlePlaceToBegin.chapters.length, 8);
  assert.deepEqual(aLittlePlaceToBegin.chapters.slice(-3).map((chapter) => chapter.space), [
    "Bag and shoe transition",
    "Snack and care nook",
    "Parent and staff conversation room",
  ]);
  assert.ok(aLittlePlaceToBegin.facts.some((fact) => fact.value === "One small property"));
});
