import { test } from "node:test";
import assert from "node:assert/strict";
import { productionHold } from "./production-readiness";

test("the Ahimsa placeholder cannot become a narrated Reel from a poster", () => {
  assert.match(productionHold({kind:"reel", title:"AHIMSA · October 2 Reel — publication verification required", art:{image_url:"https://media.zyvorah.com/room.png", local_source:"/tmp/master.mp4", source_audio_present:false}})!, /tracking title/);
  assert.match(productionHold({kind:"reel",title:"AHIMSA",art:{local_source:"/tmp/master.mp4",image_url:"https://media.zyvorah.com/room.png"}})!, /local file/);
});
test("saved blockers and removal still hold already composed or signed content", () => {
  assert.match(productionHold({art:{blockers:["Four room renders missing"]}})!, /Four room renders/);
  assert.match(productionHold({status:"removed",art:{video_url:"https://x/final.mp4"}})!, /removed/);
  assert.equal(productionHold({art:{production_hold:true,hold_reason:"Needs source review"}}), "Needs source review");
  assert.equal(productionHold({kind:"story",art:{production_hold:true,hold_reason:"Final portrait source-faithful Story export required."}}), null);
  assert.equal(productionHold({kind:"story",art:{blockers:["Final source-faithful 1080×1920 export missing."]}}), null);
});
test("silent masters fail while finished media and ordinary catalogue briefs remain usable", () => {
  assert.match(productionHold({kind:"reel",art:{video_url:"https://x/final.mp4",source_audio_present:false}})!, /audio/);
  assert.equal(productionHold({kind:"reel",title:"Strength, Softly Woven",art:{video_url:"https://x/final.mp4",source_audio_present:true,blockers:[]}}),null);
  assert.equal(productionHold({kind:"carousel",title:"Shared Ground",art:{}}),null);
});
