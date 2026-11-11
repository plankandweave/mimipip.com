import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function route(entry: string, stubs: Record<string, string>) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
    plugins: [{ name: "purchase-io", setup(b) {
      b.onResolve({ filter: /^(next\/|@\/lib\/)/ }, a => a.path in stubs ? { path: a.path, namespace: "io" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "io" }, a => ({ contents: stubs[a.path], loader: "js" }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const framework = {
  "next/server": `export const after = fn => globalThis.__purchaseTest.after.push(fn); export const NextResponse = { json(body, init) { const r=Response.json(body, init); r.cookies={set(name,value,opts){r.headers.append('set-cookie',name+'='+value+'; Max-Age='+opts.maxAge);}};return r; } };`,
  "next/headers": `export const cookies = async () => ({get: name => globalThis.__purchaseTest.cookie ? {value: globalThis.__purchaseTest.cookie} : undefined});`,
  "@/lib/partner-mode": `export const refusePartnerPurchase = async () => null;`,
  "@/lib/auth-server": `export const getGatedUser = async () => null;`,
  "@/lib/server-events": `export const visitorTokenOf = () => null; export const recordCommercialEvent = async () => {}; export const linkVisitorIdentity = async () => {};`,
  "@/lib/text-overlay-server": `export const renderTextOverlay = async () => {throw Error('not used')};`,
  "@/lib/private-doc": `export const signDoc = async u => u; export const docStorageClient = () => {throw Error('not used')};`,
};

test("a full-price wall reaches payment without waiting for PDF; failed payment and reload resume one order", async () => {
  const originalId = process.env.RAZORPAY_KEY_ID, originalSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = "test-key"; process.env.RAZORPAY_KEY_SECRET = "test-secret";
  const state = { cookie: "test-cart", after: [] as (() => Promise<unknown>)[], orders: 0, pdf: 0, minted: 0, prints: 0, mappingError: false, payment: true, amounts: [] as number[],
    result: { order_id: "saved-order", order_number: 123, subtotal: 16000, shipping: 0, total: 16000, discount: 0, discount_code: null, express: false,
      items: [{ order_item_id: "line", product_handle: "wildflower-reverie", product_title: "Wildflower", material_slug: "soft-matte", material_name: "Soft matte", width_cm: 304.8, height_cm: 243.84, area_sqft: 80, unit_price: 200, quantity: 1, line_total: 16000, crop_data: { imageUrl: "flat.jpg", wallWidthCm: 304.8, wallHeightCm: 243.84, offsetX: 0.5, offsetY: 0.5, zoom: 1 }, preview_url: null }] } };
  Object.assign(globalThis, { __purchaseTest: state });
  try {
    const db = `const s=globalThis.__purchaseTest;
      export const supabase = {rpc: async (name,args) => {
        if(name==='cart_get')return {data:{items:s.result.items}};
        if(name==='checkout_cart'||name==='checkout_cart_v2'){if(s.orders)return {error:{message:'no open cart'}};s.orders++;return {data:s.result};}
        if(name==='resume_order_for_cart')return {data:s.orders?s.result:null};
        if(name==='set_order_razorpay')return {error:s.mappingError?{code:'TEST'}:null};
        return {data:null,error:null};
      }};
      export const supabaseAdmin = () => ({ rpc:supabase.rpc, from(table) {
        let fields=''; const q={ select(f){fields=f;return q}, update(){return q},eq(){return q},
          single:async()=>({data:fields==='shipping_address'?{shipping_address:{countryCode:'IN'}}:{id:'saved-order'}}),
          maybeSingle:async()=>({data:{access_token:'private-token'}}),
          then(resolve){resolve({data:table==='order_items'?[{area_sqft:80,quantity:1}]:[]});} };return q;
      }});`;
    const api = await route("src/app/api/checkout/route.ts", { ...framework,
      "@/lib/supabase": db, "@/lib/supabase-admin": db,
      "@/lib/razorpay": `export const maybeCreateRazorpayOrder=async amount=>{const s=globalThis.__purchaseTest;s.amounts.push(amount);return s.payment?{razorpayOrderId:'order_test',keyId:'test',amount:amount*100,currency:'INR'}:null;};`,
      "@/lib/ga-mp": `export const gaIdsFromCookies=()=>null;`,
      "@/lib/founder-email": `export const sendFounderNote=async()=>{};`,
      "@/lib/subscribe": `export const autoSubscribe=async()=>{};`,
      "@/lib/meta-capi": `export const sendMetaPurchaseForOrder=async()=>{};`,
      "@/lib/meta-request": `export const metaContextFromRequest=()=>({});`,
      "@/lib/media-client": `export const queuePrintFile=async()=>{globalThis.__purchaseTest.prints++;};`,
      "@/lib/order-copy-remote": `export const buildCartOrderCopyPdfRemote=async()=>{globalThis.__purchaseTest.pdf++;return new Promise(()=>{});};`,
      "@/lib/checkout-alert": `export const recordCheckoutFailure=async()=>{};`,
      "@/lib/order-number": `export const ensureOrderZvy=async()=>{globalThis.__purchaseTest.minted++;return 'ZVY-123';};`,
      "@/lib/trade-auth": `export const currentBuyerIsTradeAccount=async()=>false;`,
      "@/lib/os-discount": `export const validateOsDiscount=async()=>({valid:false}); export const discountRefusalFor=()=>null; export const redeemOsDiscount=async()=>{};`,
      "@/lib/discounts": `export const checkDiscount=async()=>({valid:false,reason:'unknown_code'}); export const redeemDiscount=async()=>{};`,
      "@/lib/paid-without-gateway": `export const afterPaidWithoutGateway=async()=>{}; export const loadShippingOrder=async()=>null;`,
    });
    const req = () => new Request("https://zyvorah.com/api/checkout", { method: "POST", body: JSON.stringify({email:"buyer@example.com",countryCode:"IN",shippingAddress:{name:"Test buyer",line1:"Test street",city:"Mumbai",pincode:"400001"}}) });
    state.payment = false;
    const failed = await api.POST(req());
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).orderPlaced, true);
    assert.equal(state.orders, 1);
    assert.equal(state.pdf, 0, "hung PDF renderer never starts before response");
    state.payment = true;
    const retry = await api.POST(req());
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).razorpay.amount, 1600000);
    assert.equal(state.orders, 1, "retry must resume, not duplicate the wall order");
    assert.equal(retry.headers.get("set-cookie"), null, "unpaid order keeps its recovery cookie");
    const reload = await api.GET();
    assert.deepEqual(await reload.json(), {resumePath:"/order/private-token"});
    assert.equal(reload.headers.get("cache-control"), "private, no-store");
    state.mappingError = true;
    assert.equal((await api.POST(req())).status, 503, "never collect against an unattached Razorpay order");
    state.cookie = "";
    assert.deepEqual(await (await api.GET()).json(), {resumePath:null}, "no cookie exposes no order link");
    state.cookie = "test-cart"; state.orders = 0; state.mappingError = false;
    const success = await api.POST(req());
    assert.equal(success.status, 200);
    assert.equal(success.headers.get("set-cookie"), null, "first attempt also retains the recovery cookie");
    // No order is an order until it is paid (8 October 2026): opening the
    // payment window mints no production number, queues no print file and
    // draws no order copy — not before the response, and not after it.
    await Promise.allSettled(state.after.map((fn) => fn()));
    assert.equal((await success.json()).zvy, null, "an unpaid order has no production number");
    assert.equal(state.minted, 0, "ZVY is minted at payment, never at Place order");
    assert.equal(state.prints, 0, "print files are queued at payment, never at Place order");
    assert.equal(state.pdf, 0, "the order copy is drawn at payment, never at Place order");
    state.orders = 0;
    delete process.env.RAZORPAY_KEY_SECRET;
    assert.equal((await api.POST(req())).status, 503);
    assert.equal(state.orders, 0, "incomplete credentials must not consume the cart");
  } finally {
    if (originalId === undefined) delete process.env.RAZORPAY_KEY_ID; else process.env.RAZORPAY_KEY_ID = originalId;
    if (originalSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET; else process.env.RAZORPAY_KEY_SECRET = originalSecret;
    Reflect.deleteProperty(globalThis, "__purchaseTest");
  }
});

test("a saved cart survives a failed follow-up read; read failure never masquerades as an empty cart", async () => {
  const state = { cookie: "", after: [] as unknown[], writes: 0, readError: true };
  Object.assign(globalThis, { __purchaseTest: state });
  try {
    const api = await route("src/app/api/cart/route.ts", { ...framework,
      "@/lib/supabase": `export const supabase={rpc:async name=>{const s=globalThis.__purchaseTest;if(name==='cart_add_item'){s.writes++;return {error:null}};return s.readError?{error:{code:'TEST'}}:{data:{items:[{handle:'wildflower-reverie'}],subtotal:16000}};}};`,
      "@/lib/cart-diagnostics": `export const recordCartFailure=async()=>{};`,
    });
    const response = await api.POST(new Request("https://zyvorah.com/api/cart", {method:"POST",body:JSON.stringify({productHandle:"wildflower-reverie",materialSlug:"soft-matte",widthCm:304.8,heightCm:243.84,areaSqft:80,unitPrice:200,quantity:1,lineTotal:16000})}));
    assert.equal(response.status, 202);
    assert.equal((await response.json()).added, true);
    assert.match(response.headers.get("set-cookie")!, /^zyv_cart=[a-f0-9-]+;/);
    assert.equal(state.writes, 1);
    state.cookie = "saved-cookie";
    assert.equal((await api.GET()).status, 503);
    state.readError = false;
    assert.equal((await (await api.GET()).json()).items.length, 1);
  } finally { Reflect.deleteProperty(globalThis, "__purchaseTest"); }
});

test("payment recovery reads the authorised order's saved currency through the private client", async () => {
  const state = {cookie:"",after:[],allowed:true,readFails:false,mappingError:false,charges:[] as {amount:number;currency:string}[]};
  Object.assign(globalThis,{__purchaseTest:state});
  try {
    const api=await route("src/app/api/order/[token]/pay/route.ts",{...framework,
      "@/lib/supabase":`export const supabase={rpc:async name=>{const s=globalThis.__purchaseTest;return name==='order_pay_context'?{data:s.allowed?{order_id:'saved',order_number:123,total:16000}:null}:{error:s.mappingError?{}:null};},from:()=>{throw Error('private order read with anon key')}};`,
      "@/lib/supabase-admin":`export const supabaseAdmin=()=>({from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>globalThis.__purchaseTest.readFails?{error:{code:'TEST'}}:{data:{notes:JSON.stringify({presentmentCurrency:'USD',presentmentTotal:250,marketCountry:'US'})}}};return q;}});`,
      "@/lib/razorpay":`export const maybeCreateRazorpayOrder=async(amount,_r,_n,currency)=>{globalThis.__purchaseTest.charges.push({amount,currency});return {razorpayOrderId:'order_test',amount:amount*100,currency}};`,
    });
    const pay=()=>api.POST(new Request("https://zyvorah.com/api/order/private/pay",{method:"POST"}),{params:Promise.resolve({token:"private"})});
    assert.equal((await pay()).status,200);
    assert.deepEqual(state.charges,[{amount:250,currency:"USD"}]);
    state.readFails=true;
    assert.equal((await pay()).status,503);
    assert.equal(state.charges.length,1,"unreadable charge cannot fall back to INR");
    state.readFails=false;state.mappingError=true;
    assert.equal((await pay()).status,503);
    state.allowed=false;
    assert.equal((await pay()).status,409);
  } finally {Reflect.deleteProperty(globalThis,"__purchaseTest");}
});

test("quantity and removal writes remain successful when their following cart read fails", async () => {
  const state={cookie:"cart-owner",after:[],writes:0};Object.assign(globalThis,{__purchaseTest:state});
  try {
    const api=await route("src/app/api/cart/route.ts",{...framework,
      "@/lib/supabase":`export const supabase={rpc:async name=>{if(name==='cart_get')return {error:{code:'READ_FAILED'}};globalThis.__purchaseTest.writes++;return {error:null};}};`,
      "@/lib/cart-diagnostics":`export const recordCartFailure=async()=>{};`,
    });
    for(const method of ["PATCH","DELETE"]){
      const response=await api[method](new Request("https://zyvorah.com/api/cart",{method,body:JSON.stringify({itemId:"line",quantity:2})}));
      assert.equal(response.status,202);assert.equal((await response.json()).changed,true);
    }
    assert.equal(state.writes,2);
  }finally{Reflect.deleteProperty(globalThis,"__purchaseTest");}
});

test("traffic writes fail honestly and duplicate acknowledgements use one stable visit key", async () => {
  const state={cookie:"11111111-1111-4111-8111-111111111111",after:[],code:"XX000",rows:[] as Record<string,unknown>[]};Object.assign(globalThis,{__purchaseTest:state});
  try{
    const api=await route("src/app/api/traffic/route.ts",{...framework,
      "next/headers":`export const cookies=async()=>({get:name=>name==='zyv_taste'?{value:globalThis.__purchaseTest.cookie}:undefined});`,
      "@/lib/server-events":`export const classify=()=>({source:'google',medium:'cpc'});`,
      "@/lib/corporate-auth":`export const CORP_COOKIE='corp';export const currentCorporateSession=async()=>null;export const sha256=s=>'hash:'+s;`,
      "@/lib/supabase":`export const supabase={rpc:async()=>({error:{code:'XX000'}})};`,
      "@/lib/supabase-admin":`export const supabaseAdmin=()=>({from:()=>({insert:async row=>{const s=globalThis.__purchaseTest;s.rows.push(row);return {error:s.code?{code:s.code}:null};}})});`,
    });
    const payload={requestId:"22222222-2222-4222-8222-222222222222",landing:"/collections",google_ads_click:true};
    const send=(body:unknown=payload)=>api.POST(new Request("https://zyvorah.com/api/traffic",{method:"POST",headers:{"user-agent":"Chrome/130"},body:JSON.stringify(body)}));
    assert.equal((await send()).status,503);
    state.code="";assert.equal((await send()).status,200);
    state.code="23505";assert.equal((await send()).status,200);
    assert.equal(new Set(state.rows.map(r=>r.event_key)).size,1);
    assert.deepEqual(state.rows[0].meta,{source:"google",medium:"cpc",landing:"/collections"});
    assert.equal((await send({landing:"/"})).status,503,"older clients also receive write failures");
  }finally{Reflect.deleteProperty(globalThis,"__purchaseTest");}
});
