import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../../public/mimipip-analytics.js',import.meta.url),'utf8');
test('consent controls wait for React hydration while static pages still initialise',()=>{
 for(const react of [true,false]){
  let appended=0;const events:Record<string,()=>void>={};
  const context:any={localStorage:{getItem:()=> 'denied'},document:{readyState:'complete',documentElement:{hasAttribute:()=>react},createElement:()=>({style:{},addEventListener(){}}),querySelector:()=>({append(){appended++;}})}};
  context.window={addEventListener:(event:string,fn:()=>void)=>{events[event]=fn;}};
  runInNewContext(source,context);assert.equal(appended,react?0:1);
  if(react){assert.ok(events['mimipip:hydrated']);events['mimipip:hydrated']();assert.equal(appended,1);}
 }
});
