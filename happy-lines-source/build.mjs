import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const source = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(source, '../out');
const products = JSON.parse(fs.readFileSync(path.join(source, 'products.json'), 'utf8'));
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const colors = {Yellow:'#FFD65C',Orange:'#FD8326',Pink:'#FF8BB4',Periwinkle:'#8C93C7',Green:'#B6D693',Ivory:'#fff9ed'};
const base = '/collections/happy-lines/';
const ages = {'nursery':'Nursery · 0–2 years','toddler':'Toddler · 2–3 years','4-6':'Children · 4–6 years','7-10':'Children · 7–10 years'};
const url = p => `${base}${p.slug}/`;
const filterURL = (key, value) => base + '?' + new URLSearchParams({[key]:value});
function shell(title, description, pathname, body, script = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} | MimiPip</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="https://mimipip.com${pathname}"><meta property="og:title" content="${esc(title)} | MimiPip"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="https://mimipip.com${base}images/ribbon-play.png"><link rel="stylesheet" href="${base}style.css"></head><body><a class="skip" href="#main-content">Skip to content</a><div class="notice">COLLECTION PREVIEW · ORDERS ARE NOT OPEN</div><header><a href="/" aria-label="MimiPip home"><img class="logo" src="/brand/mimi-pip/email-wordmark.png" width="2172" height="724" alt="MimiPip"></a><nav aria-label="Main navigation"><a href="/collections/">Collections</a><a href="/nursery/">Nursery</a><a href="/toddler/">Toddler</a><a href="/kids-room-wallpaper/">Children up to 10</a><a href="/contact/">Contact</a></nav></header><main id="main-content">${body}</main><footer><p>MimiPip · Happy little spaces for growing children.</p><p>Collection preview. Ordering, prices and delivery details are not available yet.</p></footer>${script}</body></html>`;
}
function write(route, html) {
  const file = path.join(out, route, 'index.html');
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, html);
}
const chips = p => `<div class="tags" aria-label="Colours">${p.colors.map(color => `<a class="tag" href="${esc(filterURL('color',color))}"><span class="dot" style="background:${colors[color]}" aria-hidden="true"></span>${color}</a>`).join('')}</div>`;
const genderChips = p => `<div class="tags" aria-label="Gender inspiration">${p.gender.map(gender => `<a class="tag" href="${esc(filterURL('gender',gender))}">${gender}</a>`).join('')}</div>`;
const alt = p => `${p.name} wallpaper in a front-view ${p.ageLabel.toLowerCase()} room`;
const card = p => `<article class="card" data-design="${p.slug}"><a class="image-link" href="${url(p)}" aria-label="View ${esc(p.name)}"><img src="${p.image}" width="1448" height="1086" loading="lazy" alt="${esc(alt(p))}"></a><p class="age">${esc(p.ageLabel)}</p><h3><a href="${url(p)}">${esc(p.name)}</a></h3>${chips(p)}<p class="fine">Boys · Girls · Gender-neutral</p><a href="${url(p)}">Explore the design ↗</a></article>`;
const palette = `<div class="palette" aria-label="Collection palette">${Object.entries(colors).map(([name,color])=>`<span class="dot" style="background:${color}" title="${name}"></span>`).join('')}</div>`;
const scaleNote = `<aside class="note"><strong>A note on the room previews.</strong> These are illustrative front-view renders, not photographs of installed wallpaper. Pattern scale and colour can vary in the previews; the final repeat and a colour proof need to be confirmed before printing. Furniture is shown for styling only.</aside>`;
const select = (name,label,options) => `<label>${label}<select name="${name}"><option value="">All ${name==='age'?'ages':name==='gender'?'gender tags':'colours'}</option>${options.map(([value,text])=>`<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select></label>`;
const collectionBody = `<section class="hero"><p class="eyebrow">MimiPip wallpaper collection</p><h1>Happy Lines</h1><p class="intro">Little checks. Sunny stripes. Rooms to grow in.<br>Eleven playful painted patterns for nurseries, toddlers and children up to ten.</p>${palette}</section><form class="filters" id="filters" aria-label="Filter Happy Lines">${select('age','Age of the room shown',Object.entries(ages))}${select('gender','Browse by gender',['Boys','Girls','Gender-neutral'].map(x=>[x,x]))}${select('color','Wallpaper colour',Object.keys(colors).map(x=>[x,x]))}<button type="button" id="clear-filters">Clear filters</button></form><div class="results-header"><p id="result-count" role="status" aria-live="polite">11 of 11 designs</p><p class="fine">Every pattern is suitable inspiration for any child. Age filters match the room shown.</p></div><div class="grid">${products.map(card).join('')}</div><p id="no-results" class="empty" hidden>No designs match these filters. Clear filters to see the full collection.</p>${scaleNote}`;
write('collections/happy-lines',shell('Happy Lines wallpaper collection','Eleven painted stripes and checks, shown in front-view nursery, toddler and children’s rooms up to age ten.',base,collectionBody,`<script id="collection-data" type="application/json">${JSON.stringify(products).replaceAll('<','\\u003c')}</script><script type="module" src="${base}collection.js"></script>`));
for(const p of products) {
  const related = products.filter(x=>x.slug!==p.slug&&x.age===p.age).slice(0,2);
  const body = `<p class="breadcrumbs"><a href="/collections/">Collections</a> / <a href="${base}">Happy Lines</a> / ${esc(p.name)}</p><section class="detail-head"><p class="eyebrow">Happy Lines · Wallpaper design preview</p><h1>${esc(p.name)}</h1><p>${esc(p.description)}</p></section><a href="${p.image}" aria-label="Open full-size ${esc(p.name)} room render"><img class="room-image" src="${p.image}" width="1448" height="1086" alt="${esc(alt(p))}"></a><div class="detail-info"><section><h2>A room for little moments.</h2><p>Shown as: <strong>${esc(p.ageLabel)}</strong>.</p><p>${p.age==='nursery'?'A calm nursery setting with a clear crib and soft, simple furnishings.':p.age==='toddler'?'Low furniture, picture books and space for a toddler’s daily discoveries.':p.age==='4-6'?'A young child’s room for stories, play and winding down.':'A children’s room for ages seven to ten, with space to learn, play and grow.'}</p><a class="button" href="${filterURL('age',p.age)}">More rooms in this age group</a></section><section><h2>Find their colours.</h2>${chips(p)}${genderChips(p)}<p class="fine">Gender tags are browsing choices; these geometric patterns can work for any child.</p></section></div>${scaleNote}<div class="more"><a href="${base}">← All Happy Lines designs</a></div>${related.length?`<h2>More for this age</h2><div class="grid">${related.map(card).join('')}</div>`:''}`;
  write(`collections/happy-lines/${p.slug}`,shell(p.name+' wallpaper',p.description,url(p),body));
}
const ribbon = products.find(p=>p.slug==='ribbon-play');
function landing(route,title,intro,items) {
  const body = `<section class="hero"><p class="eyebrow">MimiPip · Collection preview</p><h1>${title}</h1><p class="intro">${intro}</p></section><section class="feature"><a href="${base}"><img src="${items[0].image}" width="1448" height="1086" alt="${esc(alt(items[0]))}"></a><div class="feature-copy"><p class="eyebrow">New collection</p><h2>Happy Lines</h2><p>Painted stripes, cheerful checks and warm ivory space. Eleven designs, shown in rooms from nursery through age ten.</p><a class="button" href="${base}">Explore Happy Lines ↗</a></div></section>${items.length>1?`<div class="grid">${items.map(card).join('')}</div>`:''}<div class="stage-links"><a href="/nursery/">Nursery</a><a href="/toddler/">Toddler</a><a href="/kids-room-wallpaper/">Children up to 10</a></div>${scaleNote}`;
  write(route,shell(title,'Explore MimiPip Happy Lines wallpaper room previews.',route?`/${route}/`:'/',body));
}
landing('collections','Our collections.','Wallpaper stories for little rooms, from the first days to age ten.',[ribbon]);
landing('nursery','For little beginnings.','Happy Lines in nursery rooms for ages 0–2.',products.filter(p=>p.age==='nursery'));
landing('toddler','For growing imaginations.','Playful wallpaper in toddler rooms for ages 2–3.',products.filter(p=>p.age==='toddler'));
landing('kids-room-wallpaper','Room to be themselves.','Bedroom and play-space inspiration for children aged 4–10.',products.filter(p=>['4-6','7-10'].includes(p.age)));
landing('kids-wallpaper','Wallpaper for little worlds.','Explore Happy Lines from nursery through age ten.',[ribbon]);
const target = path.join(out,'collections/happy-lines');
for(const name of ['style.css','collection.js','products.json']) fs.copyFileSync(path.join(source,name),path.join(target,name));
fs.cpSync(path.join(source,'images'),path.join(target,'images'),{recursive:true});
console.log(`Built Happy Lines: ${products.length} designs, 11 detail pages, collection and five discovery pages. Ordering stays closed.`);
