import test from "node:test";
import assert from "node:assert/strict";
import {alphaBounds,measureFeed,measureLayout} from "./layout-measure";
import {monogramSvg,lowerThirdSvg} from "./brand";

test("the exported logo is measured by ink, not guessed from its SVG box",async()=>{
 const ink=await alphaBounds(Buffer.from(monogramSvg({height:50})));
 assert.deepEqual(ink,{x:1,y:0,width:38,height:50});
 const frame=await measureFeed("Shared Ground","made to measure","AHIMSA");
 assert.equal(frame.titleFoot,1249);assert.ok(frame.text.width>100);
});
test("empty or shifted rendering fails before it can be marked ready",async()=>{
 await assert.rejects(()=>alphaBounds(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"></svg>')),/empty/);
 const textSvg=lowerThirdSvg(1080,1350,"Shared Ground","made to measure","AHIMSA");
 await assert.rejects(()=>measureLayout({surface:"feed",width:1080,height:1350,logo:Buffer.from(monogramSvg({height:50})),text:Buffer.from(textSvg),logoLeft:800,logoTop:57,textSvg}),/Logo in place/);
 assert.throws(()=>lowerThirdSvg(1080,1350,"This is a very long headline that must not silently lose the last half of its words","made to measure"),/two-line/);
});

test("the daily reel and its cover are drawn in the measured house frame", async () => {
  // 9 Oct 2026: reels had no measured path, so no reel could pass review.
  const { measurePortrait, measureReelCover } = await import("./layout-measure");
  const { frameChecks } = await import("../layout-check");
  const portrait = await measurePortrait("Vatika Pavilion", "made to measure", "Zyvorah · Spiritual");
  const cover = await measureReelCover("Vatika Pavilion", "made to measure", "Zyvorah · Spiritual");
  assert.equal(portrait.surface, "portrait");
  assert.equal(cover.surface, "reel-cover");
  for (const f of [portrait, cover]) assert.deepEqual(frameChecks(f).filter((c) => !c.ok).map((c) => c.label), []);
});

test("a measured reel with no sub line still lands its foot on the house grid", async () => {
  // 9 Oct 2026: all seven daily reels failed "Bottom in place, Margin" — the
  // cadence has no hook or collection, so the sub line was empty.
  const { measurePortrait, measureReelCover } = await import("./layout-measure");
  const { measuredSub } = await import("./reel");
  await assert.rejects(() => measurePortrait("Flo 00110", "", "Zyvorah"), /Bottom in place/);
  assert.equal(measuredSub(""), "Mural wallpaper");
  assert.equal(measuredSub("  "), "Mural wallpaper");
  assert.equal(measuredSub("Spiritual"), "Spiritual");
  await measurePortrait("Flo 00110", measuredSub(""), "Zyvorah");
  await measureReelCover("Flo 00110", measuredSub(undefined), "Zyvorah");
});
