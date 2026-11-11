import {z} from 'zod';
import {marketGoodsFromInr} from '../../lib/markets';
export const CUSTOM_WALLPAPER='custom-wallpaper';
export const BESPOKE_SERVICE='bespoke-customisation';
export const designBriefSchema=z.object({note:z.string().trim().min(3).max(500),forHandle:z.string().max(160).optional(),forTitle:z.string().max(200).optional()}).strict();
export type DesignBrief=z.infer<typeof designBriefSchema>;
export type CustomArt={art:string;material:'self_adhesive';materialSlug:'self-adhesive-vinyl';width:number;height:number;id:string};
export type CustomArts=Record<string,CustomArt>;
export const bespokeMinor=(country:string)=>Math.round(marketGoodsFromInr(1000,country)*100);
export function artworkId(raw:unknown):string|null {
 const id=(raw as {customArtworkId?:unknown}|null)?.customArtworkId;
 return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)?id:null;
}
