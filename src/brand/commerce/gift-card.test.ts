import test from 'node:test';
import assert from 'node:assert/strict';
import {handleGiftCard} from './gift-card';
import {renderGiftCardHtml,formatGiftCardAmount} from './gift-card-presentation';

test('readiness offers INR previews without enabling issuance',async()=>{
 const r=await handleGiftCard(new Request('https://mimipip.com/api/gift-card/readiness'));
 assert.equal(r.status,200);assert.deepEqual((await r.json()).currencies,['INR']);
 assert.equal((await (await handleGiftCard(new Request('https://mimipip.com/api/gift-card/readiness'))).json()).open,false);
});
test('all inherited financial and email routes remain unavailable',async()=>{
 for(const path of ['', '/create','/verify','/check','/image','/status']) {
  const r=await handleGiftCard(new Request('https://mimipip.com/api/gift-card'+path,{method:'POST',body:'{}'}));
  assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');
 }
});
test('email escapes recipient input and does not expose inactive codes',()=>{
 const html=renderGiftCardHtml({style:'blue-daisy',recipientName:'<script>alert(1)</script>',senderName:'A & B',occasion:'Baby shower',amount:21000,currency:'INR',status:'preview',code:'SECRET-CODE'},{mode:'email'});
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('SECRET-CODE'));assert.ok(html.includes('mimipip.com'));assert.ok(!html.includes('Valid until'));
 assert.equal(formatGiftCardAmount(21000,'INR'),'₹21,000');
});
