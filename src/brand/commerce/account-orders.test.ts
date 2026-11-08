import {test}from'node:test';import assert from'node:assert/strict';
// @ts-expect-error Node25 test runner; application keeps Node20 declarations.
import {DatabaseSync}from'node:sqlite';
import{readAccountOrders,orderMoney}from'./account-orders';
test('paid account history is scoped to verified email, including direct receipt lookup',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE mimipip_orders(id TEXT,status TEXT,created_at INTEGER,amount INTEGER,currency TEXT,lines TEXT,customer TEXT,token_hash TEXT,payment_id TEXT)');
 const insert=sqlite.prepare('INSERT INTO mimipip_orders VALUES (?,?,?,?,?,?,?,?,?)');
 const lines=JSON.stringify([{slug:'almond-blossom',name:'Almond Blossom',qty:1,lineMinor:72000,widthCm:243.84,heightCm:274.32,crop:{approval:'private-layout'}}]);
 insert.run('MP-1111111111111111','paid',1000,72000,'USD',lines,JSON.stringify({email:' Buyer@Example.test ',address:'private-address'}),'private-token-hash','private-payment-id');
 insert.run('MP-2222222222222222','paid',2000,1699200,'INR',lines,JSON.stringify({email:'other@example.test'}),'other-hash','other-payment');
 insert.run('MP-3333333333333333','pending',3000,72000,'USD',lines,JSON.stringify({email:'buyer@example.test'}),'pending-hash','');
 const db:any={prepare:(sql:string)=>({bind:(...args:unknown[])=>({all:async()=>({results:sqlite.prepare(sql).all(...args)})})})};
 const result=await readAccountOrders(db,'buyer@example.test');assert.equal(result.length,1);assert.equal(result[0].id,'MP-1111111111111111');assert.equal(orderMoney(result[0]),'$720.00');
 assert.deepEqual(await readAccountOrders(db,'other@example.test','MP-1111111111111111'),[]);
 assert.deepEqual(await readAccountOrders(db,"x@example.test' OR 1=1 --"),[]);
 assert.doesNotMatch(JSON.stringify(result),/private-address|private-payment|private-token|private-layout/);
 await assert.rejects(()=>readAccountOrders(db,''));sqlite.close();
});
