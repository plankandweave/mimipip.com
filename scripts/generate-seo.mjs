import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const dist = path.join(root, 'dist');
const source = JSON.parse(fs.readFileSync(path.join(root, 'catalogue-zyvorah-copy.json'), 'utf8'));
const supplement = fs.readFileSync(path.join(root, 'nafas', 'supplement.js'), 'utf8');
const supplementMatch = supplement.match(/=\s*(\[[\s\S]*\]);?\s*$/);
const supplemental = supplementMatch ? Function(`"use strict";return (${supplementMatch[1]})`)() : [];
const products = [...source.products, ...supplemental].filter(p => p.category === 'wallpaper');

const escape = value => String(value ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const plain = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const url = value => `https://mimipip.com${value}`;
const image = p => p.images?.find(i => !i.is_flat && i.scene_key === 'playroom')?.url || p.images?.find(i => !i.is_flat)?.url || p.images?.[0]?.url || '';
const tags = p => (p.tags || []).filter(t => !['Child-Safe','Kids','Wallpaper'].includes(t)).slice(0, 10);

const winterHandles = new Set(['moonlit-winter-garden','the-crystal-orchard','swan-lake-at-dawn','cloud-observatory','snowlight-meadow','aurora-garden','alpine-slopes','starlight-meadow']);
const heroHandles = new Set(['city-secret-city-painted','city-rooftop-dispatch-painted','city-secret-city-graphic','city-rooftop-dispatch-graphic','city-midnight-metropolis','dappled-ascent','track-bloom','backyard-games']);

const style = `:root{--orange:#b45d36;--ink:#342b25;--paper:#fffaf0;--line:#ead8c9}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.65 system-ui,sans-serif}header,main,footer{max-width:1120px;margin:auto;padding:22px 5vw}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)}header a{color:var(--orange);text-decoration:none}.hero{padding:68px 0 36px}.hero h1{font-size:clamp(38px,6vw,68px);line-height:1.04;margin:.2em 0}.eyebrow,.tag{color:var(--orange);font-weight:700}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}.card{background:white;border:1px solid var(--line);border-radius:16px;overflow:hidden}.card img{width:100%;aspect-ratio:4/3;object-fit:cover}.card div{padding:18px}.card a,.cta{color:var(--orange);font-weight:700}.product{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:42px;align-items:start}.product>img{width:100%;border-radius:18px}.tags{display:flex;gap:8px;flex-wrap:wrap}.tag{padding:5px 9px;border:1px solid var(--line);border-radius:99px;font-size:13px}.note{padding:18px;border-left:4px solid var(--orange);background:white}.breadcrumbs{font-size:14px}.breadcrumbs a{color:var(--orange)}footer{border-top:1px solid var(--line);margin-top:60px}@media(max-width:720px){.product{grid-template-columns:1fr}}`;

function page({title, description, canonical, body, schema}) {
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:type" content="website"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script><style>${style}</style><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/assets/refined-type.css"><script defer src="/analytics.js?v=20261030-2"></script></head><body><header><a href="/">MimiPip</a><nav><a href="/kids-wallpaper/">Kids’ wallpaper</a></nav></header><main>${body}</main><footer>MimiPip · Children’s wallpaper for little worlds · <a href="mailto:hello@mimipip.com">hello@mimipip.com</a></footer></body></html>`;
}

function write(relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, content);
  const out = path.join(dist, relative);
  fs.mkdirSync(path.dirname(out), {recursive:true});
  fs.writeFileSync(out, content);
}

function cards(list) {
  return `<div class="grid">${list.map(p => `<article class="card"><img loading="lazy" src="${escape(image(p))}" alt="${escape(p.images?.find(i=>i.url===image(p))?.alt || `${p.title} kids wallpaper`)}"><div><h2>${escape(p.title)}</h2><p>${escape(plain(p.description).slice(0,170))}</p><a href="/products/${encodeURIComponent(p.handle)}/">View wallpaper details</a></div></article>`).join('')}</div>`;
}

const categoryPages = [
  {slug:'kids-wallpaper', title:'Kids’ Wallpaper for Bedrooms & Playrooms | MimiPip', heading:'Kids’ wallpaper for their whole world', description:'Explore children’s wallpaper for nurseries, kids’ bedrooms and playrooms. Browse 176 designs by colour, age, interest and room story.', intro:'Choose children’s wallpaper by colour, age and the stories they love. MimiPip brings together playful landscapes, animals, gardens, cities, sport and imaginative scenes for kids’ bedrooms and playrooms.', list:products},
  {slug:'kids-room-wallpaper', title:'Kids’ Room Wallpaper & Children’s Wall Murals | MimiPip', heading:'Kids’ room wallpaper and wall murals', description:'Shop kids’ room wallpaper and children’s wall murals for bedrooms, nurseries and playrooms, with playful scenes and colour-led collections.', intro:'Find wallpaper for a child’s room, from calm nursery scenes to bold playroom murals. Every design has its own crawlable product page so families can discover the right scene directly from Google.', list:products.filter(p => (p.tags||[]).some(t => /Bedroom|Nursery|Playroom|Play School|Kids' Play Space/i.test(t))).slice(0,48)},
  {slug:'winter-wonder-wallpaper', title:'Winter Wonderland Kids’ Wallpaper | Frozen-Style Alternatives | MimiPip', heading:'Winter wonderland wallpaper for kids’ rooms', description:'Explore icy gardens, snowy meadows, crystal orchards and aurora skies—original winter wallpaper alternatives for Frozen-style room searches, without licensed characters.', intro:'Looking for Disney Frozen wallpaper or an icy princess-room mood? These are original MimiPip winter scenes with snow, crystal gardens, aurora colours and moonlit skies. They do not feature Disney characters and are not Disney merchandise.', list:products.filter(p => winterHandles.has(p.handle))},
  {slug:'superhero-adventure-wallpaper', title:'Superhero Adventure Kids’ Wallpaper | Spider-Man-Style Alternatives | MimiPip', heading:'City, climbing and superhero-style adventure wallpaper', description:'Explore city rooftops, climbing, movement and adventure scenes for superhero-style kids’ rooms—original alternatives to Spider-Man wallpaper without licensed characters.', intro:'Looking for Spider-Man wallpaper or a superhero room feeling? Explore original city, rooftop, climbing, sport and movement scenes. These designs do not feature Spider-Man or Marvel characters and are not licensed Marvel merchandise.', list:products.filter(p => heroHandles.has(p.handle))}
];

for (const c of categoryPages) {
  const canonical = url(`/${c.slug}/`);
  const schema = {'@context':'https://schema.org','@type':'CollectionPage',name:c.heading,description:c.description,url:canonical,mainEntity:{'@type':'ItemList',itemListElement:c.list.map((p,i)=>({'@type':'ListItem',position:i+1,url:url(`/products/${p.handle}/`),name:p.title}))}};
  const body = `<div class="breadcrumbs"><a href="/">Home</a> / ${escape(c.heading)}</div><section class="hero"><p class="eyebrow">MIMIPIP CHILDREN’S WALLPAPER</p><h1>${escape(c.heading)}</h1><p>${escape(c.intro)}</p></section>${cards(c.list)}`;
  write(`${c.slug}/index.html`, page({title:c.title,description:c.description,canonical,body,schema}));
}

for (const p of products) {
  const canonical = url(`/products/${p.handle}/`);
  const isWinter = winterHandles.has(p.handle), isHero = heroHandles.has(p.handle);
  const intent = isWinter ? `<aside class="note"><strong>Winter-room search note:</strong> This original design is a character-free alternative for families searching for Disney Frozen wallpaper or a winter wonderland room. It is not Disney merchandise.</aside>` : isHero ? `<aside class="note"><strong>Adventure-room search note:</strong> This original scene is a character-free alternative for families searching for Spider-Man wallpaper or a superhero city room. It is not Marvel merchandise.</aside>` : '';
  const desc = `${p.title} children’s wallpaper for kids’ bedrooms and playrooms. ${plain(p.description).slice(0,115)}`;
  const schema = {'@context':'https://schema.org','@type':'Product',name:p.title,description:plain(p.description),image:(p.images||[]).map(i=>i.url),sku:p.handle,category:'Kids wallpaper',brand:{'@type':'Brand',name:'MimiPip'},url:canonical};
  const body = `<div class="breadcrumbs"><a href="/">Home</a> / <a href="/kids-wallpaper/">Kids’ wallpaper</a> / ${escape(p.title)}</div><section class="hero product"><img src="${escape(image(p))}" alt="${escape(p.images?.find(i=>i.url===image(p))?.alt || `${p.title} kids room wallpaper`)}"><div><p class="eyebrow">KIDS’ WALLPAPER</p><h1>${escape(p.title)}</h1><p>${escape(plain(p.description))}</p><div class="tags">${tags(p).map(t=>`<span class="tag">${escape(t)}</span>`).join('')}</div><p><a class="cta" href="/?product=${encodeURIComponent(p.handle)}#shop">Preview this design on MimiPip</a></p>${intent}</div></section>`;
  write(`products/${p.handle}/index.html`, page({title:`${p.title} Kids’ Wallpaper | MimiPip`,description:desc,canonical,body,schema}));
}

const today = new Date().toISOString().slice(0,10);
const urls = ['/', '/nafas/', '/floor-games/', ...categoryPages.map(c=>`/${c.slug}/`), ...products.map(p=>`/products/${p.handle}/`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u=>`  <url><loc>${url(u)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
write('sitemap.xml', sitemap);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: https://mimipip.com/sitemap.xml\n`);
write('google5db7ca6dfe84d05a.html', 'google-site-verification: google5db7ca6dfe84d05a.html\n');

console.log(`Generated ${products.length} product pages, ${categoryPages.length} landing pages and ${urls.length} sitemap URLs.`);
