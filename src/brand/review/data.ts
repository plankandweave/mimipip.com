import {pickFlatSource} from './hover';
import panelFlats from './panel-flats.json';
import checkedHover from './hover-images.json';
import records from './catalogue.json';
import type { ProductCardData } from '@/lib/types';
export const axes=['collection','color','concept','age','space'] as const;
export type Axis=typeof axes[number];
export type RecordData=typeof records[number];
export const catalogue=records;
export const options=(axis:Axis)=>axis==='age'?['baby','toddler','preschool','school-age']:[...new Set(records.flatMap(p=>p[axis]??[]))].sort();
export const filter=(axis:Axis,value:string)=>records.filter(p=>!value||(p[axis] as string[]|undefined)?.includes(value));
export const card=(p:RecordData):ProductCardData=>({
  roomPanel: (p as RecordData & {roomPanel?:import("@/components/RoomPanel").RoomPanelBounds}).roomPanel,
  handle:p.slug,
  title:p.name,
  image:p.image,
  imageAlt:p.name+' · '+(p.roomPresentation==='stairs'?'single room preview':'nursery room preview'),
  flatHoverImage: (() => {
    const record = p as RecordData & { flatImage?: string; sourceImages?: string[] };
    const candidate=p.type.includes("wallpaper")?pickFlatSource(record.sourceImages??[]):undefined;
    const reviewed=(checkedHover as Record<string,string>)[p.slug];
    const galleryFlat=p.gallery?.find(image=>image.url.startsWith('/review/') && /(?:^|[-_/])flat(?:[-_.\/]|$)/i.test(image.url))?.url;
    const approvedPanels=p.id==="MP-SS-04"?"/listing-details/beep-beep/design-panels.svg":null;
    const floorFlat=["hopscotch-peach-pop","hopscotch-pastel-play","hopscotch-bold-adventure"].includes(p.slug) ? "/floor-play-images/"+p.slug+"/art.png" : null;
    const recoveredPanel=(panelFlats as Record<string,string>)[p.id];
    const flat=floorFlat??approvedPanels??recoveredPanel??record.flatImage??galleryFlat??(candidate&&reviewed===candidate?"/review/hover-art/"+p.slug+".webp":null);
    return flat !== p.image ? flat : null;
  })(),
  cardImageCrop:p.roomPresentation==='stairs'
    ? {x:1,y:0,columns:2,rows:1}
    : (p as RecordData & {imageLayout?:string}).imageLayout==='diptych'
      ? {x:1,y:0,columns:2,rows:1}
      : (p as RecordData & {imageLayout?:string}).imageLayout==='quad'
        ? {x:1,y:0,columns:2,rows:2}
        : undefined,
  fromPricePerSqft:null,
  cardLabel:label(p.type[0]),
  sampleable:false,
});
export const find=(slug:string)=>records.find(p=>p.slug===slug);
export const label=(s:string)=>s==='dotty-days'?'Dotty Days':s==='colour-create'?'Colour & Create':s.replace(/-/g,' ').replace(/^./,c=>c.toUpperCase());
