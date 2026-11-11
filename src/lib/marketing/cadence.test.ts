import test from "node:test";
import assert from "node:assert/strict";
import { cadenceComposes, cadenceSlotRow, designsUsedByFormat, isPlanlessCadenceRow, takenElsewhere, CADENCE_KEY } from "./cadence";
import { designSequenceViolations } from "./design-sequence";

test("a cadence post is composed from a plan item of its own", () => {
  const row = cadenceSlotRow({ slotKey: "2026-10-12#30", kind: "feed", beat: "wall", handle: "aa-0056", title: "Aurora" });
  assert.deepEqual([row.plan_key, row.day_key, row.seq, row.channel, row.status], [CADENCE_KEY, "2026-10-12", 30, "instagram", "planned"]);
  assert.equal(row.art.selected, true);
});

test("the cadence renders its grid post, reel and Stories", () => {
  // Founder, 9 Oct 2026: a Story is posted, with a Link sticker or without.
  assert.equal(cadenceComposes("feed"), true);
  assert.equal(cadenceComposes("reel"), true);
  assert.equal(cadenceComposes("story"), true);
  assert.equal(cadenceComposes("ad"), false);
});

test("the cadence never picks a design the sequence rule would hold", () => {
  const rows = [
    { day_key: "2026-10-01", seq: 0, channel: "instagram", kind: "carousel", status: "planned", handle: "aa-0056", published: true },
    { day_key: "2026-10-12", seq: 40, channel: "instagram", kind: "reel", status: "planned", handle: "flo-0001" },
  ];
  const used = designsUsedByFormat(rows);
  assert.equal(takenElsewhere(used, "feed", "aa-0056", "2026-10-12#30"), true, "a carousel already used it as a grid post");
  assert.equal(takenElsewhere(used, "reel", "aa-0056", "2026-10-12#40"), false, "a reel is its own format");
  assert.equal(takenElsewhere(used, "reel", "flo-0001", "2026-10-12#40"), false, "its own slot is not a repeat");
  assert.equal(takenElsewhere(used, "reel", "flo-0001", "2026-10-13#40"), true);
  // And the rule itself agrees with the picker.
  const pick = { day_key: "2026-10-12", seq: 30, channel: "instagram", kind: "feed", status: "planned", handle: "aa-0056" };
  assert.equal(designSequenceViolations([...rows, pick]).length, 1);
});

test("a cadence row drawn before it had a plan item is redrawn, an approved one never", () => {
  const row = { status: "queued", channel: "instagram", plan_key: CADENCE_KEY, plan_slot_id: null, approved_at: null };
  assert.equal(isPlanlessCadenceRow(row), true);
  assert.equal(isPlanlessCadenceRow({ ...row, approved_at: "2026-10-09T05:00:00Z" }), false);
  assert.equal(isPlanlessCadenceRow({ ...row, plan_slot_id: "s" }), false);
  assert.equal(isPlanlessCadenceRow({ ...row, plan_key: "collected-year-2026" }), false);
});

test("the cadence only picks a design whose name fits the two-line house title", async () => {
  // 9 Oct 2026: a daily Story failed at render on a name too long for the frame.
  const { fitsHouseTitle } = await import("./media/social-layout");
  const { lowerThirdSvg } = await import("./media/brand");
  const long = "The Russet Conservatory of Pianos and Painted Ferns";
  assert.equal(fitsHouseTitle("Vatika Pavilion"), true);
  assert.equal(fitsHouseTitle(long), false);
  assert.throws(() => lowerThirdSvg(1080, 1920, long, "made to measure"), /two-line/, "the renderer agrees");
});

