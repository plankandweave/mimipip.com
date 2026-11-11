import {priceCart} from './checkout';
import {artworkId,CUSTOM_WALLPAPER,type CustomArts} from './custom-services';
/** Neither a rejected line nor a client URL may reach the private-file signer. */
export async function customCartImage(line:any,assets:CustomArts,sign:(ref:string)=>Promise<string|null>){
 if(line.slug!==CUSTOM_WALLPAPER)return undefined;
 const quote=priceCart([line],'IN',assets);
 if('refused'in quote)return null;
 const asset=assets[artworkId(line.crop)??''];
 return asset?sign(asset.art):null;
}
