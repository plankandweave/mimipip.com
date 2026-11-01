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
 if(!['GET','HEAD'].includes(request.method))return offline();
 if(p.startsWith('/api/')&&!['/api/search','/api/products','/api/brand/icon.svg','/api/brand/icon-180.png'].includes(p))return offline();
 if(p.startsWith('/design/'))return redirect(u,'/products/'+encodeURIComponent(p.slice(8)));
 if(p==='/shop')return redirect(u,'/browse/collection');
 const facet=/^\/shop\/(collection|color|concept|gender|age|space)$/.exec(p);
 if(facet)return redirect(u,'/browse/'+facet[1]+(u.searchParams.has(facet[1])?'?value='+encodeURIComponent(u.searchParams.get(facet[1])!):''));
 const collection=/^\/collections\/([^/]+)(?:\/([^/]+))?$/.exec(p);
 if(collection?.[2]){const item=records.find(r=>'detailURL' in r&&r.detailURL===p+'/');if(item)return redirect(u,'/products/'+item.slug);}
 if(collection&&!collection[2]&&families[collection[1]]&&families[collection[1]]!==collection[1])return redirect(u,'/collections/'+families[collection[1]]);
 return withOfflineBrowserPolicy(await handler.fetch(request,env,ctx));
}};
