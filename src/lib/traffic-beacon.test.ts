import assert from "node:assert/strict";
import test from "node:test";
import { trafficPayload, sendTraffic } from "./traffic-beacon";
import { classify, attributionFrom } from "./server-events";

test("Google Ads auto-tagged visits are paid, without retaining click identifiers", () => {
  for (const key of ["gclid", "gbraid", "wbraid"]) {
    const url=`https://zyvorah.com/products/wildflower-reverie?${key}=private-click-id`;
    const payload=trafficPayload(url,"https://google.com/","visit-id");
    assert.equal(payload.google_ads_click,true);
    assert.equal(JSON.stringify(payload).includes("private-click-id"),false);
    assert.deepEqual(classify(payload.referrer,payload.utm_source,payload.utm_medium,payload.google_ads_click),{source:"google",medium:"cpc"});
    assert.equal(attributionFrom({url}).medium,"cpc");
  }
  assert.deepEqual(classify("https://google.com/"),{source:"google",medium:"organic"});
  assert.deepEqual(classify("", "newsletter", "email", true),{source:"newsletter",medium:"email"});
  assert.equal(trafficPayload("https://zyvorah.com/?fbclid=organic-share","","visit").google_ads_click,false);
});

test("traffic retries reuse the original visit and only report success after acknowledgement", async () => {
  const payload=trafficPayload("https://zyvorah.com/collections?utm_source=google&utm_medium=cpc","","fixed-visit");
  const sent:string[]=[];
  const send: typeof fetch=async (_url,options)=>{sent.push(String(options?.body));return new Response(null,{status:sent.length===1?503:200});};
  assert.equal(await sendTraffic(payload,send),true);
  assert.equal(sent.length,2);assert.equal(sent[0],sent[1]);
  let attempts=0;
  assert.equal(await sendTraffic(payload,async()=>{attempts++;throw Error("offline");}),false);
  assert.equal(attempts,2);
  attempts=0;
  assert.equal(await sendTraffic(payload,async()=>{attempts++;return new Response(null,{status:400});}),false);
  assert.equal(attempts,1);
});
