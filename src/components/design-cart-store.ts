import {migratePetalsLine} from "../brand/review/petals-legacy";
export type Dimensions={width:number;height:number};
export type Line={slug:string;name:string;size:string;artworkUrl?:string;sku?:string;qty:number;currency:"INR"|"USD";amount:number|null;crop?:import("@/lib/visualizer").CropData;dimensions?:Dimensions;indiaRate?:number;wallpaper?:boolean;stickersOnly?:boolean};
const key="mimipip.design-cart.v1";
export const validQuantity=(n:number)=>Number.isInteger(n)&&n>=1&&n<=99;
export const validLength=(n:number)=>Number.isFinite(n)&&n>0&&n<=100000;
export function wallpaperPrice(d:Dimensions, rate=60){return Math.round(d.width*d.height/929.0304*rate*100)/100}
function validLine(l:Line){
 return l&&typeof l.slug==="string"&&typeof l.name==="string"&&typeof l.size==="string"&&validQuantity(l.qty)
 &&["INR","USD"].includes(l.currency)&&(l.amount===null||Number.isFinite(l.amount)&&l.amount>=0)
 &&(!l.dimensions||validLength(l.dimensions.width)&&validLength(l.dimensions.height));
}
export function readLines():Line[]{
 const raw=localStorage.getItem(key);
 if(!raw)return [];
 const lines=JSON.parse(raw);
 if(!Array.isArray(lines)||!lines.every(validLine))throw new Error("Invalid cart");
 const migrated = (lines as Line[]).map(migratePetalsLine);
 if (migrated.some((line,i)=>line!==lines[i])) localStorage.setItem(key,JSON.stringify(migrated));
 return migrated;
}
export function saveLines(lines:Line[]){
 if(!lines.every(validLine))throw new Error("Invalid cart selection");
 localStorage.setItem(key,JSON.stringify(lines));
 window.dispatchEvent(new Event("mimipip-cart"));
}
export function addLine(lines:Line[],line:Line):Line[]{
 if(!validLine(line))throw new Error("Invalid selection");
 const index=lines.findIndex(l=>l.slug===line.slug&&l.size===line.size&&l.currency===line.currency&&JSON.stringify(l.crop)===JSON.stringify(line.crop));
 if(index<0)return [...lines,line];
 const qty=lines[index].qty+line.qty;
 if(!validQuantity(qty))throw new Error("Select up to 99 per design and size.");
 return lines.map((l,i)=>i===index?{...line,qty}:l);
}
