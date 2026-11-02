"use client";

import {useEffect,useState} from "react";
import {readLines} from "./design-cart-store";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";

export function CartNavIcon() {
  const cart = useCart();
  const [localCount,setCount]=useState(0);
  useEffect(()=>{
    if(process.env.NEXT_PUBLIC_MIMIPIP_LOCAL_REVIEW!=="1")return;
    const refresh=()=>{try{setCount(readLines().reduce((sum,item)=>sum+item.qty,0))}catch{setCount(0)}};
    refresh();
    const events=["storage","mimipip-cart","pageshow"];
    events.forEach(e=>window.addEventListener(e,refresh));
    return ()=>events.forEach(e=>window.removeEventListener(e,refresh));
  },[]);
  const count=process.env.NEXT_PUBLIC_MIMIPIP_LOCAL_REVIEW==="1"?localCount:cart.count;
  return (
    <Link
      href="/cart"
      aria-label={count ? `Cart (${count})` : "Cart"}
      className="relative grid h-10 w-10 place-items-center rounded-full text-charcoal transition-colors hover:bg-wash"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M6 8h12l-1 12H7L6 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-charcoal px-1 text-[0.6rem] font-bold text-surface">
          {count}
        </span>
      )}
    </Link>
  );
}
