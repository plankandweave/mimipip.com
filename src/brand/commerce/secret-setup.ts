/** Owner-only, write-once secret entry. Plaintext never leaves the HTTPS request/runtime. */
import {createHmac,timingSafeEqual} from 'node:crypto';
type Store={prepare(sql:string):{bind(...v:unknown[]):{first<T=any>():Promise<T|null>;run():Promise<unknown>}}};
export type SetupEnv={DB?:Store;RAZORPAY_KEY_SECRET?:string;RAZORPAY_WEBHOOK_SECRET?:string};
const ownerEmail='roheena@plankandweave.com';
const encode=new TextEncoder();
const b64=(b:Uint8Array)=>Buffer.from(b).toString('base64');
const un64=(s:string)=>new Uint8Array(Buffer.from(s,'base64'));
async function key(master:string,salt:Uint8Array){const k=await crypto.subtle.importKey('raw',encode.encode(master),'HKDF',false,['deriveKey']);return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:new Uint8Array(salt),info:encode.encode('mimipip:webhook-secret:v1')},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function seal(secret:string,master:string){const salt=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encode.encode('mimipip-webhook-v1')},await key(master,salt),encode.encode(secret));return {ciphertext:b64(new Uint8Array(encrypted)),iv:b64(iv),salt:b64(salt)};}
export async function unseal(row:{ciphertext:string;iv:string;salt:string},master:string){return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(row.iv),additionalData:encode.encode('mimipip-webhook-v1')},await key(master,un64(row.salt)),un64(row.ciphertext)));}
export async function getWebhookSecret(env:SetupEnv){if(env.RAZORPAY_WEBHOOK_SECRET)return env.RAZORPAY_WEBHOOK_SECRET;if(!env.DB||!env.RAZORPAY_KEY_SECRET)return undefined;const row=await env.DB.prepare('SELECT ciphertext,iv,salt FROM mimipip_payment_settings WHERE id=?').bind('razorpay-webhook').first<{ciphertext:string;iv:string;salt:string}>();return row?await unseal(row,env.RAZORPAY_KEY_SECRET):undefined;}
export function owner(request:Request){return request.headers.get('oai-authenticated-user-email')?.toLowerCase()===ownerEmail&&!!request.headers.get('oai-authenticated-user-id');}
function csrf(id:string,master:string){return createHmac('sha256',master).update('mimipip:setup-csrf:'+id).digest('hex');}
function page(content:string,status=200){return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MimiPip payment setup</title><style>body{font:17px system-ui;background:#fffaf0;color:#593819;margin:40px auto;padding:0 24px;max-width:640px;line-height:1.6}input{display:block;box-sizing:border-box;width:100%;font:inherit;padding:12px;margin:8px 0 24px;border:1px solid #a38c70;border-radius:8px}button,a{font:inherit;color:inherit}button{padding:12px 20px;background:#714414;color:white;border:0;border-radius:8px;cursor:pointer}code{overflow-wrap:anywhere}label{display:block}</style><main><h1>MimiPip payment setup</h1>'+content+'</main></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'}});}
export async function secretSetup(request:Request,env:SetupEnv){
 if(!owner(request))return page('<p>This page is restricted to MimiPip’s owner account.</p><a href="/signin-with-chatgpt?return_to=%2Fpayment-setup" target="_top">Sign in with ChatGPT</a>',401);
 if(!env.DB||!env.RAZORPAY_KEY_SECRET)return page('<p>Payment hosting is not ready. No secret was saved.</p>',503);
 const id=request.headers.get('oai-authenticated-user-id')!;
 try{
 const existing=await env.DB.prepare('SELECT id FROM mimipip_payment_settings WHERE id=?').bind('razorpay-webhook').first();
 if(existing||env.RAZORPAY_WEBHOOK_SECRET)return page('<p>A webhook secret is already stored securely. This one-time form is closed to prevent accidental replacement.</p><p>Finish saving the identical secret in Razorpay, then verify delivery. Never put it in chat.</p>');
 if(request.method==='GET')return page('<p>Enter the same new random secret here and in Razorpay’s <strong>Secret</strong> field. This page sends it directly to MimiPip over HTTPS and stores only encrypted data. No third-party scripts run here.</p><form method="post" action="/payment-setup"><input type="hidden" name="csrf" value="'+csrf(id,env.RAZORPAY_KEY_SECRET)+'"><label>Webhook secret<input type="password" name="secret" autocomplete="new-password" minlength="32" maxlength="256" required></label><label>Confirm webhook secret<input type="password" name="confirm" autocomplete="new-password" minlength="32" maxlength="256" required></label><button type="submit">Save secret securely</button></form><p>Razorpay webhook URL: <code>https://mimipip.com/api/india-checkout/webhook</code><br>Event: <code>payment.captured</code></p>');
 if(request.method!=='POST')return page('<p>Method not allowed.</p>',405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return page('<p>Request origin did not match. Nothing was saved.</p>',403);
 const raw=await request.text();if(raw.length>2048)return page('<p>Request too large.</p>',413);
 const body=new URLSearchParams(raw),actual=body.get('csrf')||'',expected=csrf(id,env.RAZORPAY_KEY_SECRET);
 if(actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return page('<p>Session check failed. Reload this page.</p>',403);
 const secret=body.get('secret')||'';
 if(secret.length<32||secret.length>256||secret!==body.get('confirm')||secret.trim()!==secret)return page('<p>The two secrets must match and be 32–256 characters. Nothing was saved. Return and try again.</p>',400);
 const sealed=await seal(secret,env.RAZORPAY_KEY_SECRET);
 await env.DB.prepare('INSERT INTO mimipip_payment_settings (id,ciphertext,iv,salt,owner_id,created_at) VALUES (?,?,?,?,?,?)').bind('razorpay-webhook',sealed.ciphertext,sealed.iv,sealed.salt,id,Date.now()).run();
 return page('<p><strong>Webhook secret saved securely.</strong></p><p>Now save the identical value in Razorpay. The value cannot be viewed or replaced on this page. Keep your own password-manager copy.</p><p><a href="/india-checkout/">Return to India checkout</a></p>');
 }catch{return page('<p>Setup could not be completed. No secret is displayed. Reload to check whether it was saved.</p>',503);}
}
