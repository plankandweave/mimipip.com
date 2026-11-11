import test from "node:test";
import assert from "node:assert/strict";
import { stateLabel } from "./desk-lib";
import type { DeskSlot } from "@/app/api/admin/marketing/plan/route";

// 4 October 2026, 11:53 IST: "Held in Balance" was approved and locked for
// 17:30, and the desk called it "approved · waiting to publish" — which read
// as a stuck post. A tile with a locked time names the time.
const MEDIA = "https://media.zyvorah.com/marketing-media/carousels/branded/ahimsa-held-in-balance/2026-10-04_3001_0_f3b012cc7bbe88f6.jpg";
const RECEIPT = {
  version: "social-layout-v2",
  assets: [{
    url: MEDIA,
    sha256: "f3b012cc7bbe88f64a5f25725d22e0d64f49de0529e9fe0a296501bc6e075c03",
    frames: [{ logo: { x: 98, y: 57, width: 38, height: 50 }, text: { x: 97, y: 1066, width: 519, height: 184 }, fonts: true, width: 1080, height: 1350, surface: "feed", textLeft: 97, solidText: true, titleFoot: 1249 }],
  }],
};

const slot = (publishAt: string | null, day = "2026-10-04") =>
  ({
    day_key: day,
    channel: "instagram",
    kind: "carousel",
    status: "planned",
    // The measured layout receipt the real slot carries, cut to one frame,
    // so the tile clears the layout gate exactly as Held in Balance did.
    art: { ...(publishAt ? { publish_at: publishAt } : {}), brand_layout: "social-layout-v2", layout_receipt: RECEIPT },
    post: { status: "queued", approved_at: "2026-10-03T16:26:31Z", safety_passed: true, media_urls: [MEDIA], thumbnail_url: MEDIA },
  }) as unknown as DeskSlot;

const NOW = new Date("2026-10-04T06:23:00Z"); // 11:53 IST

test("an approved post locked for later today says when it posts", () => {
  const l = stateLabel(slot("2026-10-04T17:30:00+05:30"), "2026-10-04", NOW);
  assert.equal(l.state, "approved");
  assert.equal(l.label, "approved · posts 17:30 today");
});

test("an approved post past its locked time says it is overdue", () => {
  const l = stateLabel(slot("2026-10-04T11:30:00+05:30"), "2026-10-04", NOW);
  assert.equal(l.state, "approved");
  assert.equal(l.label, "approved · due 11:30, not posted yet");
});

test("a future day carries its time", () => {
  const l = stateLabel(slot("2026-10-05T11:30:00+05:30", "2026-10-05"), "2026-10-04", NOW);
  assert.equal(l.state, "approved");
  assert.equal(l.label, "approved · posts 5 Oct 11:30");
});

test("approved Stories use release status even with legacy sticker metadata", () => {
  const story = slot("2026-10-04T17:30:00+05:30");
  story.kind = "story";
  story.post!.format = "story";
  story.art = { ...story.art, story_link_required: true };
  assert.equal(stateLabel(story, "2026-10-04", NOW).label, "approved · posts 17:30 today");
  story.post!.status = "approved";
  assert.equal(stateLabel(story, "2026-10-04", NOW).label, "publishing · awaiting confirmation");
  story.post!.status = "published";
  assert.equal(stateLabel(story, "2026-10-04", NOW).label, "posted");
});

test("Story labels preserve real production holds instead of blaming stickers", () => {
  const story = slot(null);
  story.kind = "story";
  story.art = { ...story.art, blockers: ["Final export missing"] };
  assert.equal(stateLabel(story, "2026-10-04", NOW).label, "needs finished creative");
  story.art = {};
  assert.equal(stateLabel(story, "2026-10-04", NOW).label, "needs layout correction");
  story.status = "removed";
  assert.equal(stateLabel(story, "2026-10-04", NOW).label, "removed");
});
