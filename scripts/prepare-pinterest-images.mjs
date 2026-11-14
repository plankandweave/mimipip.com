// Deterministic whole-frame enlargement: no crop, generated detail or aspect change.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const sourceMapPath = 'src/brand/seo/pinterest-room-image-sources.json';
const sources = JSON.parse(await fs.readFile(sourceMapPath, 'utf8'));
const mapping = {}, manifest = [];
await fs.mkdir('public/pinterest-images/v1', {recursive:true});
for (const [slug,url] of Object.entries(sources)) {
  const local = path.join('public',new URL(url).pathname);
  let bytes;
  try { bytes = await fs.readFile(local); } catch {
    const res = await fetch(url); if(!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
    bytes = Buffer.from(await res.arrayBuffer());
  }
  const source = await sharp(bytes).metadata();
  const scale = Math.max(1000/source.width,1536/source.height,1);
  const width = Math.ceil(source.width*scale), height = Math.ceil(source.height*scale);
  const target = `public/pinterest-images/v1/${slug}.jpg`;
  await sharp(bytes).resize({width,height,fit:'inside',kernel:'lanczos3',withoutEnlargement:false}).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toFile(target);
  const result = await sharp(target).metadata();
  if(result.width<1000 || result.height<1500) throw new Error(`Undersized ${slug}`);
  if(Math.abs(result.width/result.height-source.width/source.height)>0.002) throw new Error(`Aspect changed ${slug}`);
  mapping[slug]=`https://mimipip.com/pinterest-images/v1/${slug}.jpg`;
  manifest.push({slug,source:url,sourceWidth:source.width,sourceHeight:source.height,width:result.width,height:result.height,bytes:result.size});
}
await fs.writeFile('src/brand/seo/pinterest-room-images.json',JSON.stringify(mapping,null,2)+'\n');
await fs.writeFile('src/brand/seo/pinterest-image-manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`${manifest.length} full-frame catalogue copies prepared.`);
