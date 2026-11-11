'use client';
import {useEffect} from 'react';
/** External consent controls may touch the footer only after React commits it. */
export function StorefrontReady(){
 useEffect(()=>{
  (window as Window & {__mimipipHydrated?:boolean}).__mimipipHydrated=true;
  window.dispatchEvent(new Event('mimipip:hydrated'));
 },[]);
 return null;
}
