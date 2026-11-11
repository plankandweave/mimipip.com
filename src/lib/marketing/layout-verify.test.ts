import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import * as checks from "./layout-check";
import * as mediaUrls from "../media-url";

// Run the real storage helper and verifier with a Workers binding. Any HTTP
// call fails, reproducing production's own-zone restriction rather than a
// laptop's unrestricted fetch behavior.
function verifier(get: (key:string)=>Promise<unknown>) {
 const load=(file:string, imports:Record<string,unknown>)=>{
  const exports:Record<string,any>={};
  const source=readFileSync(new URL(file,import.meta.url),"utf8");
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(compiled,{exports,Buffer,Response,AbortSignal,
   fetch:()=>{throw Error("Own-zone HTTP blocked");},
   require:(name:string)=>{if(!(name in imports))throw Error(`Unexpected import ${name}`);return imports[name];},
  });
  return exports;
 };
 const storage=load("../r2-media.ts",{"cloudflare:workers":{env:{MEDIA_R2:{get}}},"@/lib/media-url":mediaUrls});
 return load("./layout-verify.ts",{"node:crypto":{createHash},"../r2-media":storage,"./layout-check":checks}).verifyLayoutFiles;
}
const url="https://media.zyvorah.com/marketing-media/carousels/approved.jpg";
const bytes="exact reviewed export";
const art={brand_layout:checks.LAYOUT_VERSION,layout_receipt:{version:checks.LAYOUT_VERSION,assets:[{
 url,sha256:createHash("sha256").update(bytes).digest("hex"),frames:[{surface:"feed",width:1080,height:1350,logo:{x:98,y:57,width:40,height:50},text:{x:97,y:1050,width:640,height:203},textLeft:97,titleFoot:1249,fonts:true,solidText:true}]
}]}};
test("approval verifies exact R2 bytes without fetching its own zone",async()=>{
 const keys:string[]=[];
 const verify=verifier(async key=>{keys.push(key);return {body:new Response(bytes).body};});
 assert.equal(await verify(art,[url],url,true),null);
 assert.deepEqual(keys,["marketing-media/carousels/approved.jpg"]);
});
test("missing, changed and unreadable R2 exports remain blocked",async()=>{
 assert.match(await verifier(async()=>null)(art,[url],null,true),/could not be verified/);
 assert.match(await verifier(async()=>({body:new Response("changed").body}))(art,[url],null,true),/bytes changed/);
 assert.match(await verifier(async()=>{throw Error("storage unavailable");})(art,[url],null,true),/could not be verified/);
});
