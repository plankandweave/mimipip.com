// The plan document is how a strategy arrives from another agent, so the
// rules that turn it into rows must hold without a database: a slot lands on
// the day and key the engine will look for, a bad document is refused before
// anything is written, and the key scheme keeps Instagram, Stories, LinkedIn
// and ads apart on the same day.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertDistinctStoryDesigns,
  designHandleForSlot,
  normaliseDocumentSlot,
  planKeyFor,
  windowFor,
  slotKeyOf,
  dayRange,
  nextDay,
  type PlanDocument,
} from "./plan";

const doc: PlanDocument = {
  campaign: { name: "Walls Before Diwali", weeks: [] },
  slots: [
    { date: "2026-09-24", format: "feed", beat: "wall", product_handle: "mayur", title: "Mayur (मयूर)", caption: "Mayur in a room." },
    { date: "2026-09-24", format: "story", product_handle: "gaj-gatha", caption: "Which wall?" },
    { date: "2026-09-23", format: "feed", kind: "typographic", word: "TALK", mat: "rose", order: 0, title: "TALK", caption: "TALK." },
    { date: "2026-09-29", format: "feed", channel: "linkedin", product_handle: "the-run-of-nine", caption: "Nine horses." },
    { date: "2026-09-17", format: "ad", channel: "google", title: "PMax" },
  ],
};

test("a feed post, a story, a LinkedIn post and an ad on one day never share a key", () => {
  const rows = doc.slots.map((s, i) => normaliseDocumentSlot(s, i));
  assert.equal(slotKeyOf(rows[0]), "2026-09-24#0");
  assert.equal(slotKeyOf(rows[1]), "2026-09-24#5");
  assert.equal(rows[3].channel, "linkedin");
  assert.equal(slotKeyOf(rows[3]), "2026-09-29#7");
  assert.equal(rows[4].kind, "ad");
  assert.ok(rows[4].seq >= 90);
});

test("a typographic plate has no design and reads its word from the art", () => {
  const plate = normaliseDocumentSlot(doc.slots[2], 2);
  assert.equal(plate.beat, "launch");
  assert.equal(plate.handle, null);
  assert.deepEqual(plate.art, { mat: "rose", word: "TALK" });
});

test("a story infers its beat and lands at seq 5", () => {
  const story = normaliseDocumentSlot(doc.slots[1], 1);
  assert.equal(story.beat, "story");
  assert.equal(story.kind, "story");
  assert.equal(story.seq, 5);
});

test("an organic post without a design or without copy is refused, naming the slot", () => {
  assert.throws(
    () => normaliseDocumentSlot({ date: "2026-10-01", format: "feed", caption: "x" }, 4),
    /slot 4 \(2026-10-01\): an organic post needs product_handle/,
  );
  assert.throws(
    () => normaliseDocumentSlot({ date: "2026-10-01", format: "feed", product_handle: "mayur" }, 5),
    /caption is required/,
  );
  assert.throws(() => normaliseDocumentSlot({ date: "1 Oct", format: "feed", product_handle: "mayur", caption: "x" }, 6), /not YYYY-MM-DD/);
});

test("the plan key and window come from the document, or from its dates", () => {
  assert.equal(planKeyFor(doc), "walls-before-diwali-2026");
  assert.deepEqual(windowFor(doc), { start: "2026-09-17", end: "2026-09-29" });
  assert.equal(planKeyFor({ ...doc, campaign: { ...doc.campaign, key: "x" } }), "x");
  assert.deepEqual(windowFor({ ...doc, campaign: { ...doc.campaign, window: { start: "2026-09-23", end: "2026-10-23" } } }), {
    start: "2026-09-23",
    end: "2026-10-23",
  });
});

test("day arithmetic crosses a month end", () => {
  assert.equal(nextDay("2026-09-30"), "2026-10-01");
  assert.deepEqual(dayRange("2026-10-30", 3), ["2026-10-30", "2026-10-31", "2026-11-01"]);
});

test("an idea needs neither caption nor design — it is intent, not content", () => {
  const idea = normaliseDocumentSlot({ date: "2026-10-03", format: "feed", title: "The hotel you remember.", status: "idea" }, 7);
  assert.equal(idea.status, "idea");
  assert.equal(idea.handle, null);
  assert.equal(idea.caption, null);
});

test("a finished frame stands in for a catalogue design", () => {
  const bespoke = normaliseDocumentSlot(
    { date: "2026-10-03", format: "feed", title: "The hotel you remember.", caption: "One idea, carried through.", art: { image_url: "https://example/hotel.jpg" } },
    8,
  );
  assert.equal(bespoke.handle, null);
  assert.equal(bespoke.art.image_url, "https://example/hotel.jpg");
  // Without frame, idea status, or handle, the post cannot compose — refused at import.
  assert.throws(
    () => normaliseDocumentSlot({ date: "2026-10-03", format: "feed", title: "x", caption: "x" }, 9),
    /needs product_handle, a finished frame/,
  );
});

test("finished Story frames cannot repeat the day's wallpaper", () => {
  const slots = [
    normaliseDocumentSlot({ date: "2026-09-27", seq: 10, format: "feed", caption: "Room.", art: {
      image_url: "https://x/feed.jpg", source_image: "https://zyvorah.com/media/product-images/taash/taash-bahi/scene-02.jpg",
    } }, 0),
    normaliseDocumentSlot({ date: "2026-09-27", seq: 20, format: "story", caption: "Story.", art: {
      image_url: "https://x/story.jpg", story_design_handle: "taash-bahi",
    } }, 1),
  ];
  assert.equal(designHandleForSlot(slots[0]), "taash-bahi");
  assert.throws(() => assertDistinctStoryDesigns(slots), /repeats taash-bahi/);
  slots[1].art.story_design_handle = "taash-jodi";
  assert.doesNotThrow(() => assertDistinctStoryDesigns(slots));
});


test("re-importing the same plan retains a removed row even without a unique-key conflict", async()=>{
 const {importSlotTargets}=await import('./plan');
 const removed={id:'removed',plan_key:'launch',day_key:'2026-10-13',seq:1000,status:'removed'};
 assert.equal(importSlotTargets([removed],'launch').get('2026-10-13#1000')?.status,'removed');
 assert.equal(importSlotTargets([removed],'other').size,0);
 const active={...removed,id:'active',status:'planned'};
 assert.equal(importSlotTargets([active,removed],'launch').get('2026-10-13#1000')?.id,'active');
});
