/** Public catalogue facts. Never expose production files or customer data. */
import {abs, BRAND, feedImage, isWallpaper, productPath, sellable, type Rec} from './site';
import {feedItems, type FeedMarket} from './feeds';
export function discoveryFacts(r: Rec) {
  const tags = Object.fromEntries(['collection','concept','color','age','space','type','surface'].map(k=>[k,(r as unknown as Record<string,unknown>)[k] ?? []]));
  return {id:r.id,slug:r.slug,name:r.name,description:r.description,brand:BRAND,url:abs(productPath(r.slug)),image:abs(feedImage(r.slug)),tags,
    ...(isWallpaper(r)?{material:'Self-adhesive vinyl',finish:'Smooth',application:'Peel and stick'}:{}),
    ageLabelMeaning:'Room styling guidance, not a safety certification',
    shippingPolicy:abs('/guides/shipping-returns'),installationGuide:abs('/guides/installation'),materialGuide:abs('/guides/materials')};
}
export function discoveryResponse(request: Request): Response {
  const url=new URL(request.url);
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const market:FeedMarket=url.searchParams.get('country')==='US'?'US':'IN';
  const path=url.pathname.replace(/\/$/,'');
  const slug=path.startsWith('/api/agent/product/')?decodeURIComponent(path.slice('/api/agent/product/'.length)):null;
  if(!['/api/agent','/api/agent/search','/api/agent/catalogue'].includes(path)&&!slug)return Response.json({error:'Not found'},{status:404});
  const query=(url.searchParams.get('q')??'').trim().toLowerCase().slice(0,200);
  const items=feedItems(market);
  const products=sellable.filter(r=>(!slug||r.slug===slug)&&(!query||JSON.stringify(discoveryFacts(r)).toLowerCase().includes(query))).map(r=>({...discoveryFacts(r),offers:items.filter(i=>new URL(i.link).pathname===productPath(r.slug)).map(i=>({id:i.id,url:i.link,price:i.price,availability:i.availability,size:i.size,material:i.material,dimensions:i.dimensions,groupId:i.itemGroupId,options:i.variantOptions}))}));
  if(slug&&!products.length)return Response.json({error:'Product not available'},{status:404});
  return new Response(request.method==='HEAD'?null:JSON.stringify({brand:BRAND,country:market,count:products.length,checkout:'Complete your purchase on mimipip.com. Prices and delivery eligibility are checked at checkout.',products}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300','X-Robots-Tag':'noindex'}});
}

export const agentOpenApi = {
 openapi:'3.1.0',info:{title:'MimiPip product discovery',version:'1.0.0',description:'Read-only public product facts and current offers. Complete purchases on mimipip.com.'},servers:[{url:'https://mimipip.com'}],
 paths:Object.fromEntries([
  ['/api/agent/catalogue','listProducts','List all sellable designs and offers',[]],
  ['/api/agent/search','searchProducts','Search public catalogue facts',[{name:'q',in:'query',schema:{type:'string',maxLength:200}}]],
  ['/api/agent/product/{slug}','getProduct','Read one sellable design',[{name:'slug',in:'path',required:true,schema:{type:'string'}}]],
 ].map(([path,operationId,summary,params])=>[path,{get:{operationId,summary,parameters:[...(params as object[]),{name:'country',in:'query',schema:{type:'string',enum:['IN','US'],default:'IN'}}],responses:{'200':{description:'Public catalogue facts and offers',content:{'application/json':{schema:{type:'object'}}}},'404':{description:'No available product'}}}}])),
};
