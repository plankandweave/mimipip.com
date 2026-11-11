import assert from "node:assert/strict";
import test from "node:test";
import { maybeCreateRazorpayOrder } from "./razorpay";

test("wall-sized payments validate minor units and recover from gateway failures", async () => {
  const originalFetch=globalThis.fetch, oldId=process.env.RAZORPAY_KEY_ID, oldSecret=process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID="test";process.env.RAZORPAY_KEY_SECRET="test";
  try {
    for (const amount of [200, 11978, 16000, 18639]) {
      globalThis.fetch = async (_url, init) => {
        const body=JSON.parse(init!.body as string);
        assert.equal(body.amount,amount*100);
        assert.ok(init?.signal instanceof AbortSignal);
        return Response.json({id:"order_test",amount:body.amount,currency:body.currency});
      };
      assert.equal((await maybeCreateRazorpayOrder(amount,"test"))?.amount,amount*100);
    }
    globalThis.fetch=async()=>{throw new Error("network failed")};
    assert.equal(await maybeCreateRazorpayOrder(16000,"test"),null);
    globalThis.fetch=async()=>new Response("not json");
    assert.equal(await maybeCreateRazorpayOrder(16000,"test"),null);
    globalThis.fetch=async()=>Response.json({id:"order_test",amount:1,currency:"USD"});
    assert.equal(await maybeCreateRazorpayOrder(16000,"test"),null);
    globalThis.fetch=async()=>{throw new Error("must not request invalid amount")};
    for (const amount of [NaN,Infinity,-1,0]) assert.equal(await maybeCreateRazorpayOrder(amount,"test"),null);
  } finally {
    globalThis.fetch=originalFetch;
    if(oldId===undefined)delete process.env.RAZORPAY_KEY_ID;else process.env.RAZORPAY_KEY_ID=oldId;
    if(oldSecret===undefined)delete process.env.RAZORPAY_KEY_SECRET;else process.env.RAZORPAY_KEY_SECRET=oldSecret;
  }
});
