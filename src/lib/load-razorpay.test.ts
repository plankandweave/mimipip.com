import assert from "node:assert/strict";
import test from "node:test";
import { loadRazorpay } from "./load-razorpay";

test("a blocked gateway script times out, concurrent loads coalesce, and retry succeeds", async () => {
  type Script = { onload: null | (() => void); onerror: null | (() => void); remove: () => void; src: string };
  const scripts: Script[] = []; let removed=0;
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,"window"),originalDocument=Object.getOwnPropertyDescriptor(globalThis,"document");
  const win: {Razorpay?: unknown} = {};
  Object.defineProperty(globalThis,"window",{configurable:true,value:win});
  Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:()=>({remove:()=>removed++}),body:{appendChild:(s:Script)=>scripts.push(s)}}});
  try {
    const first=loadRazorpay(10),same=loadRazorpay(10);
    assert.equal(first,same);
    assert.equal(await first,false);
    assert.equal(scripts.length,1);
    assert.equal(removed,1);
    const retry=loadRazorpay(100);
    win.Razorpay=function(){};
    scripts[1].onload!();
    assert.equal(await retry,true);
    assert.equal(await loadRazorpay(),true);
    assert.equal(scripts.length,2);
  } finally {
    if(originalWindow)Object.defineProperty(globalThis,"window",originalWindow);else Reflect.deleteProperty(globalThis,"window");
    if(originalDocument)Object.defineProperty(globalThis,"document",originalDocument);else Reflect.deleteProperty(globalThis,"document");
  }
});
