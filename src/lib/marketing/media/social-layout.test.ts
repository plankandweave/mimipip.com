import test from "node:test";
import assert from "node:assert/strict";
import { socialLayout } from "./social-layout";

test("feed and portrait retain the same hierarchy with a clear native sticker zone", () => {
  const feed = socialLayout(1080, 1350), portrait = socialLayout(1080, 1920);
  assert.equal(feed.left, portrait.left);
  assert.equal(feed.logoHeight, portrait.logoHeight);
  assert.ok(portrait.logoTop >= 250);
  assert.ok(portrait.titleFoot + 60 < portrait.linkTop);
  assert.ok(portrait.linkTop + 90 < portrait.urlTop);
  assert.ok(portrait.urlTop < 1690);
  assert.ok(portrait.linkMaxWidth <= 335);
});
