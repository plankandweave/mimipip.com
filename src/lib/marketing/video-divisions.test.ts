import test from "node:test";
import assert from "node:assert/strict";
import { routeFilm, divisionsFor } from "./video-divisions";

test("meeting presentations retain their purpose across desktop and mobile formats", () => {
  for (const film of [
    { width: 1920, height: 1200, durationS: 407 },
    { width: 1080, height: 1920, durationS: 407 },
  ]) {
    assert.equal(routeFilm("meeting", film), "meeting");
    assert.ok(divisionsFor(film).some(d => d.key === "meeting"));
    assert.equal(routeFilm("reel", film), "youtube");
  }
});

test("square artwork films can be filed for YouTube Shorts", () => {
  const film = { width: 1080, height: 1080, durationS: 50 };
  assert.equal(routeFilm("youtube", film), "youtube");
  assert.ok(divisionsFor(film).some(d => d.key === "youtube"));
});
