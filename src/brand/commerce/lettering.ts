import { NAME_FEE } from '@/lib/pricing';
import { overlayPlacementError, textOverlaySchema } from '@/lib/text-overlay';
import type { CropData } from '@/lib/visualizer';

/** The original name-cloud charge is once per configured line, not per copy.
 * Quotes are included. Never trust a fee or name separately from the artwork. */
export function pricedLettering(crop:CropData|undefined,widthCm:number,heightCm:number,countryCode:string) {
 if (!crop?.textOverlay) {
  if (crop?.personalisation) throw new Error('Please approve the name cloud preview.');
  return undefined;
 }
 const overlay=textOverlaySchema.parse(crop.textOverlay);
 const problem=overlayPlacementError(overlay,widthCm,heightCm,crop.doors);
 if(problem)throw new Error(problem);
 if(!crop.approval?.approvedAt)throw new Error('Please approve the lettering on your measured wall.');
 const fee=overlay.kind==='cloud'?NAME_FEE:0;
 if(fee && countryCode!=='IN')throw new Error('Please contact Mimi Pip for a name-cloud price for overseas delivery.');
 return {overlay,fee,personalisation:fee?{childName:overlay.text,fee}:null};
}