test("a rejected cadence post means 'not this design', never 'no post today'", async () => {
  // 10–15 Oct 2026: every daily row was set skipped by hand and six days went
  // out empty while every cron reported ok.
  const { cadenceRejections } = await import("./cadence");
  const rows = [
    { slot_key: "2026-10-12#30", plan_key: CADENCE_KEY, status: "skipped", product_handle: "taash-nishaan" },
    { slot_key: "2026-10-12#50", plan_key: CADENCE_KEY, status: "skipped", product_handle: "Taash-Chhapa" },
    { slot_key: "2026-10-16#53", plan_key: CADENCE_KEY, status: "failed", product_handle: "office-local-frequency-pause" },
    { slot_key: "2026-10-12#1005", plan_key: "diwali-owner-review-20261002", status: "skipped", product_handle: "mayur" },
    { slot_key: "2026-10-13#40", plan_key: CADENCE_KEY, status: "queued", product_handle: "flo-0001" },
  ];
  const rejected = cadenceRejections(rows);
  assert.deepEqual([...rejected.get("2026-10-12") ?? []].sort(), ["taash-chhapa", "taash-nishaan"]);
  assert.deepEqual([...rejected.get("2026-10-16") ?? []], ["office-local-frequency-pause"], "a failed render is not offered again that day");
  assert.equal(rejected.has("2026-10-13"), false, "a live row is not a refusal");
  assert.equal(rejected.get("2026-10-12")?.has("mayur"), false, "an authored plan's rejection is the plan's own");

  // And the picker honours it: the same seeded pick, minus the refused design.
  const { cadenceTopUp } = await import("./select");
  const cand = (handle: string) => ({ handle, title: handle, descriptionPlain: "", isSignature: false, isFoundersFavourite: false, foundersNote: null,
    fromPrice: null, flatUrl: `https://x/${handle}-flat.jpg`, sceneUrls: [`https://x/${handle}-1.jpg`, `https://x/${handle}-2.jpg`], tags: [], collections: [] });
  const pool = [cand("aa-0001"), cand("aa-0002"), cand("aa-0003"), cand("aa-0004"), cand("aa-0005"), cand("aa-0006"), cand("aa-0007")];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const first = cadenceTopUp("2026-10-12", [], pool as any, new Set(), undefined, null, [], new Map());
  const grid = first.find((s) => s.slotKey === "2026-10-12#30")!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const again = cadenceTopUp("2026-10-12", [], pool as any, new Set(), undefined, null, [], new Map(), new Set([grid.candidate.handle]));
  const regrid = again.find((s) => s.slotKey === "2026-10-12#30")!;
  assert.ok(regrid, "the day still gets its grid post");
  assert.notEqual(regrid.candidate.handle, grid.candidate.handle, "with a different design");
  assert.equal(again.filter((s) => s.campaign?.kind === "story").length, 4, "and its four Stories");
});

test("a day with nothing on it is reported short, a day an authored plan fills is not", async () => {
  const { cadenceShortfall } = await import("./cadence");
  const rows = [
    { slot_key: "2026-10-12#30", status: "skipped", format: "feed", product_handle: "a" },
    { slot_key: "2026-10-13#1000", status: "queued", format: "carousel", product_handle: "b", plan_key: "diwali-owner-review-20261002" },
    { slot_key: "2026-10-13#50", status: "queued", format: "story", product_handle: "c" },
    { slot_key: "2026-10-13#51", status: "published", format: "story", product_handle: "d" },
    { slot_key: "2026-10-13#52", status: "queued", format: "story", product_handle: "e" },
    { slot_key: "2026-10-13#53", status: "queued", format: "story", product_handle: "f" },
    { slot_key: "2026-10-13#7", status: "queued", format: "feed", product_handle: "g", channel: "linkedin" },
  ];
  assert.deepEqual(cadenceShortfall("2026-10-12", rows), ["no grid post", "4 Stories (only 0 of 4)"]);
  assert.deepEqual(cadenceShortfall("2026-10-13", rows), []);
  assert.deepEqual(cadenceShortfall("2026-10-14", rows.slice(0, 3)), ["no grid post", "4 Stories (only 0 of 4)"]);
});

