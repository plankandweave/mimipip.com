import test from "node:test";
import assert from "node:assert/strict";
import {LAYOUT_VERSION,frameChecks,layoutHold,type LayoutFrame} from "./layout-check";
import {approvalMedia} from "./digest-web";
import {slotDigest} from "./digest";
import {verifyLayoutFiles} from "./layout-verify";
const frame:LayoutFrame={surface:"feed",width:1080,height:1350,logo:{x:98,y:57,width:40,height:50},text:{x:97,y:1050,width:640,height:203},textLeft:97,titleFoot:1249,fonts:true,solidText:true};
const asset={url:"https://media.zyvorah.com/a.jpg",sha256:"a".repeat(64),frames:[frame]};
const art={brand_layout:LAYOUT_VERSION,layout_receipt:{version:LAYOUT_VERSION,assets:[asset]}};
test("six measured checks reject each observed failure independently",()=>{
 assert.equal(frameChecks(frame).filter(c=>c.ok).length,6);
 for(const bad of [ {...frame,logo:{...frame.logo,x:900}}, {...frame,titleFoot:1000}, {...frame,width:1000}, {...frame,textLeft:50}, {...frame,text:{...frame.text,width:1000}}, {...frame,text:{...frame.text,y:20}} ]) assert.ok(frameChecks(bad).some(c=>!c.ok));
});
test("a centred profile cover has exactly the feed coordinates after crop",()=>{
 const cover={...frame,surface:"reel-cover" as const,height:1920,logo:{...frame.logo,y:342},text:{...frame.text,y:1335},titleFoot:1534};
 assert.ok(frameChecks(cover).every(c=>c.ok));
 assert.equal(cover.titleFoot-285,frame.titleFoot);
 assert.equal(cover.logo.y-285,frame.logo.y);
 assert.ok(frameChecks({...cover,titleFoot:1421}).some(c=>!c.ok),"old video title cannot pass as grid cover");
});
test("missing, old, malformed and stale reports fail closed; every slide counts",()=>{
 assert.match(layoutHold({brand_layout:LAYOUT_VERSION})!,/failed/);
 assert.match(layoutHold({...art,layout_receipt:{version:"old",assets:[asset]}})!,/failed/);
 assert.match(layoutHold({...art,layout_receipt:{version:LAYOUT_VERSION,assets:[{...asset,frames:[]}]}})!,/failed/);
 assert.equal(layoutHold(art,[asset.url]),null);
 assert.match(layoutHold(art,[asset.url,"https://media.zyvorah.com/unmeasured.jpg"])!,/every exact/);
 assert.match(layoutHold({...art,video_url:asset.url.replace('.jpg','.mp4')})!,/every exact/);
});
test("the approval digest includes the selected Reel cover, preserving existing still digests",()=>{
 const row={format:"reel",media_urls:["movie"],thumbnail_url:"cover-a"};
 assert.notEqual(slotDigest("caption",approvalMedia(row)),slotDigest("caption",approvalMedia({...row,thumbnail_url:"cover-b"})));
 assert.equal(slotDigest("caption",approvalMedia({...row,format:"carousel"})),slotDigest("caption",row.media_urls));
});
test("file mutation and network failure cannot clear release",async()=>{
 const old=globalThis.fetch;
 try{
 globalThis.fetch=async()=>new Response("different bytes");
 assert.match((await verifyLayoutFiles(art,[asset.url]))!,/bytes changed/);
 globalThis.fetch=async()=>{throw Error("offline");};
 assert.match((await verifyLayoutFiles(art,[asset.url]))!,/could not be verified/);
 }finally{globalThis.fetch=old;}
});

test("untagged Instagram plan rows cannot opt out of the gate",()=>{assert.match(layoutHold(undefined,[asset.url],null,true)!,/failed/);});
