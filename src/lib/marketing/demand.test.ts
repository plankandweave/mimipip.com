import assert from "node:assert/strict";
import test from "node:test";
import {build} from "esbuild";

test("merchandising learns from native cart adds once and excludes declared bots",async()=>{
  const result=await build({entryPoints:["src/lib/marketing/insights.ts"],bundle:true,write:false,platform:"node",format:"esm",plugins:[{name:"demand-io",setup(b){
    b.onResolve({filter:/^\.\/(db|publish)$/},a=>({path:a.path,namespace:"io"}));
    b.onLoad({filter:/.*/,namespace:"io"},a=>({loader:"js",contents:a.path==="./publish"?`export const publisherFor=()=>({});`:`
      export const hasServiceRole=()=>true;
      export const serviceClient=()=>({from(table){
        let rows=table==='site_events'?[
          {product_handle:'buyer-design',event:'cart_add',is_bot:false},
          {product_handle:'buyer-design',event:'cart',is_bot:false},
          {product_handle:'viewed-design',event:'view',is_bot:false},
          {product_handle:'crawler-design',event:'cart_add',is_bot:true}
        ]:[];
        const q={select(){return q},gte(){return q},not(){return q},order(){return q},limit(){return q},
          eq(key,value){rows=rows.filter(r=>r[key]===value);return q},in(key,values){rows=rows.filter(r=>values.includes(r[key]));return q},
          then(resolve){resolve({data:rows})}};return q;
      }});
    `}));
  }}]});
  const {learnedSignals}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  const signals=await learnedSignals();
  assert.equal(signals.byHandle.get('buyer-design'),2);
  assert.equal(signals.byHandle.get('viewed-design'),1.125,"cart counts at weight 8, not twice with its browser echo");
  assert.equal(signals.byHandle.has('crawler-design'),false);
});
