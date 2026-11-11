import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { partnerCapabilities } from "./partner-capabilities";
import * as stageLabel from "./partner-stage-label";
import { partnerMayRequestCancel } from "./cancel-window";
function load(path: string, imports: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText, {exports,Response,URL,require:(name:string) => {
    if(name === "react/jsx-runtime") return {jsx:(type:unknown,props:unknown)=>({type,props}),jsxs:(type:unknown,props:unknown)=>({type,props})};
    return imports[name] ?? {};
  }});
  return exports;
}
const identity = {account:{id:"vs",slug:"vijay-sales",name:"Vijay Sales",email_domain:"vijaysales.com",rate_per_sqft:100,gst_pct:18,pricing_mode:"flat_rate"},email:"sample@vijaysales.com",staff:false,agreementPending:false};
function page(session: any, create = false) {
  let rulesReads = 0;
  const imports = {
    "@/lib/partner-capabilities": {partnerCapabilities},
    "next/navigation": {redirect:(url:string)=>{throw new Error(url);}},
    "@/lib/corporate-auth": {currentCorporateSession:async()=>session,slugMatchesSession:(s:any,slug:string)=>s.account.slug===slug,partnerHome:(a:any)=>`/partners/${a.slug}`,can:()=>create,canAdministerAccount:()=>false,canManageMembers:()=>false},
    "@/lib/print-rules":{fetchPrintRules:async()=>{rulesReads++;return {maxPanelCm:100,overlapCm:2};}},
    "@/lib/supabase-admin":{supabaseAdmin:()=>null},
    "@/lib/print-types":{minBillableWidthMm:()=>980,WALLPAPER_PRINT_TYPE:"wallpaper",WALLPAPER_RULES:{}},
  };
  return {imports,reads:()=>rulesReads,render:(slug="vijay-sales")=>load("../app/partners/[slug]/orders/page.tsx",imports).default({params:Promise.resolve({slug})})};
}
test("workspace preserves authentication, account and agreement gates",async()=>{
  await assert.rejects(page(null).render(), /\/partners\/vijay-sales$/);
  await assert.rejects(page({...identity,account:{...identity.account,slug:"another"}}).render(), /\/partners\/vijay-sales$/);
  await assert.rejects(page({...identity,agreementPending:true}).render(), /\/partners\/vijay-sales\/agreement$/);
  await assert.rejects(page({...identity,account:{...identity.account,slug:"homelane"}}).render("homelane"), /\/partners\/homelane\/projects$/);
});
test("read-only viewers get the account board without order-form pricing or permissions",async()=>{
  const p=page(identity); const view=await p.render();
  assert.equal(view.props.workspace.canCreate,false);assert.equal(view.props.workspace.form,null);assert.equal(p.reads(),0);
  const allowed=page(identity,true);const form=(await allowed.render()).props.workspace.form;
  assert.equal(form.ratePerSqft,100);assert.equal(form.printRules.maxPanelCm,100);assert.equal(allowed.reads(),1);
});
test("existing partner bookmarks select workspace tabs and library design selections survive",async()=>{
  for(const tab of ["stores","settings","team","documents"]) {
    const render=load(`../app/partners/[slug]/${tab}/page.tsx`,page(null).imports).default;
    await assert.rejects(render({params:Promise.resolve({slug:"vijay-sales"})}), (e:Error)=>e.message===`/partners/vijay-sales/orders#${tab}`);
  }
  await assert.rejects(load("../app/partners/[slug]/new/page.tsx",page(null).imports).default({params:Promise.resolve({slug:"vijay-sales"}),searchParams:Promise.resolve({design:"art/one"})}), (e:Error)=>e.message==="/partners/vijay-sales/orders?design=art%2Fone#new");
});
test("the real order handler adds desk POD and batch documents using only account-resolved order IDs",async()=>{
  const calls:number[][]=[]; const filters:unknown[]=[];
  const rows=[{id:"local",os_order_id:1,os_print_order_no:"ZVY-1",status:"frozen"}];
  const query:any={select:()=>query,eq:(...a:unknown[])=>{filters.push(a);return query;},order:()=>query,limit:async()=>({data:rows})};
  class NextResponse extends Response {}
  const module=load("../app/api/corporate/orders/route.ts",{
    "next/server":{NextResponse},
    "@/lib/partner-stage-label":stageLabel,
    "@/lib/corporate-auth":{currentCorporateSession:async()=>identity,can:()=>false},
    "@/lib/supabase-admin":{supabaseAdmin:()=>({from:()=>query})},
    "@/lib/corporate-attention":{classifyAttention:()=>null,hoursWaiting:()=>null,rememberSettled:async()=>new Map(),syncAttention:async()=>{}},
    "@/lib/cancel-window":{orderNosAtPrinter:async(_sb:unknown,nos:string[])=>new Set(nos.filter(n=>n==="ZVY-1")),partnerMayRequestCancel},
    "@/lib/corporate-os":{
      fetchPartnerMirror:async(slug:string)=>{assert.equal(slug,"vijay-sales");return {orders:[{osOrderId:1,viaPortal:true,batchRef:"batch"},{osOrderId:2,viaPortal:false,batchRef:"batch",printStatus:"dispatched",dispatchedAt:"2026-09-15"}],documents:[],installerOptions:[]};},
      fetchOsStatuses:async(ids:number[])=>{calls.push([...ids]);return {1:{printOrderNo:"ZVY-1",printStatus:"queued_for_print"},2:{printOrderNo:"ZVY-2",printStatus:"dispatched",dispatchedAt:"2026-09-15",podNo:"AWB-2"}};},
    },
  });
  const result=await (await module.GET()).json();
  assert.equal(result.accountSlug,"vijay-sales");
  assert.deepEqual(calls,[[1,2]]);assert.deepEqual(filters,[["account_id","vs"]]);
  assert.equal(result.orders[0].batchRef,"batch");assert.equal(result.orders[0].canRequestCancel,false);assert.equal(result.deskOrders[0].os.podNo,"AWB-2");assert.equal(result.deskOrders[0].stageLabel,"Dispatched");
});
