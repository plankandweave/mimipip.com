import test from "node:test";
import assert from "node:assert/strict";
import { proposalCheckoutPrice } from "./proposal-checkout";
test("RISH keeps the entire service fee and reconciles the payable paise", () => {
 const p = proposalCheckoutPrice(19304.87,18,true);
 assert.equal(p.wallpaper,19305); assert.equal(p.customisation,1000);
 assert.equal(p.total,20305); assert.equal(Math.round((p.amount+p.gstAmount)*100),2030500);
 assert.equal(p.rounding,0.13);
});
test("ordinary wallpaper does not acquire a service charge",()=>assert.equal(proposalCheckoutPrice(19304.87,18,false).total,19305));
test("invalid money is refused",()=>{ for(const n of [NaN,Infinity,-1,0]) assert.throws(()=>proposalCheckoutPrice(n,18,true)); });
