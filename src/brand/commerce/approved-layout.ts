import { INSTALL_RATE_EX_GST } from '@/lib/pricing';
import { z } from 'zod';
import type { CropData } from '@/lib/visualizer';
import previewArt from './preview-art.json';
import { textOverlaySchema } from '@/lib/text-overlay';
const cm=z.number().finite().min(0).max(3000);
const positiveCm=cm.positive();
const position=z.number().finite().min(0).max(1);
const layout=z.object({
 planningMode:z.literal('full-wall').optional(),
 customArtworkId:z.string().uuid().optional(),
 imageUrl:z.string().max(2048),wallWidthCm:positiveCm,wallHeightCm:positiveCm,
 offsetX:position,offsetY:position,zoom:z.number().finite().min(1).max(8),flipH:z.boolean().optional(),flipV:z.boolean().optional(),
 walls:z.array(positiveCm).max(20).optional(),
 doors:z.array(z.object({widthCm:positiveCm,heightCm:positiveCm,offsetCm:cm,sillCm:cm.optional(),kind:z.literal('headboard').optional()})).max(30).optional(),
 divisions:z.array(cm).max(30).optional(),
 imageAspect:z.number().finite().positive().max(1000).optional(),sourceW:z.number().int().positive().max(100000).optional(),sourceH:z.number().int().positive().max(100000).optional(),
 approval:z.object({approvedAt:z.string().datetime(),panelArrangement:z.string().max(2000)}).nullish(),
 installation:z.object({ratePerSqft:z.number().finite(),total:z.number().finite()}).nullish(),
 personalisation:z.object({childName:z.string().max(180),fee:z.number().finite()}).nullish(),
 textOverlay:textOverlaySchema.nullish(),
 quality:z.object({version:z.number().int(),ppi:z.number().finite(),sourceWidth:z.number().finite(),sourceHeight:z.number().finite(),wallWidthCm:z.number().finite(),wallHeightCm:z.number().finite(),zoom:z.number().finite(),band:z.string().max(80),basis:z.string().max(200),checkedAt:z.string().max(80)}).optional(),
 sizeAssumed:z.null().optional(),
 concept:z.unknown().optional(),
 openingsPlan:z.unknown().optional(),seamless:z.unknown().optional(),bespoke:z.unknown().optional(),
}).strict();
/** Preserve the approved native layout in the durable payment record. Never let
 * an unsupported paid/production option quietly turn into a plain wallpaper. */
export function approvedLayout(raw:unknown,widthCm:number|null,heightCm:number|null,art:string,slug:string):CropData|undefined {
 if(raw==null)return undefined;
 const result=layout.safeParse(raw);
 if(!result.success)throw new Error('Please reopen this design and check its wall layout.');
 const c=result.data;
 const preview=(previewArt as Record<string,string>)[slug];
 const approvedSources=[art,preview,preview?'https://mimipip.com'+preview:undefined].filter(Boolean);
 if(slug==='custom-wallpaper' && c.customArtworkId && /^https:\/\/qrtznwnhuzkpynjetygg\.supabase\.co\/storage\/v1\/object\/(public|sign)\/mimipip-print-files\//.test(c.imageUrl)){
  const a=new URL(art), b=new URL(c.imageUrl);
  if(a.pathname.replace('/public/','/sign/')===b.pathname.replace('/public/','/sign/'))c.imageUrl=art;
 }
 if(!approvedSources.includes(c.imageUrl))throw new Error('This uploaded artwork needs its own print approval. Please reopen the catalogue design or contact MimiPip.');
 if(c.wallWidthCm!==widthCm||c.wallHeightCm!==heightCm)throw new Error('The approved layout must match your wall dimensions.');
 if(c.walls?.length&&Math.abs(c.walls.reduce((a,b)=>a+b,0)-c.wallWidthCm)>.05)throw new Error('Check the widths of your walls.');
 if(c.doors?.some(d=>d.offsetCm+d.widthCm>c.wallWidthCm+.05||(d.sillCm??0)+d.heightCm>c.wallHeightCm+.05)||c.divisions?.some(d=>d>c.wallWidthCm))throw new Error('Keep wall markings inside the wall.');
 if(c.installation && (c.installation.ratePerSqft!==INSTALL_RATE_EX_GST || c.installation.total<=0))throw new Error('Please select installation again to see its current price.');
 if(c.openingsPlan||c.seamless||c.bespoke||c.concept||(!c.planningMode&&((c.walls?.length??0)>1||(c.doors?.length??0)>0||(c.divisions?.length??0)>0)))throw new Error('This customised layout needs our team to confirm fulfilment before payment. Please contact MimiPip.');
 return {...c,imageUrl:art} as CropData;
}
