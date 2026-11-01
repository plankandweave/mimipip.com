import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seal,unseal,owner,secretSetup} from './secret-setup';
test('AES-GCM stores ciphertext, randomizes repeated saves and rejects tampering/wrong keys',async()=>{
 const secret='TEST-ONLY-'+ 'x'.repeat(40),a=await seal(secret,'test-master'),b=await seal(secret,'test-master');assert.notEqual(a.ciphertext,b.ciphertext);assert.ok(!a.ciphertext.includes(secret));assert.equal(await unseal(a,'test-master'),secret);await assert.rejects(unseal(a,'wrong-master'));await assert.rejects(unseal({...a,ciphertext:'A'+a.ciphertext.slice(1)},'test-master'));
});
test('setup rejects missing identity and non-owner identity before touching storage',async()=>{
 for(const headers of [{},{'oai-authenticated-user-email':'other@example.test','oai-authenticated-user-id':'other'},{'oai-authenticated-user-email':'roheena@plankandweave.com'}]){const req=new Request('https://mimipip.com/payment-setup',{headers:headers as Record<string,string>});assert.ok(!owner(req));assert.equal((await secretSetup(req,{})).status,401);}
});
test('one-time setup does not return stored data and rejects cross-origin posts',async()=>{
 const headers={'oai-authenticated-user-email':'roheena@plankandweave.com','oai-authenticated-user-id':'site-owner'};
 const DB={prepare(){return {bind(){return {first:async()=>null,run:async()=>{throw new Error('must not write')}}}}}};
 const response=await secretSetup(new Request('https://mimipip.com/payment-setup',{method:'POST',headers:{...headers,origin:'https://evil.test'}}),{DB,RAZORPAY_KEY_SECRET:'test-master'});assert.equal(response.status,403);
 const get=await secretSetup(new Request('https://mimipip.com/payment-setup',{headers}),{DB,RAZORPAY_KEY_SECRET:'test-master'});assert.equal(get.status,200);const html=await get.text();assert.ok(!html.includes('test-master'));assert.ok(!html.includes('<script'));assert.ok(get.headers.get('Content-Security-Policy')?.includes("frame-ancestors 'none'"));
});
test('direct setup stores only ciphertext, decrypts for server use, and refuses replacement',async()=>{
 // @ts-expect-error Test runtime is Node 25; app retains Node 20 typings.
 const {DatabaseSync}=await import('node:sqlite');
 const {readFileSync}=await import('node:fs');
 const db=new DatabaseSync(':memory:');db.exec(readFileSync('drizzle/0001_typical_sheva_callister.sql','utf8'));
 const DB={prepare(sql:string){return {bind(...values:any[]){const q=db.prepare(sql);return {first:async()=>q.get(...values)||null,run:async()=>q.run(...values)};}}}};
 const env={DB,RAZORPAY_KEY_SECRET:'test-master'},headers={'oai-authenticated-user-email':'roheena@plankandweave.com','oai-authenticated-user-id':'owner-id'};
 const form=await (await secretSetup(new Request('https://mimipip.com/payment-setup',{headers}),env)).text();const csrf=form.match(/name="csrf" value="([^"]+)"/)![1];const secret='TESTONLY-'+ 's'.repeat(40);
 const result=await secretSetup(new Request('https://mimipip.com/payment-setup',{method:'POST',headers:{...headers,origin:'https://mimipip.com','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,secret,confirm:secret})}),env);
 assert.equal(result.status,200);assert.ok(!(await result.text()).includes(secret));const row=db.prepare('SELECT * FROM mimipip_payment_settings').get()!;assert.ok(!JSON.stringify(row).includes(secret));assert.equal(await unseal(row as any,'test-master'),secret);
 assert.ok((await (await secretSetup(new Request('https://mimipip.com/payment-setup',{headers}),env)).text()).includes('already stored securely'));
});
