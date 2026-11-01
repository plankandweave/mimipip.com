import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const products=JSON.parse(fs.readFileSync(path.join(root,'happy-lines-source/products.json')));
const ages={nursery:'baby',toddler:'toddler','4-6':'preschool','7-10':'school-age'};
const records=products.map((p,i)=>({
  id:`MP-HL${String(i+1).padStart(2,'0')}`,slug:'happy-lines-'+p.slug,name:p.name,
  description:p.description+' Room shown: '+p.ageLabel+'. '+p.scaleStatus,
  collection:['happy-lines'],concept:['pattern'],color:p.colors.map(c=>c==='Ivory'?'neutral':c.toLowerCase()),
  gender:['boys','girls','neutral'],age:[ages[p.age]],ageMin:p.ageMin,ageMax:p.ageMax,
  space:p.age==='nursery'?['nursery']:p.slug==='candy-weave'?['playroom']:p.slug==='confetti-rail'?['study']:p.slug==='garden-steps'?['bedroom','shared']:['bedroom'],
  type:['wallpaper'],surface:['wall'],measurementType:'made-to-measure',widthCm:null,heightCm:null,
  image:p.image,imageRole:`Illustrative front-view render · ${p.ageLabel} · repeat scale not print-verified`,
  source:'MimiPip Happy Lines original design concepts',status:'Design preview · repeat and colour proofing pending',
  price:null,personalization:null,collectionURL:'/collections/happy-lines/',detailURL:`/collections/happy-lines/${p.slug}/`
}));
for(const relative of ['out/catalogue.json','mimipip-catalogue-source.json']){
  const file=path.join(root,relative),data=JSON.parse(fs.readFileSync(file));
  data.products=[...data.products.filter(p=>!p.collection.includes('happy-lines')),...records];
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
}
const discoveryFile=path.join(root,'out/discovery.mjs');let discovery=fs.readFileSync(discoveryFile,'utf8');
if(!discovery.includes("'happy-lines':'Happy Lines'"))discovery=discovery.replace("values:{'wallpaper-worlds'","values:{'happy-lines':'Happy Lines','wallpaper-worlds'");
if(!discovery.includes("periwinkle:'Periwinkle'"))discovery=discovery.replace("blue:'Blue'","blue:'Blue',periwinkle:'Periwinkle'");
fs.writeFileSync(discoveryFile,discovery);
const appFile=path.join(root,'out/app.mjs');let app=fs.readFileSync(appFile,'utf8');
if(!app.includes("periwinkle:'#8C93C7'"))app=app.replace("blue:'#99cfe5'","blue:'#99cfe5',periwinkle:'#8C93C7'");
if(!app.includes("title:'Meet Happy Lines.'"))app=app.replace('const heroSlides=[',`const heroSlides=[\n {title:'Meet Happy Lines.',copy:'Painted stripes and cheerful checks for nurseries, toddlers and children up to ten.',image:'/collections/happy-lines/images/ribbon-play.png',alt:'Ribbon Play wallpaper in a front-view bedroom for a child aged four to six',label:'Explore Happy Lines',href:'/collections/happy-lines/'},`);
// Allow ordinary navigation to the static collection pages; the existing SPA handles shop/design only.
app=app.replace("if(!a||e.metaKey||e.ctrlKey||e.shiftKey||a.hash||a.origin!==location.origin)return;", "if(!a||e.metaKey||e.ctrlKey||e.shiftKey||a.hash||a.origin!==location.origin||a.pathname.startsWith('/collections/happy-lines/'))return;");
if(!app.includes('View the Happy Lines room'))app=app.replace('<h3>Explore related ideas</h3>', '${p.detailURL?`<p><a href="${esc(p.detailURL)}">View the Happy Lines room ↗</a></p>`:""}<h3>Explore related ideas</h3>');
fs.writeFileSync(appFile,app);
const template=fs.readFileSync(path.join(root,'out/index.html'),'utf8');
for(const p of records){const dir=path.join(root,'out/design',p.slug);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'index.html'),template);}
console.log(`Integrated ${records.length} Happy Lines designs into existing storefront facets, hero and design routes.`);
