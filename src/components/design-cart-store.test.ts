import {test} from "node:test";
import assert from "node:assert/strict";
import {addLine,readLines,saveLines,wallpaperPrice,type Line} from "./design-cart-store";
const line:Line={slug:"sky",name:"Sky",size:"50 × 90 cm",dimensions:{width:50,height:90},qty:1,currency:"USD",amount:null};
test("custom measurements, unknown prices and currencies survive storage",()=>{
 let value="";
 Object.defineProperty(globalThis,"localStorage",{value:{getItem:()=>value,setItem:(_:string,v:string)=>value=v},configurable:true});
 Object.defineProperty(globalThis,"window",{value:new EventTarget(),configurable:true});
 const lines=addLine([line],{...line,currency:"INR"});
 saveLines(lines);assert.deepEqual(readLines(),lines);
 assert.equal(addLine(lines,line)[0].qty,2);
 value="broken";assert.throws(readLines);
 value='[{}]';assert.throws(readLines);
});
test("invalid quantities, invalid sizes and oversized merged selections are rejected",()=>{
 for(const qty of [0,1.5,-1,100])assert.throws(()=>addLine([],{...line,qty}));
 assert.throws(()=>addLine([{...line,qty:99}],line));
 assert.throws(()=>addLine([],{...line,dimensions:{width:0,height:90}}));
 assert.equal(wallpaperPrice({width:30.48,height:30.48},10),200);
 assert.equal(wallpaperPrice({width:300,height:250},10),807.29);
});
