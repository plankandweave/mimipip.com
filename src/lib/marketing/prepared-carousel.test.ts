import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedCarouselIdea,preparedCarouselReviewLocked,preparedCarouselCompletedState,withPreparedCarouselLease} from './prepared-carousel';
const frames=['shared-ground','open-ground','common-measure','many-held-together','held-in-balance'].map(n=>({handle:`ahimsa-${n}`,image_url:`https://media.zyvorah.com/ahimsa/ahimsa-${n}/flat.png`,width:1536,height:1024}));
const slot={status:'idea',channel:'instagram',kind:'carousel',caption:'Owner supplied copy',handle:frames[0].handle,art:{native_ahimsa_carousel_sources:frames}};
test('only complete explicit supplied-frame ideas can target composition',()=>{
 assert.equal(preparedCarouselIdea(slot),true);
 for(const change of [{caption:''},{kind:'story'},{channel:'linkedin'},{status:'removed'},{handle:frames[1].handle},{art:{carousel_frames:frames}},{art:{native_ahimsa_carousel_sources:[frames[0],...frames.slice(0,4)]}}])assert.equal(preparedCarouselIdea({...slot,...change}),false);
});
test('concurrent clicks share one database claim, rerun can proceed after release',async()=>{
 let claimed=false,calls=0,releases=0;
 const claim=async()=>{if(claimed)return false;claimed=true;return true;};
 const release=async()=>{claimed=false;releases++;};
 let finish!:()=>void;const gate=new Promise<void>(r=>finish=r);
 const first=withPreparedCarouselLease(claim,async()=>{calls++;await gate;return 'queued';},release);
 await Promise.resolve();
 assert.equal(await withPreparedCarouselLease(claim,async()=>{calls++;return 'duplicate';},release),null);
 finish();assert.equal(await first,'queued');assert.equal(calls,1);assert.equal(releases,1);
 assert.equal(await withPreparedCarouselLease(claim,async()=>'already composed',release),'already composed');
});
test('failed compose releases its claim; an unclaimed request cannot change approvals',async()=>{
 let released=false;const approved={approved_at:'2026-10-02',approved_digest:'signed',media_urls:['original']};
 assert.equal(await withPreparedCarouselLease(async()=>false,async()=>{approved.media_urls=['changed'];return approved;},async()=>{released=true;}),null);
 assert.deepEqual(approved.media_urls,['original']);assert.equal(released,false);
 await assert.rejects(withPreparedCarouselLease(async()=>true,async()=>{throw new Error('media unavailable');},async()=>{released=true;}));assert.equal(released,true);
});
test('reruns retain queued media and every signed row, including failed and regeneration requests',()=>{
 for(const status of ['queued','approved','published','skipped'])assert.equal(preparedCarouselReviewLocked({status}),true);
 for(const status of ['queued','failed','superseded'])assert.equal(preparedCarouselReviewLocked({status,approved_at:'2026-10-02',regenerate_requested_at:'2026-10-02'}),true);
 assert.equal(preparedCarouselReviewLocked({status:'failed',approved_at:null}),false);
});
test('only a successfully queued idea enters planned review; failures and owner removal stay unchanged',()=>{
 assert.equal(preparedCarouselCompletedState('idea','queued'),'planned');
 for(const outcome of ['failed','skipped',undefined])assert.equal(preparedCarouselCompletedState('idea',outcome),'idea');
 assert.equal(preparedCarouselCompletedState('removed','queued'),'removed');
});
