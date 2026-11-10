import {handleSampleOrder} from '../src/brand/commerce/sample-order';
import {publicPage} from "./public-page";
import {legacyPetalsDestination} from '../src/brand/review/petals-legacy';
import floorPlay from './floor-play.json';
import {handleCommerce,sweep,type Env as CheckoutEnv} from '../src/brand/commerce/checkout';
import {handleSignup} from '../src/brand/commerce/signup';
import {withCheckoutBrowserPolicy} from '../src/brand/network-policy';
import { guides } from '../src/brand/review/guides';
import handler from 'vinext/server/fetch-handler';
import {withOfflineBrowserPolicy} from '../src/brand/network-policy';
import records from '../src/brand/review/catalogue.json';
import {FEEDS} from '../src/brand/seo/feeds';
import {openAiFeedResponse} from '../src/brand/seo/openai-feed';
import {llmsTxt} from '../src/brand/seo/llms';
import {isSellable} from '../src/brand/seo/site';
import {sitemapXml} from '../src/brand/seo/sitemap';
import {hiddenDestination,extraIndexable} from '../src/brand/seo/routes';
import {count,handleFunnelBeacon,looksAutomated,type FunnelDb} from '../src/brand/seo/funnel';
// Read-only release gate. Retain the original connected application source;
// service and mutation routes must never be invoked by this browsing release.
const families:Record<string,string>={'step-smiles':'little-steps-big-adventures','happy-lines':'happy-lines','polka-dots':'dotty-days','random-dots':'dotty-days','classic-dots':'dotty-days'};
const offline=()=>withOfflineBrowserPolicy(Response.json({available:false,message:'Ordering and live services are unavailable.'},{status:503}));
const redirect=(url:URL,path:string)=>Response.redirect(new URL(path,url.origin).href,302);
/** The visitor's country, from Cloudflare, for the page's market. A country they picked is never replaced. */
function withVisitorCountry(request:Request,response:Response){
 const country=(request as Request&{cf?:{country?:string}}).cf?.country;
 if(!country||!/^[A-Z]{2}$/.test(country)||['XX','T1'].includes(country))return response;
 if(/(?:^|;\s*)zyv_country=/.test(request.headers.get('cookie')??''))return response;
 if(!response.headers.get('Content-Type')?.includes('text/html'))return response;
 const out=new Response(response.body,response);
 out.headers.append('Set-Cookie','zyv_country='+country+'; Path=/; SameSite=Lax; Secure; Max-Age=31536000');
 return out;
}
/** The floor games index shows only the games that can be bought. */
function onlySellableFloorGames(response:Response){
 return new HTMLRewriter().on('a.card',{element(el){const slug=/^\/floor-games\/([a-z0-9-]+)\/?$/.exec(el.getAttribute('href')??'')?.[1];if(slug&&!isSellable(slug))el.remove();}})
  .on('a[href="/india-checkout/"]',{element(el){el.setAttribute('href','/products/hopscotch-peach-pop');el.setInnerContent('See all three colourways');}}).transform(response);
}
async function serve(request:Request,env:unknown,ctx:unknown):Promise<Response>{

 const u=new URL(request.url),p=u.pathname.replace(/\/$/,'')||'/';
 if(u.hostname==='www.mimipip.com'){u.hostname='mimipip.com';return Response.redirect(u.href,301);}
 if(p==='/browse/gender'||p==='/shop/gender')return redirect(u,'/browse/collection');
 if(p==='/robots.txt' && u.hostname!=='mimipip.com') return new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain'}});
 // Shopping feeds and the sitemap are made here, from the catalogue and prices.json; nothing inherited is served.
 if(p==='/feeds/openai-products.jsonl')return openAiFeedResponse(u,request.method);
 // For ChatGPT, Claude, Perplexity and the rest: MimiPip's own facts, never the inherited Zyvorah file.
 if(p==='/llms.txt'&&u.hostname==='mimipip.com')return new Response(request.method==='HEAD'?null:llmsTxt(),{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'}});
 if(p.startsWith('/feeds/')){const feed=Object.hasOwn(FEEDS,p)?FEEDS[p]():null;return feed===null?new Response('Not found',{status:404,headers:{'X-Robots-Tag':'noindex'}}):new Response(request.method==='HEAD'?null:feed,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=3600','X-Robots-Tag':'noindex'}});}
 if(p==='/sitemap.xml'&&u.hostname==='mimipip.com')return new Response(sitemapXml(extraIndexable),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=3600'}});
 if(p==='/api/funnel')return handleFunnelBeacon(request,(env as {DB?:FunnelDb}).DB);
 // A design that cannot be bought is not shown: its address goes to the shop (owner rule, 10 Nov 2026).
 if(['GET','HEAD'].includes(request.method)){const to=hiddenDestination(p);if(to)return new Response(null,{status:302,headers:{Location:new URL(to,u.origin).href,'X-Robots-Tag':'noindex','Cache-Control':'no-store'}});}
 if(p==='/api/sample-order'||p==='/api/sample-order/readiness')return withCheckoutBrowserPolicy(await handleSampleOrder(request,env as CheckoutEnv));
 if(p.startsWith('/api/checkout/')){
  try {return withCheckoutBrowserPolicy(await handleCommerce(request,env as CheckoutEnv));}
  catch{return new Response(JSON.stringify({error:'Checkout is temporarily unavailable.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
 }
 if(p==='/api/signup'||p==='/api/signup/leave')return withOfflineBrowserPolicy(await handleSignup(request,env as Parameters<typeof handleSignup>[1]));
 if(p==='/india-checkout')return redirect(u,'/checkout/');
 if(p==='/checkout' && ['GET','HEAD'].includes(request.method))return withCheckoutBrowserPolicy(await handler.fetch(request,env,ctx));
 const nativeApi=/^\/api\/(consent\/ads$|cart(?:\/|$)|auth(?:\/|$)|account(?:\/|$)|boards(?:\/|$)|wishlist(?:\/|$)|taste(?:\/|$)|market(?:\/|$)|search$|design-search$|products$|visual-search$|concierge(?:\/|$)|curator(?:\/|$)|segment-room$|text-overlay$|brand\/icon)/.test(p);
 if(p==='/api/cart'&&request.method==='POST'){
  // Add to cart, counted where it happens. The body is read from a copy; the cart is untouched.
  const copy=request.clone();const response=await publicPage(request,await handler.fetch(request,env,ctx));
  if(response.ok&&!looksAutomated(request.headers.get('user-agent'))){try{const b=await copy.json() as {productHandle?:unknown};if(typeof b.productHandle==='string')await count((env as {DB?:FunnelDb}).DB,'add_to_cart',[b.productHandle],(request as Request&{cf?:{country?:string}}).cf?.country);}catch{/* a counter never breaks the cart */}}
  return response;
 }
 if(p.startsWith('/api/')&&!nativeApi)return offline();
 if(!['GET','HEAD'].includes(request.method)&&!nativeApi)return offline();
 if(/^\/(admin|studio|corporate|partners)(?:\/|$)/.test(p))return offline();
 if(Object.hasOwn(floorPlay,p))return publicPage(request,onlySellableFloorGames(new Response(request.method==='HEAD'?null:floorPlay[p as keyof typeof floorPlay],{headers:{'Content-Type':'text/html; charset=utf-8'}})));
 if (p === '/products/happy-petals' || p === '/design/happy-petals') return Response.redirect(new URL(legacyPetalsDestination(u.searchParams.get('colourway')),u.origin),301);
 const collectionKey = p === '/browse/collection' ? u.searchParams.get('value') : p === '/shop/collection' ? u.searchParams.get('collection') : null;
 if (p === '/collections/signature-wallpapers' || ['signature-wallpapers','happy-petals'].includes(collectionKey ?? '')) return Response.redirect(new URL('/collections/happy-petals/',u.origin),301);
 const oldDotCollections=['polka-dots','random-dots','classic-dots'];
 if(p==='/browse/collection' && oldDotCollections.includes(u.searchParams.get('value')||''))return Response.redirect(new URL('/collections/dotty-days/',u.origin).href,301);
 if(p==='/shop/collection' && oldDotCollections.includes(u.searchParams.get('collection')||''))return Response.redirect(new URL('/collections/dotty-days/',u.origin).href,301);
 const browseRoutes: Record<string,string> = {
   '/wall-borders':'/browse/collection?value=mimi-borders',
   '/collections/wall-art':'/browse/collection?value=wallpaper-worlds', '/collections':'/browse/collection',
   '/concepts':'/browse/concept', '/rooms':'/browse/space', '/colours':'/browse/color',
   '/lookbook':'/browse/collection', '/new':'/browse/collection'
 };
 if (browseRoutes[p]) return redirect(u,browseRoutes[p]);
 const guideAliases: Record<string,string> = {
   '/print-your-own':'tools',
   '/custom-sizing':'how-to-measure', '/shipping-policy':'shipping-returns', '/refund-policy':'shipping-returns',
   '/where-to-buy':'faq', '/founders-note':'about', '/our-story':'about', '/sustainability':'materials',
   '/bespoke':'tools', '/collaborate':'contact', '/commercial':'contact', '/press':'contact', '/trade':'trade', '/account/trade':'trade', '/account/trade/apply':'trade',
   '/office':'contact', '/hospitality':'contact', '/hospitals':'contact', '/retail':'trade', '/real-estate':'contact',
   '/projects':'contact', '/become-an-installer':'contact'
 };
 const topic = guideAliases[p] || (Object.hasOwn(guides,p.slice(1)) ? p.slice(1) : undefined);
 if (topic) return redirect(u,'/guides/'+topic);
 if(p.startsWith('/design/'))return redirect(u,'/products/'+encodeURIComponent(p.slice(8)));
 if(p==='/shop')return redirect(u,'/browse/collection');
 const facet=/^\/shop\/(collection|color|concept|gender|age|size|space)$/.exec(p);
 if(facet)return redirect(u,'/browse/'+facet[1]+(u.searchParams.has(facet[1])?'?value='+encodeURIComponent(u.searchParams.get(facet[1])!):''));
 const collection=/^\/collections\/([^/]+)(?:\/([^/]+))?$/.exec(p);
 if(collection?.[2]){const item=records.find(r=>'detailURL' in r&&r.detailURL===p+'/');if(item)return redirect(u,'/products/'+item.slug);}
 if(collection&&!collection[2]&&families[collection[1]]&&families[collection[1]]!==collection[1])return redirect(u,'/collections/'+families[collection[1]]);
 return publicPage(request,await handler.fetch(request,env,ctx));
}
export default {async fetch(request:Request,env:unknown,ctx:unknown){return withVisitorCountry(request,await serve(request,env,ctx));},
// Every five minutes: payments the browser never reported, and paid orders the OS has not taken.
async scheduled(_event:unknown,env:unknown){await sweep(env as CheckoutEnv);}
};
