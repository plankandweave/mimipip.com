import {ahimsaCarouselSources} from './ahimsa-carousel';

export function preparedCarouselIdea(s: {status:string;channel:string;kind:string;caption?:string|null;handle?:string|null;art?:Record<string,unknown>}):boolean {
  if(s.status!=='idea'||s.channel!=='instagram'||s.kind!=='carousel'||!s.caption?.trim())return false;
  try{return ahimsaCarouselSources(s.art?.native_ahimsa_carousel_sources)[0].handle===s.handle;}catch{return false;}
}

export function preparedCarouselReviewLocked(row:{status:string;approved_at?:string|null;regenerate_requested_at?:string|null}):boolean{
 return !!row.approved_at || (!row.regenerate_requested_at && ['queued','approved','published','skipped'].includes(row.status));
}
export function preparedCarouselCompletedState(current:string,outcome?:string):string{
 return current==='idea'&&outcome==='queued'?'planned':current;
}

/** CAS is supplied by the database; concurrent requests never both render. */
export async function withPreparedCarouselLease<T>(claim:()=>Promise<boolean>,run:()=>Promise<T>,release:()=>Promise<void>):Promise<T|null>{
  if(!await claim())return null;
  try{return await run();}finally{await release();}
}
