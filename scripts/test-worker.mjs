import assert from 'node:assert/strict';
const base='http://127.0.0.1:8795';
const tests=[
 ['/','A room for every little story.'],['/collections','Little steps big adventures'],
 ['/browse/collection?value=little-steps-big-adventures','5 designs'],
 ['/collections/happy-lines','11 designs'],
 ['/products/dino-days-stair-sticker-set','Ordering unavailable'],
 ['/search?q=Forest%20Friends','Forest Friends Stair Sticker Set'],
 ['/account','Sign-in and saved orders are unavailable'],['/cart','Ordering is unavailable'],['/checkout','not available'],
];
for(const [path,expected] of tests){
 const r=await fetch(base+path);assert.equal(r.status,200,path);
 const text=(await r.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 assert.ok(text.includes(expected),path+' missing '+expected); console.log('PASS',path);
}
const r=await fetch(base+'/api/search?q=Space%20Club');const found=await r.json();assert.ok(found.results.some(p=>p.handle==='space-club-stair-sticker-set'&&p.fromPricePerSqft===null));console.log('PASS inline nav search');
