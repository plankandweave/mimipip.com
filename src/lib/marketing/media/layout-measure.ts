import {SERIF_DISPLAY,SANS_TEXT} from "./brand";
import sharp from "sharp";
import type {LayoutFrame,Rect} from "../layout-check";
import {frameChecks} from "../layout-check";
/** Measures the actual rasterised overlay, not the enclosing SVG canvas. */
export async function alphaBounds(input:Buffer):Promise<Rect>{
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let x=info.width,y=info.height,r=-1,b=-1;
 for(let j=0;j<info.height;j++)for(let i=0;i<info.width;i++)if(data[(j*info.width+i)*info.channels+info.channels-1]>16){x=Math.min(x,i);y=Math.min(y,j);r=Math.max(r,i);b=Math.max(b,j);}
 if(r<0)throw Error("Brand overlay is empty");
 return {x,y,width:r-x+1,height:b-y+1};
}
export async function measureLayout(input:{surface:LayoutFrame["surface"];width:number;height:number;logo:Buffer;text:Buffer;logoLeft:number;logoTop:number;textSvg:string;textTop?:number}):Promise<LayoutFrame>{
 const lb=await alphaBounds(input.logo),raw=await alphaBounds(input.text);
 // A reel cover draws the feed's text block 285 px down (reelCoverLayout);
 // every text coordinate moves with it.
 const dy=input.textTop??0,tb={...raw,y:raw.y+dy};
 const coords=[...input.textSvg.matchAll(/<(?:text|tspan)[^>]*\bx="([\d.]+)"[^>]*\by="([\d.]+)"/g)].map(m=>({x:Number(m[1]),y:Number(m[2])+dy}));
 if(!coords.length)throw Error("Text anchors missing from layout");
 const frame:LayoutFrame={surface:input.surface,width:input.width,height:input.height,logo:{...lb,x:lb.x+input.logoLeft,y:lb.y+input.logoTop},text:tb,textLeft:Math.min(...coords.map(c=>c.x)),titleFoot:Math.max(...coords.map(c=>c.y)),fonts:input.textSvg.includes(SERIF_DISPLAY) && input.textSvg.includes(SANS_TEXT) && !([...input.textSvg.matchAll(/font-family=\x22([^\x22]+)\x22/g)].some(m=>![SANS_TEXT,SERIF_DISPLAY].includes(m[1]))),solidText:!/(?:stroke-width|filter)=/.test(input.textSvg)};
 const failed=frameChecks(frame).filter(c=>!c.ok);
 if(failed.length)throw Error(`Layout refuses render: ${failed.map(c=>c.label).join(", ")} ${JSON.stringify(frame)}`);
 return frame;
}

/** Audit the same brand primitives used by composeStill, using resolved fonts
 * in the production container. Zero/missing/clipped glyphs fail before upload. */
export async function measureFeed(title:string,sub:string,kicker?:string):Promise<LayoutFrame>{
 const {monogramSvg,lowerThirdSvg}=await import("./brand");
 const {socialLayout}=await import("./social-layout");
 const l=socialLayout(1080,1350),textSvg=lowerThirdSvg(1080,1350,title,sub,kicker);
 return measureLayout({surface:"feed",width:1080,height:1350,logo:Buffer.from(monogramSvg({height:l.logoHeight})),text:Buffer.from(textSvg),logoLeft:l.left,logoTop:l.logoTop,textSvg});
}

/** The reel's own plate: Z. upper left and the name lower left on the
 * portrait grid, clear of Instagram's footer and the sticker zone. */
export async function measurePortrait(title:string,sub?:string,kicker?:string):Promise<LayoutFrame>{
 const {monogramSvg,lowerThirdSvg}=await import("./brand");
 const {socialLayout}=await import("./social-layout");
 const l=socialLayout(1080,1920),textSvg=lowerThirdSvg(1080,1920,title,sub,kicker);
 return measureLayout({surface:"portrait",width:1080,height:1920,logo:Buffer.from(monogramSvg({height:l.logoHeight})),text:Buffer.from(textSvg),logoLeft:l.left,logoTop:l.logoTop,textSvg});
}

/** The reel's profile cover: the feed frame translated into the centred
 * 4:5 window of a 1080×1920 cover, so the grid tile shows it whole. */
export async function measureReelCover(title:string,sub?:string,kicker?:string):Promise<LayoutFrame>{
 const {monogramSvg,lowerThirdSvg}=await import("./brand");
 const {reelCoverLayout}=await import("./social-layout");
 const l=reelCoverLayout(),textSvg=lowerThirdSvg(1080,1350,title,sub,kicker);
 return measureLayout({surface:"reel-cover",width:1080,height:1920,logo:Buffer.from(monogramSvg({height:l.logoHeight})),text:Buffer.from(textSvg),logoLeft:l.left,logoTop:l.logoTop,textSvg,textTop:l.cropTop});
}
