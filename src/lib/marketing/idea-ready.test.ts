import { test } from "node:test";
import assert from "node:assert/strict";
import { ideaReadyArt, type PlanSlot } from "./plan";
import { composableIdea } from "../../components/admin/marketing/desk-lib";
import type { DeskSlot } from "../../app/api/admin/marketing/plan/route";

// 3 October 2026: every Instagram slot from 2 to 9 October sat as "idea" with
// caption, design and picture present, and the desk offered no way to compose,
// approve or post one.
const slot: PlanSlot = {
  id: "s1", plan_key: "ahimsa-2026", day_key: "2026-10-02", seq: 5, channel: "instagram", kind: "story", beat: "story",
  collection: "ahimsa", handle: "ahimsa-many-held-together", title: "Many, Held Together", devanagari: null, meaning: null,
  price: null, hook: null, caption: "AHIMSA — Strength, Softly Woven. Many, Held Together.", visual_brief: null, cta: null,
  art: {}, status: "idea", comments: [], removed_at: null, removed_by: null, created_at: "", updated_at: "",
};
const desk = (s: PlanSlot): DeskSlot => ({ ...s, slot_key: `${s.day_key}#${s.seq}`, post: null, preview: null, flat: null });

test("a finished Story idea promotes with its exact-design Link sticker", () => {
  const r = ideaReadyArt(slot);
  assert.ok("art" in r);
  assert.equal(r.art.story_link_url, "https://zyvorah.com/products/ahimsa-many-held-together");
  assert.equal(r.art.story_link_required, false);
  assert.equal(composableIdea(desk(slot)), true);
});

test("a feed idea with a design, or a finished frame, is ready", () => {
  assert.ok("art" in ideaReadyArt({ ...slot, kind: "feed", beat: "wall" }));
  assert.ok("art" in ideaReadyArt({ ...slot, kind: "feed", beat: "wall", handle: null, art: { image_url: "https://media.zyvorah.com/f.jpg" } }));
  assert.equal(composableIdea(desk({ ...slot, kind: "feed", beat: "wall" })), true);
});

test("an idea that is still intent stays an idea, and says why", () => {
  const noCopy = ideaReadyArt({ ...slot, caption: null });
  assert.ok("reason" in noCopy && /caption/.test(noCopy.reason));
  assert.ok("art" in ideaReadyArt({ ...slot, handle: "plate-word" }));
  assert.ok("reason" in ideaReadyArt({ ...slot, kind: "feed", beat: "wall", handle: null }));
  for (const s of [
    { ...slot, caption: "" },
    { ...slot, handle: null },
    { ...slot, channel: "linkedin" as const },
    { ...slot, kind: "ad" as const },
    { ...slot, plan_key: "personal-roheena-studio" },
    { ...slot, status: "planned" as const },
  ]) {
    assert.ok("reason" in ideaReadyArt(s));
    assert.equal(composableIdea(desk(s)), false);
  }
});

// 3 October 2026, the same week: the review board's Ahimsa ideas keep their
// design in art.product_url, their picture in art.review_image_url and their
// film in art.review_library_id, with slot.handle empty — so the desk showed
// the picture and still offered no Compose button.
test("a review-board idea reads its product link, picture and Library film", () => {
  const review = { ...slot, handle: null, kind: "feed" as const, beat: "wall" as const, art: {
    product_url: "https://zyvorah.com/products/ahimsa-many-held-together",
    review_image_url: "https://media.zyvorah.com/board-refresh/20261002/a/b.jpg",
  } };
  const r = ideaReadyArt(review);
  assert.ok("art" in r);
  assert.equal(r.handle, "ahimsa-many-held-together");
  assert.equal(r.art.scene_url, review.art.review_image_url);
  assert.equal(r.art.review_image_url, review.art.review_image_url);
  assert.equal(composableIdea(desk(review)), true);

  const story = { ...slot, handle: null, art: { product_url: "https://zyvorah.com/products/ahimsa-many-held-together" } };
  const s = ideaReadyArt(story);
  assert.ok("art" in s && s.art.story_link_url === "https://zyvorah.com/products/ahimsa-many-held-together");
  assert.equal(composableIdea(desk(story)), true);

  const frameOnly = { ...review, art: { review_image_url: "https://media.zyvorah.com/board-refresh/20261002/a/b.jpg" } };
  const f = ideaReadyArt(frameOnly);
  assert.ok("art" in f && f.art.image_url === frameOnly.art.review_image_url && f.handle === null);
});

test("a collection reel with only its Library cut composes as that film", () => {
  const reel = { ...slot, handle: null, kind: "reel" as const, beat: "wall" as const, art: { review_library_id: "ad24f4eb-2bd5-4ec5-9a60-0578b309b785" } };
  const r = ideaReadyArt(reel);
  assert.ok("art" in r);
  assert.equal(r.art.library_id, "ad24f4eb-2bd5-4ec5-9a60-0578b309b785");
  assert.equal(composableIdea(desk(reel)), true);
});

test("a collection page or a relative preview is not a design or a frame", () => {
  const vague = { ...slot, handle: null, kind: "feed" as const, beat: "wall" as const, art: {
    product_url: "https://zyvorah.com/collections/ahimsa",
    review_image_url: "/api/admin/marketing/library/media?id=x&kind=cover",
  } };
  assert.ok("reason" in ideaReadyArt(vague));
  assert.equal(composableIdea(desk(vague)), false);
  // A slot's own fields win over the review fields.
  const own = { ...slot, kind: "feed" as const, beat: "wall" as const, art: { product_url: "https://zyvorah.com/products/other-design", scene_url: "https://x/own.jpg", review_image_url: "https://x/review.jpg" } };
  const o = ideaReadyArt(own);
  assert.ok("art" in o && o.handle === "ahimsa-many-held-together" && o.art.scene_url === "https://x/own.jpg");
});
