import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import * as readiness from "./review-readiness";
import {summariseSocial} from "../social-summary";
import {LAYOUT_VERSION} from "./layout-check";
const url="https://media.zyvorah.com/a.jpg";
const post={id:"p",status:"queued",channel:"instagram",format:"feed",caption:"Together",media_urls:[url],safety_passed:true,plan_slot_id:"s",plan_key:"c",slot_key:"2099-01-01#0"};
const plan={id:"s",status:"planned",kind:"feed",plan_key:"c",art:{brand_layout:LAYOUT_VERSION,layout_receipt:{version:LAYOUT_VERSION,assets:[{url,sha256:"a".repeat(64),frames:[{surface:"feed",width:1080,height:1350,logo:{x:98,y:57,width:38,height:50},text:{x:97,y:1050,width:640,height:203},textLeft:97,titleFoot:1249,fonts:true,solidText:true}]}]}}};
function queue(options:{fileError?:string;readError?:boolean;missingReceipt?:boolean;posts?:typeof post[]}={}) {
 let verified=0; const ranges:number[]=[];
 const db={from:(table:string)=>{
   const data=table==="marketing_plan_slots"?[options.missingReceipt?{...plan,art:{}}:plan]:table==="marketing_plans"?[{key:"c",status:"live"}]:options.posts??[post];
   const result={data,error:options.readError?{message:"offline"}:null};
   const query={select:()=>query,in:()=>Promise.resolve(result),or:()=>query,neq:()=>query,order:()=>query,
     range:(a:number,b:number)=>{ranges.push(a);return Promise.resolve({...result,data:data.slice(a,b+1)});},
     then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};
   return query;
 }};
 const imports:Record<string,unknown>={"./db":{serviceClient:()=>db},"./profiles":{PERSONAL_PLAN_PREFIX:"personal-roheena-"},"./plan":{designSequenceCheck:async()=>[]},"./layout-verify":{verifyLayoutFiles:async()=>{verified++;return options.fileError??null;}},"./review-readiness":readiness};
 const exports:Record<string,any>={};
 runInNewContext(ts.transpileModule(readFileSync(new URL("./review-queue.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>{if(!(name in imports))throw Error(name);return imports[name];}});
 return {fetch:exports.fetchReviewLedger,verified:()=>verified,ranges};
}
test("the actual queue reader requires exact-file verification before email eligibility",async()=>{
 const q=queue();const rows=await q.fetch();
 assert.equal(q.verified(),1);assert.equal(rows[0].review_ready,true);
 assert.equal(summariseSocial(rows,"2026-10-07").awaitingReview,1);
 for(const fileError of ["Export bytes changed", "Export unavailable"]) {
   const bad=queue({fileError});const held=await bad.fetch();
   assert.equal(held[0].review_ready,false);assert.equal(held[0].review_hold,fileError);
   assert.equal(summariseSocial(held,"2026-10-07").awaitingReview,0);
 }
});
test("unmeasured exports stay in production without fetching media or asking for approval",async()=>{
 const q=queue({missingReceipt:true});const rows=await q.fetch();
 assert.equal(q.verified(),0);assert.equal(rows[0].review_ready,false);
 assert.equal(summariseSocial(rows,"2026-10-07").blocked,1);
});
test("a failed database read cannot fall back to the old copy-only queue",async()=>{
 await assert.rejects(queue({readError:true}).fetch(),/offline/);
});
test("all ledger pages are qualified, including posts beyond the old 200 and 400 caps",async()=>{
 const posts=Array.from({length:1001},(_,i)=>({...post,id:String(i),status:i===1000?"queued":"published"}));
 const q=queue({posts});const rows=await q.fetch();
 assert.equal(rows.length,1001);assert.deepEqual(q.ranges,[0,1000]);
 assert.equal(rows.filter((p:readiness.ReviewQualification)=>p.review_ready).length,1);
});
