import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Local Node 25 / CI Node 22 SQLite API, application has Node 20 types.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sendWelcomeEmails} from './welcome-email';
import {handleSignup} from './signup';
function harness() {
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync('drizzle/0003_signups.sql','utf8'));
  const DB={prepare(sql:string){const values:unknown[]=[];const statement={bind(...v:unknown[]){values.push(...v);return statement;},async run(){return db.prepare(sql).run(...values);},async first(){return db.prepare(sql).get(...values)??null;},async all(){return {results:db.prepare(sql).all(...values)};}};return statement;}};
  const env={DB,RESEND_API_KEY:'test'} as any;
  const signup=(email='parent@example.test')=>handleSignup(new Request('https://mimipip.com/api/signup',{method:'POST',headers:{origin:'https://mimipip.com','Content-Type':'application/json'},body:JSON.stringify({email,agree:true})}),env);
  const migrate=()=>db.exec(readFileSync('drizzle/0005_welcome_email.sql','utf8'));
  const rows=()=>db.prepare('SELECT * FROM mimipip_welcome_email').all();
  return {db,env,signup,migrate,rows};
}
test('migration never emails historical subscribers; one welcome for a new address despite repeat signup',async()=>{
  const h=harness();await h.signup('existing@example.test');h.migrate();assert.equal(h.rows().length,0);
  await h.signup();await h.signup();assert.equal(h.rows().length,1);
  let calls=0;
  const send=async(_url:unknown,init:any)=>{calls++;const payload=JSON.parse(init.body);assert.equal(payload.from,'MimiPip <hello@mimipip.com>');assert.match(payload.html,/https:\/\/mimipip.com\/unsubscribe\?key=[a-f0-9]{32}/);return Response.json({id:'provider-1'});};
  await sendWelcomeEmails(h.env,undefined,send as any,1000000);
  await sendWelcomeEmails(h.env,undefined,send as any,2000000);
  assert.equal(calls,1);assert.equal(h.rows()[0].state,'accepted');
});
test('ambiguous timeout retries identical payload and key, then stops before idempotency expiry',async()=>{
  const h=harness();h.migrate();await h.signup();const requests:any[]=[];
  const send=async(_url:unknown,init:any)=>{requests.push(init);throw Error('timeout');};
  await sendWelcomeEmails(h.env,undefined,send as any,1000000);
  await sendWelcomeEmails(h.env,undefined,send as any,1300000);
  assert.equal(requests.length,2);assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
  await sendWelcomeEmails(h.env,undefined,send as any,1000000+23*3600000);
  assert.equal(requests.length,2);assert.equal(h.rows()[0].state,'review');
});
test('unsubscribe cancels pending welcome, even when scheduled send is retried',async()=>{
  const h=harness();h.migrate();await h.signup();h.db.exec('UPDATE mimipip_signups SET unsubscribed_at=1');
  await sendWelcomeEmails(h.env,undefined,async()=>{assert.fail('Must not send');},1000000);
  assert.equal(h.rows()[0].state,'cancelled');
});
test('concurrent workers claim only once; temporary failure is retried, permanent rejection is held',async()=>{
  const h=harness();h.migrate();await h.signup();let calls=0;
  const send=async()=>{calls++;return Response.json({error:'busy'},{status:429});};
  await Promise.all([sendWelcomeEmails(h.env,undefined,send,1000000),sendWelcomeEmails(h.env,undefined,send,1000000)]);
  assert.equal(calls,1);assert.equal(h.rows()[0].state,'pending');
  await sendWelcomeEmails(h.env,undefined,async()=>Response.json({error:'invalid'},{status:422}),1300000);
  assert.equal(h.rows()[0].state,'review');
});
