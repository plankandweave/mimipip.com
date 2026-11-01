import {handleCommerce} from '../src/brand/commerce/checkout';
import {razorpayTransport,withCheckoutBrowserPolicy} from '../src/brand/network-policy';
import { guides } from '../src/brand/review/guides';
import handler from 'vinext/server/fetch-handler';
import {installOfflineFetchBoundary,withOfflineBrowserPolicy} from '../src/brand/network-policy';
import records from '../src/brand/review/catalogue.json';
// Read-only release gate. Retain the original connected application source;
// service and mutation routes must never be invoked by this browsing release.
const families:Record<string,string>={'step-smiles':'little-steps-big-adventures','happy-lines':'happy-lines','polka-dots':'polka-dots'};
const offline=()=>withOfflineBrowserPolicy(Response.json({available:false,message:'Ordering and live services are unavailable.'},{status:503}));
const redirect=(url:URL,path:string)=>Response.redirect(new URL(path,url.origin).href,302);
export default {async fetch(request:Request,env:unknown,ctx:unknown){
 installOfflineFetchBoundary();
 const u=new URL(request.url),p=u.pathname.replace(/\/$/,'')||'/';
 if(p.startsWith('/api/india-checkout/'))return withCheckoutBrowserPolicy(await handleCommerce(request,env as Parameters<typeof handleCommerce>[1],razorpayTransport));
 if(p==='/india-checkout' && ['GET','HEAD'].includes(request.method))return withCheckoutBrowserPolicy(await handler.fetch(request,env,ctx));
 if(!['GET','HEAD'].includes(request.method))return offline();
 if(p.startsWith('/api/')&&!['/api/search','/api/products','/api/brand/icon.svg','/api/brand/icon-180.png'].includes(p))return offline();
 const browseRoutes: Record<string,string> = {
   '/collections/wall-art':'/browse/collection?value=wallpaper-worlds', '/collections':'/browse/collection',
   '/concepts':'/browse/concept', '/rooms':'/browse/space', '/colours':'/browse/color',
   '/lookbook':'/browse/collection', '/new':'/browse/collection', '/design-with':'/search'
 };
 if (browseRoutes[p]) return redirect(u,browseRoutes[p]);
 const guideAliases: Record<string,string> = {
   '/print-your-own':'tools', '/match-a-photo':'tools', '/see-it-in-my-room':'tools', '/samples':'tools',
   '/custom-sizing':'how-to-measure', '/shipping-policy':'shipping-returns', '/refund-policy':'shipping-returns',
   '/where-to-buy':'faq', '/founders-note':'about', '/our-story':'about', '/sustainability':'materials',
   '/bespoke':'tools', '/collaborate':'contact', '/commercial':'contact', '/press':'contact', '/trade':'contact',
   '/office':'contact', '/hospitality':'contact', '/hospitals':'contact', '/retail':'contact', '/real-estate':'contact',
   '/projects':'contact', '/become-an-installer':'contact'
 };
 const topic = guideAliases[p] || (Object.hasOwn(guides,p.slice(1)) ? p.slice(1) : undefined);
 if (topic) return redirect(u,'/guides/'+topic);
 if (p === '/sitemap.xml') {
   const paths = ['/', '/in-real-homes/', ...['collection','color','concept','gender','age','space'].map(axis=>'/browse/'+axis),
     ...Object.keys(guides).map(key=>'/guides/'+key), ...records.map(product=>'/products/'+encodeURIComponent(product.slug))];
   const xml = paths.map(path=>'<url><loc>https://mimipip.com'+path+'</loc></url>').join('');
   return new Response('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+xml+'</urlset>', {headers:{'Content-Type':'application/xml'}});
 }
 if(p.startsWith('/design/'))return redirect(u,'/products/'+encodeURIComponent(p.slice(8)));
 if(p==='/shop')return redirect(u,'/browse/collection');
 const facet=/^\/shop\/(collection|color|concept|gender|age|space)$/.exec(p);
 if(facet)return redirect(u,'/browse/'+facet[1]+(u.searchParams.has(facet[1])?'?value='+encodeURIComponent(u.searchParams.get(facet[1])!):''));
 const collection=/^\/collections\/([^/]+)(?:\/([^/]+))?$/.exec(p);
 if(collection?.[2]){const item=records.find(r=>'detailURL' in r&&r.detailURL===p+'/');if(item)return redirect(u,'/products/'+item.slug);}
 if(collection&&!collection[2]&&families[collection[1]]&&families[collection[1]]!==collection[1])return redirect(u,'/collections/'+families[collection[1]]);
 return withOfflineBrowserPolicy(await handler.fetch(request,env,ctx));
}};