test("a day is counted by what can actually go out; a held post is named with its reason", async () => {
  // 7–8 Oct 2026: every composed post was refused by the review gate, the
  // review page said "nothing to approve", and two days went out empty.
  const { cadenceDaySummary } = await import("./cadence");
  const rows = [
    { slot_key: "2026-10-13#30", status: "published", format: "feed", product_handle: "a" },
    { slot_key: "2026-10-13#40", status: "queued", format: "reel", product_handle: "b", approved_at: "2026-10-12T05:00:00Z" },
    { slot_key: "2026-10-13#50", status: "queued", format: "story", product_handle: "c", review_ready: true, review_hold: null },
    { slot_key: "2026-10-13#51", status: "queued", format: "story", product_handle: "d", review_ready: false, review_hold: "A measured source plan is required." },
    { slot_key: "2026-10-13#52", status: "queued", format: "story", product_handle: "e", approved_at: "2026-10-12T05:00:00Z", error: "held: reel sequence: film twice" },
    { slot_key: "2026-10-13#53", status: "skipped", format: "story", product_handle: "f" },
  ];
  const s = cadenceDaySummary("2026-10-13", rows);
  assert.equal(s.published, 1);
  assert.equal(s.approved, 1);
  assert.equal(s.awaiting, 1);
  assert.deepEqual(s.held.map((h) => [h.slot, h.reason]), [
    ["2026-10-13#51", "A measured source plan is required."],
    ["2026-10-13#52", "reel sequence: film twice"],
  ]);
  assert.deepEqual(s.missing, ["3 Stories (only 1 of 4)"], "held posts count for nothing");
  const whole = cadenceDaySummary("2026-10-13", rows.map((r) => ({ ...r, review_ready: true, review_hold: null, error: null })));
  assert.deepEqual(whole.missing, ["1 Story (only 3 of 4)"], "the skipped row still counts for nothing");
});

test("a cadence run draws every grid post and Story before any reel", async () => {
  // 12 Oct 2026: the composer hung on a reel and the four Stories behind it
  // were never drawn.
  const { cadenceComposeOrder } = await import("./cadence");
  const sel = (slotKey: string, kind: string) => ({ slotKey, campaign: { kind } });
  const order = cadenceComposeOrder([
    sel("2026-10-12#30", "feed"), sel("2026-10-12#40", "reel"), sel("2026-10-12#50", "story"),
    sel("2026-10-13#30", "feed"), sel("2026-10-13#40", "reel"), sel("2026-10-13#50", "story"),
  ]).map((s) => s.slotKey);
  assert.deepEqual(order, ["2026-10-12#30", "2026-10-12#50", "2026-10-13#30", "2026-10-13#50", "2026-10-12#40", "2026-10-13#40"]);
});

test("a missing Story is numbered on the first FREE key, never #50 + i", async () => {
  // 16 Oct 2026: #50–#52 drawn, #53 failed; the one missing Story was given
  // #50, found it taken, and the day stayed a Story short on every run.
  const { freeStorySeqs } = await import("./cadence");
  assert.deepEqual(freeStorySeqs(["2026-10-16#50", "2026-10-16#51", "2026-10-16#52"], 1), [53]);
  assert.deepEqual(freeStorySeqs([], 4), [50, 51, 52, 53]);
  assert.deepEqual(freeStorySeqs(["2026-10-16#51"], 3), [50, 52, 53]);
});

test("a cadence post whose receipt vouches for another picture is drawn again; an approved one never", async () => {
  // 15 Oct 2026: the Bar lounge Story carried a receipt measured for
  // another design and sat held while the brief counted the day short.
  const { cadenceRowNeedsRedraw } = await import("./cadence");
  const mine = "https://media.zyvorah.com/marketing-media/stories/house-v5/bar-lounge/2026-10-15_50_c69bb512f3771d4b.jpg";
  const other = "https://media.zyvorah.com/marketing-media/stories/house-v5/pavilion-garden/2026-10-15_50_92c7725c841d20dc.jpg";
  const frame = { logo: { x: 98, y: 269, width: 38, height: 50 }, text: { x: 97, y: 1238, width: 534, height: 184 }, fonts: true, width: 1080, height: 1920, surface: "portrait", textLeft: 97, solidText: true, titleFoot: 1421 };
  const receiptFor = (url: string) => ({ layout_receipt: { version: "social-layout-v2", assets: [{ url, frames: [frame], sha256: "92c7725c841d20dc59bd901d6023768a951526fa39e2b0afcc35006cc7256dab" }] } });
  const row = { status: "queued", approved_at: null, plan_key: CADENCE_KEY, channel: "instagram", media_urls: [mine], thumbnail_url: null };
  assert.equal(cadenceRowNeedsRedraw(row, receiptFor(other)), true, "the receipt names another picture");
  assert.equal(cadenceRowNeedsRedraw(row, receiptFor(mine)), false, "a receipt that vouches for the picture is done");
  assert.equal(cadenceRowNeedsRedraw({ ...row, approved_at: "2026-10-12T05:00:00Z" }, receiptFor(other)), false, "approved is never touched");
  assert.equal(cadenceRowNeedsRedraw({ ...row, plan_key: "collected-year-2026" }, receiptFor(other)), false, "an authored plan's post is its own");
});
