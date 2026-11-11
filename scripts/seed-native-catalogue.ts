/** Generates an isolated Mimi Pip seed; does not execute SQL or copy customer data. */
import { writeFileSync } from 'node:fs';
import records from '../src/brand/review/catalogue.json';
import { card, label } from '../src/brand/review/data';
import { MIMIPIP_PRICING } from '../src/brand/pricing-policy';
import { sellableAnywhere } from '../src/brand/commerce/sale';
import printMap from '../src/brand/commerce/print-map.json';
const q=(s:unknown)=>s==null?'NULL':"'"+String(s).replaceAll("'","''")+"'";
const sql:string[]=['BEGIN;','SET LOCAL search_path = mimipip, mimipip_private, extensions, pg_temp;'];
sql.push("INSERT INTO mimipip.price_tiers(slug,label) VALUES ('standard','Standard') ON CONFLICT DO NOTHING;");
sql.push("INSERT INTO mimipip.print_product_types(slug,title) VALUES ('wallpaper','Wallpaper') ON CONFLICT DO NOTHING;");
sql.push("INSERT INTO mimipip.product_categories(slug,title,pricing_unit,browse_tag,measurement_type,supports_custom_size,supports_fixed_sizes,supports_visualiser,supports_materials,supports_samples,print_type,collection_handle,card_label) VALUES ('wallpaper','Wallpaper','sqft','Wallpapers','area',true,false,true,true,false,'wallpaper','wallpaper-worlds','Sized to your wall') ON CONFLICT DO NOTHING;");
for(const [slug,name,roll] of [['smooth-matt','Smooth matte surface',1360],['linen-touch','Linen feel',1360],['self-adhesive-vinyl','Smooth Self-Adhesive',1194]] as const){
 sql.push(`INSERT INTO mimipip.materials(slug,name,default_price_per_sqft,roll_width_mm,active,coming_soon) VALUES (${q(slug)},${q(name)},${MIMIPIP_PRICING.sellingInrPerSqFt},${roll},true,false) ON CONFLICT (slug) DO NOTHING;`);
}
const walls=records.filter(p=>p.type.includes('wallpaper'));
for(const h of new Set(walls.flatMap(p=>p.collection))){sql.push(`INSERT INTO mimipip.collections(handle,title,kind,rule_tag,category_scope) VALUES (${q(h)},${q(label(h))},'curated',${q('Collection:'+h)},'wallpaper') ON CONFLICT(handle) DO NOTHING;`);}
for(const p of walls){
 const flat=(p as typeof p & {flatImage?:string}).flatImage ?? card(p).flatHoverImage;
 if(!flat)throw Error('Missing flat: '+p.slug);
 const art=(printMap as Record<string,{materialSlug?:string}>)[p.slug];
 const material=art?.materialSlug??'smooth-matt';
 sql.push(`INSERT INTO mimipip.products(handle,title,description,status,vendor,category,price_tier,flat_verified) VALUES (${q(p.slug)},${q(p.name)},${q(p.description)},'draft','Mimi Pip','wallpaper','standard',true) ON CONFLICT(handle) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description;`);
 sql.push(`UPDATE mimipip.product_images SET is_flat=false WHERE product_id=(SELECT id FROM mimipip.products WHERE handle=${q(p.slug)});`);
 const images=[...(p.gallery??[{url:p.image,alt:p.name}]).filter(x=>x.url!==flat),{url:flat,alt:p.name+' artwork'}];
 for(const [i,g] of images.entries())sql.push(`INSERT INTO mimipip.product_images(product_id,url,alt,position,is_featured,is_flat) SELECT id,${q(g.url)},${q(g.alt)},${i},${i===0},${g.url===flat} FROM mimipip.products WHERE handle=${q(p.slug)} AND NOT EXISTS(SELECT 1 FROM mimipip.product_images i WHERE i.product_id=products.id AND i.url=${q(g.url)});`);
 sql.push(`INSERT INTO mimipip.product_materials(product_id,material_id,price_per_sqft,available) SELECT p.id,m.id,${MIMIPIP_PRICING.sellingInrPerSqFt},${sellableAnywhere(p.slug)} FROM mimipip.products p CROSS JOIN mimipip.materials m WHERE p.handle=${q(p.slug)} AND m.slug=${q(material)} ON CONFLICT(product_id,material_id) DO UPDATE SET price_per_sqft=EXCLUDED.price_per_sqft,available=EXCLUDED.available;`);
 sql.push(`UPDATE mimipip.product_images SET is_flat=true WHERE product_id=(SELECT id FROM mimipip.products WHERE handle=${q(p.slug)}) AND url=${q(flat)};`);
 sql.push(`UPDATE mimipip.product_materials SET available=false WHERE product_id=(SELECT id FROM mimipip.products WHERE handle=${q(p.slug)}) AND material_id<>(SELECT id FROM mimipip.materials WHERE slug=${q(material)});`);
 const tags=['Wallpapers','Kids',...p.collection.map(h=>'Collection:'+h),...p.color.map(label),...p.concept.map(label),...p.space.map(label)];
 for(const tag of new Set(tags))sql.push(`INSERT INTO mimipip.product_tags(product_id,tag) SELECT id,${q(tag)} FROM mimipip.products WHERE handle=${q(p.slug)} ON CONFLICT DO NOTHING;`);
 sql.push(`UPDATE mimipip.products SET status='active' WHERE handle=${q(p.slug)} AND status='draft';`);
}
sql.push('COMMIT;');
writeFileSync(process.argv[2] ?? '/tmp/mimipip-catalogue-seed.sql',sql.join('\n')+'\n');
console.log(JSON.stringify({wallpapers:walls.length,statements:sql.length,execution:false}));
