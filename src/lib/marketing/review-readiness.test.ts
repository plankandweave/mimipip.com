import test from "node:test";
import assert from "node:assert/strict";
import { reviewHold, reviewDay, type ReviewPost, type ReviewPlan } from "./review-readiness";
import { LAYOUT_VERSION } from "./layout-check";
import { summariseSocial } from "../social-summary";
import { awaitingReview } from "../../components/admin/marketing/desk-lib";
import type { DeskSlot } from "../../app/api/admin/marketing/plan/route";
const url = "https://media.zyvorah.com/marketing-media/measured.jpg";
const post: ReviewPost = {id:"p",channel:"instagram",format:"feed",status:"queued",safety_passed:true,caption:"Together, Still",media_urls:[url],plan_slot_id:"s",plan_key:"campaign",slot_key:"2026-10-09#0"};
const plan: ReviewPlan = {status:"planned",title:"Together, Still",kind:"feed",art:{brand_layout:LAYOUT_VERSION,layout_receipt:{version:LAYOUT_VERSION,assets:[{url,sha256:"a".repeat(64),frames:[{surface:"feed",width:1080,height:1350,logo:{x:98,y:57,width:38,height:50},text:{x:97,y:1050,width:640,height:203},textLeft:97,titleFoot:1249,fonts:true,solidText:true}]}]}}};
const options = {today:"2026-10-08",planStatus:"live"};
test("a finished scheduled post can enter exact-file verification", () => assert.equal(reviewHold(post,plan,options),null));
test("copy safety alone never qualifies the screenshot's unmeasured artwork", () => {
  const hold = reviewHold(post,{...plan,art:{}},options);
  assert.match(hold!,/Layout check failed/);
  const qualified = {...post,review_ready:false,review_hold:hold};
  const summary = summariseSocial([qualified],"2026-10-07");
  assert.equal(summary.awaitingReview,0);
  assert.equal(summary.blocked,1);
  assert.equal(awaitingReview({post:qualified,status:"planned"} as unknown as DeskSlot),false);
});
test("missing source plans, archived campaigns, stale dates and held production never become approval tasks",()=>{
  for (const [p,s,o] of [
    [{...post,plan_slot_id:null},plan,options],
    [post,null,options],
    [post,plan,{...options,planStatus:"archived"}],
    [{...post,slot_key:"2026-10-07#0"},plan,options],
    [post,{...plan,status:"removed"},options],
    [post,{...plan,art:{...plan.art,production_hold:true}},options],
    [post,plan,{...options,sequenceError:"Repeated design"}],
    [{...post,caption:""},plan,options],
    [{...post,media_urls:[]},plan,options],
    [{...post,regenerate_requested_at:"now"},plan,options],
    [{...post,plan_key:"personal-roheena-studio"},plan,options],
  ] as [ReviewPost, ReviewPlan | null, typeof options & {sequenceError?:string}][]) assert.ok(reviewHold(p,s,o));
});
test("missing qualification fails closed in both founder surfaces",()=>{
  assert.equal(summariseSocial([post],"2026-10-07").awaitingReview,0);
  assert.equal(awaitingReview({post,status:"planned"} as unknown as DeskSlot),false);
});
test("the newsletter and desk count the same qualified post",()=>{
  const qualified={...post,review_ready:true,review_hold:null};
  assert.equal(summariseSocial([qualified],"2026-10-07").awaitingReview,1);
  assert.equal(awaitingReview({post:qualified,status:"planned"} as unknown as DeskSlot),true);
});
test("review dates change at midnight in India, independent of server time",()=>{
  assert.equal(reviewDay(new Date("2026-10-07T18:29:59Z")),"2026-10-07");
  assert.equal(reviewDay(new Date("2026-10-07T18:30:00Z")),"2026-10-08");
});

test("the composer and the review gate share one plan-item rule", async () => {
  const { needsPlanItem } = await import("./review-readiness");
  assert.equal(needsPlanItem("instagram", null), true);
  assert.equal(needsPlanItem(undefined, null), true, "a row with no channel is written as Instagram");
  assert.equal(needsPlanItem("instagram", "slot-1"), false);
  assert.equal(needsPlanItem("linkedin", null), false);
});

test("a finished Story is offered for approval — its Link sticker is optional (founder, 9 Oct 2026)", () => {
  const storyUrl = "https://media.zyvorah.com/marketing-media/stories/house-v5/s.jpg";
  const frame = {surface:"portrait" as const,width:1080,height:1920,logo:{x:98,y:269,width:38,height:50},text:{x:96,y:1238,width:495,height:184},textLeft:97,titleFoot:1421,fonts:true,solidText:true};
  const story: ReviewPost = {...post,format:"story",media_urls:[storyUrl]};
  const storyPlan: ReviewPlan = {status:"planned",title:"Together, Still",kind:"story",art:{brand_layout:LAYOUT_VERSION,layout_receipt:{version:LAYOUT_VERSION,assets:[{url:storyUrl,sha256:"b".repeat(64),frames:[frame]}]}}};
  assert.equal(reviewHold(story,storyPlan,options),null);
});
