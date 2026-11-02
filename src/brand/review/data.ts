import records from './catalogue.json';
import type { ProductCardData } from '@/lib/types';
export const axes=['collection','color','concept','gender','age','space'] as const;
export type Axis=typeof axes[number];
export type RecordData=typeof records[number];
export const catalogue=records;
export const options=(axis:Axis)=>axis==='gender'?[]:axis==='age'?['baby','toddler','preschool','school-age']:[...new Set(records.flatMap(p=>p[axis]??[]))].sort();
export const filter=(axis:Axis,value:string)=>records.filter(p=>!value||axis==='gender'||(p[axis] as string[]|undefined)?.includes(value));
export const card=(p:RecordData):ProductCardData=>({
  handle:p.slug,
  title:p.name,
  image:p.image,
  imageAlt:p.name+' · '+(p.roomPresentation==='stairs'?'single room preview':'nursery room preview'),
  flatHoverImage: (() => {
    const record = p as RecordData & { flatImage?: string; sourceImages?: string[] };
    const sourceImages = record.sourceImages ?? [];
    // Catalogue sourceImages preserve upload order, not image role. The first
    // UUID-named file can be another room render (as it is for kd-008), while
    // the final UUID file is the flat artwork. Prefer explicit flat filenames,
    // then the original studio upload, then the last non-scene candidate.
    const sourceFlat = p.type?.includes('wallpaper')
      ? sourceImages.find((url) => /(?:^|\/)flat(?:[-_.\/]|$)/i.test(url))
        ?? [...sourceImages].reverse().find((url) => /\/studio-uploads\//i.test(url))
        ?? [...sourceImages].reverse().find((url) => !/(?:^|[\/_-])(?:scene|room|render|closeup|detail|playroom|kidsroom|bedroom|nursery)(?:[-_.\/]|$)/i.test(url))
      : undefined;
    const flat = record.flatImage ?? sourceFlat ?? null;
    return flat !== p.image ? flat : null;
  })(),
  cardImageCrop:p.roomPresentation==='stairs'
    ? {x:1,y:0,columns:2,rows:1}
    : p.imageLayout==='diptych'
      ? {x:1,y:0,columns:2,rows:1}
      : p.imageLayout==='quad'
        ? {x:1,y:0,columns:2,rows:2}
        : undefined,
  fromPricePerSqft:null,
  cardLabel:'Design preview · ordering unavailable',
  sampleable:false,
});
export const find=(slug:string)=>records.find(p=>p.slug===slug);
export const label=(s:string)=>s==='colour-create'?'Colour & Create':s.replace(/-/g,' ').replace(/^./,c=>c.toUpperCase());
