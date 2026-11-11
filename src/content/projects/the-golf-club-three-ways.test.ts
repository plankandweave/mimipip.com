import assert from "node:assert/strict";
import test from "node:test";
import { theGolfClubThreeWays } from "./the-golf-club-three-ways";

test("the golf-club study exposes 30 complete sellable triplets", () => {
  const { chapters } = theGolfClubThreeWays;

  assert.equal(chapters.length, 30);
  assert.equal(new Set(chapters.map((chapter) => chapter.space)).size, 30);

  for (const chapter of chapters) {
    assert.match(chapter.plain ?? "", /-before\.jpg$/);
    assert.match(chapter.curated, /-after\.jpg$/);
    assert.equal(chapter.series?.length, 1);
    assert.match(chapter.series?.[0]?.key ?? "", /-artwork\.jpg$/);
  }
});

test("each direction covers the same ten spaces", () => {
  const counts = new Map<string, number>();

  for (const chapter of theGolfClubThreeWays.chapters) {
    const direction = chapter.space.split(" · ")[0];
    counts.set(direction, (counts.get(direction) ?? 0) + 1);
  }

  assert.deepEqual([...counts.values()], [10, 10, 10]);
});
