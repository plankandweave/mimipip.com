import {createHash} from "node:crypto";
import {fetchMediaAware} from "../r2-media";
import {layoutHold,layoutReceipt,requiresLayoutCheck} from "./layout-check";
/** Verify actual hosted bytes again at approval AND immediately before publish. */
export async function verifyLayoutFiles(art:Record<string,unknown>|null|undefined,media:string[]|null,cover?:string|null,required=false,fetcher:typeof fetchMediaAware=fetchMediaAware):Promise<string|null>{
  const hold=layoutHold(art,media,cover,required);if(hold||(!required && !requiresLayoutCheck(art)))return hold;
  const assets=layoutReceipt(art)!.assets;
  const urls=[...new Set([...(media??[]),...(cover?[cover]:[])])];
  for(const url of urls){
    const asset=assets.find(a=>a.url===url)!;
    try{
      // Own-zone HTTP fetches fail in Workers; read the same object via MEDIA_R2.
      const res=await fetcher(url,{redirect:"error",signal:AbortSignal.timeout(30_000)});
      if(!res.ok)throw Error(`HTTP ${res.status}`);
      const bytes=await res.arrayBuffer();
      if(createHash("sha256").update(Buffer.from(bytes)).digest("hex")!==asset.sha256) return "Export bytes changed after layout measurement; release blocked.";
    }catch{return "Measured export could not be verified; release blocked.";}
  }
  return null;
}
