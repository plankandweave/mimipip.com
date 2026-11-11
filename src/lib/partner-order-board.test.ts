import assert from "node:assert/strict";
import { test } from "node:test";
import { orderLane, groupBoardOrders, documentsForOrder, proposalBoardRows, type BoardOrder } from "./partner-order-board";
const row: BoardOrder = { key:"one",ref:"ZVY-1",name:"Wall",po:"PO-1",group:null,osId:1,batch:null,width:3000,height:2700,stage:"Rendering",attention:null,createdAt:"2026-09-15",dispatchedAt:null,courier:null,pod:null,trackingUrl:null,location:"Pune",fromDesk:false };
test("orders progress by production facts and attention takes precedence over archival", () => {
  assert.equal(orderLane({...row,stage:"Draft"}),"waiting");
  assert.equal(orderLane({...row,stage:"Awaiting payment"}),"waiting");
  assert.equal(orderLane(row),"production");
  assert.equal(orderLane({...row,stage:"Pending printing"}),"production");
  assert.equal(orderLane({...row,stage:"Printing complete"}),"dispatch");
  assert.equal(orderLane({...row,stage:"Awaiting pickup"}),"dispatch");
  assert.equal(orderLane({...row,dispatchedAt:"2026-09-15"}),"archive");
  assert.equal(orderLane({...row,stage:"Dispatched",attention:"Missing shipment information"}),"waiting");
});
test("partly dispatched portal and desk walls remain together until the whole group finishes", () => {
  const rows = [{...row,group:"sale"},{...row,key:"two",group:"sale",stage:"Dispatched",fromDesk:true}];
  const groups = groupBoardOrders(rows);
  assert.equal(groups.length,1); assert.equal(groups[0].lane,"production"); assert.equal(groups[0].items.length,2);
  assert.equal(groupBoardOrders(rows.map(o => ({...o,stage:"Dispatched"})))[0].lane,"archive");
});
test("a matching invoice, POD or store finds archived orders without losing other walls in their group", () => {
  const docs = [{id:1,number:"INV-98",kind:"tax",orderId:1,grandTotal:100,createdAt:null,sentAt:null}];
  assert.equal(groupBoardOrders([{...row,stage:"Dispatched"}],"inv-98",docs).length,1);
  assert.equal(groupBoardOrders([{...row,pod:"AWB-42"}],"awb-42").length,1);
  assert.equal(groupBoardOrders([row],"pune").length,1);
  assert.equal(groupBoardOrders([row],"missing").length,0);
  assert.equal(documentsForOrder({...row,osId:2},docs).length,0);
  assert.equal(documentsForOrder(row,docs).length,1);
});
test("unrelated walls without a group never merge by a reused purchase order number", () => {
  assert.equal(groupBoardOrders([row,{...row,key:"two"}]).length,2);
  assert.equal(documentsForOrder(row,[{id:1,number:"unrelated",kind:"tax",orderId:null,batchRef:null,groupRef:null,grandTotal:null,createdAt:null,sentAt:null}]).length,0);
});

test("a store proposal waiting on the partner sits in Waiting on, one order with its walls", () => {
  const rows = proposalBoardRows([
    { id: "59491a83", title: "EBD Gurgaon — Sector 89 — Series 2 Electronics", city: "Gurgaon", awaitingApproval: 3, createdAt: "2026-10-24T18:01:21Z" },
    { id: "done", title: "Narsingi", awaitingApproval: 0 },
  ]);
  assert.equal(rows.length, 3);
  const groups = groupBoardOrders(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].lane, "waiting");
  assert.equal(groups[0].items.length, 3);
  assert.equal(rows[0].ref, "EBD Gurgaon — Sector 89 — Series 2 Electronics");
});
